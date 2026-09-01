import { describe, expect, it } from 'vitest'
import { crearOutboxEntry, sincronizar } from '../src/index.js'
import type { OutboxEntry, OutboxRepository, ReplicaRepository, SyncDevice, SyncServer } from '../src/index.js'

/** Outbox en memoria para el test. */
class OutboxMem implements OutboxRepository {
  items: OutboxEntry[] = []
  async enqueue(entry: OutboxEntry): Promise<void> {
    this.items = [...this.items, entry]
  }
  async pendientes(): Promise<readonly OutboxEntry[]> {
    return this.items.filter((i) => i.status === 'pendiente')
  }
  async marcarEnviadas(ids: readonly string[]): Promise<void> {
    this.items = this.items.map((i) => (ids.includes(i.id) ? { ...i, status: 'enviada' } : i))
  }
  async ultimaRevision(): Promise<number> {
    return Math.max(0, ...this.items.map((i) => i.revision))
  }
  async ultimaModificacionEntidad(_entidad: string): Promise<string | undefined> {
    return undefined
  }
}

class ReplicaMem implements ReplicaRepository {
  devices = new Map<string, SyncDevice>()
  async version(): Promise<number> {
    return Math.max(0, ...[...this.devices.values()].map((d) => d.version))
  }
  async aplicarDevices(dispositivos: readonly SyncDevice[]): Promise<{ aplicados: number; version: number }> {
    let aplicados = 0
    for (const d of dispositivos) {
      const actual = this.devices.get(d.slug)
      if (!actual || d.version > actual.version) {
        this.devices.set(d.slug, d)
        aplicados++
      }
    }
    return { aplicados, version: await this.version() }
  }
  async count(): Promise<number> {
    return this.devices.size
  }
}

function dispositivo(slug: string, version: number): SyncDevice {
  return { slug, name: slug, manufacturerSlug: 'm', categoryCode: 'CAT-SWT', lifecycleStatus: 'current', updatedAt: '2025-01-01', version }
}

const snaphost2Device = [
  dispositivo('sw-a', 1),
  dispositivo('sw-b', 1),
]

describe('sincronizar (F8A, NET-HW-063) — orquestación pura', () => {
  it('pull inicial puebla la réplica (LWW por versión)', async () => {
    const outbox = new OutboxMem()
    const replica = new ReplicaMem()
    const servidor: SyncServer = {
      serverVersion: async () => 2,
      pullSnapshot: async () => snaphost2Device,
      pushContribuciones: async () => [],
    }
    const r = await sincronizar(outbox, servidor, replica)
    expect(r.replicados).toBe(2)
    expect(r.versionReplica).toBe(1)
    expect(r.contribucionesPendientes).toBe(0)
  })

  it('LWW: la versión mayor gana y no regresan dispositivos peores', async () => {
    const outbox = new OutboxMem()
    const replica = new ReplicaMem()
    const servidor: SyncServer = {
      serverVersion: async () => 1,
      pullSnapshot: async () => [dispositivo('sw-a', 5)],
      pushContribuciones: async () => [],
    }
    await sync2(outbox, servidor, replica)
    expect(await replica.count()).toBe(1)
    expect((await replica.devices.get('sw-a'))!.version).toBe(5)
  })

  it('push confirma y marca enviadas; sin confirmación la cola persiste', async () => {
    const outbox = new OutboxMem()
    const e = crearOutboxEntry(
      { tipo: 'nota', entidad: 'device:a', autor: 'u', payload: { nota: 'x' }, revision: 1 },
      'id-1', '2025-03-01',
    )
    await outbox.enqueue(e)

    const servidorOk: SyncServer = {
      serverVersion: async () => 0,
      pullSnapshot: async () => [],
      pushContribuciones: async () => ['id-1'],
    }
    const r1 = await sincronizar(outbox, servidorOk, new ReplicaMem())
    expect(r1.contribucionesEnviadas).toBe(1)
    expect(r1.contribucionesPendientes).toBe(0)

    // Servidor que no confirma: la cola queda para el siguiente ciclo.
    const servidorSordo: SyncServer = {
      serverVersion: async () => 0,
      pullSnapshot: async () => [],
      pushContribuciones: async () => [],
    }
    const outbox2 = new OutboxMem()
    await outbox2.enqueue(
      crearOutboxEntry({ tipo: 'nota', entidad: 'device:b', autor: 'u', payload: { nota: 'y' }, revision: 1 }, 'id-2', '2025-03-01'),
    )
    const r2 = await sincronizar(outbox2, servidorSordo, new ReplicaMem())
    expect(r2.contribucionesEnviadas).toBe(0)
    expect(r2.contribucionesPendientes).toBe(1)
  })

  it('sin red (fallo de pull y push) la réplica conserva versión y la cola queda', async () => {
    const outbox = new OutboxMem()
    await outbox.enqueue(
      crearOutboxEntry({ tipo: 'nota', entidad: 'device:a', autor: 'u', payload: { nota: 'z' }, revision: 1 }, 'id-3', '2025-03-01'),
    )
    const replica = new ReplicaMem()
    const servidorCaido: SyncServer = {
      serverVersion: async () => { throw new Error('red caída') },
      pullSnapshot: async () => { throw new Error('red caída') },
      pushContribuciones: async () => { throw new Error('red caída') },
    }
    const r = await sincronizar(outbox, servidorCaido, replica)
    expect(r.replicados).toBe(0)
    expect(r.contribucionesEnviadas).toBe(0)
    expect(r.contribucionesPendientes).toBe(1)
    expect(r.versionReplica).toBe(0)
  })
})

async function sync2(o: OutboxRepository, s: SyncServer, r: ReplicaRepository): Promise<ReturnType<typeof sincronizar>> {
  return sincronizar(o, s, r)
}