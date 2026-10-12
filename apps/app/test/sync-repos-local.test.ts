import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OutboxLocalRepo, ReplicaLocalRepo } from '../src/viewmodels/sync-repos-local.js'

/**
 * Los adaptadores in-memory validan lo que leen de localStorage: JSON roto o
 * filas con forma inesperada no se tratan como datos del contrato (se registra
 * y se descarta/usa respaldo), en lugar de fallar más tarde en un .map().
 */
const claveOutbox = 'netatlas.sync.outbox.v1'
const claveReplica = 'netatlas.sync.replica.v1'

/** Fila de réplica válida; el test varía solo la versión a probar. */
const filaReplica = {
  slug: 'sw-a',
  name: 'Switch A',
  manufacturerSlug: 'acme',
  categoryCode: 'CAT-RED',
  lifecycleStatus: 'current',
  updatedAt: '2025-01-01',
  version: 1,
}

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('adaptadores locales de sincronización (localStorage validado)', () => {
  it('JSON ilegible en la outbox → respaldo vacío y warn con contexto', async () => {
    localStorage.setItem(claveOutbox, '{no-es-json')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const repo = new OutboxLocalRepo()
    expect(await repo.pendientes()).toEqual([])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('JSON ilegible'), expect.objectContaining({ key: claveOutbox }))
  })

  it('fila con forma inválida en la outbox → se descarta y se registra', async () => {
    const valida = {
      id: 'a', tipo: 'nota', entidad: 'device:x', autor: 'u', payload: {},
      createdAt: '2025-01-01', revision: 1, status: 'pendiente',
    }
    localStorage.setItem(claveOutbox, JSON.stringify([valida, { id: 'rota' }]))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const repo = new OutboxLocalRepo()
    const pendientes = await repo.pendientes()
    expect(pendientes).toHaveLength(1)
    expect(pendientes[0]?.id).toBe('a')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('forma inválida'), expect.objectContaining({ descartadas: 1 }))
  })

  it('fila con revision < 1 no pasa la validación del constructor del dominio', async () => {
    localStorage.setItem(
      claveOutbox,
      JSON.stringify([{ id: 'x', tipo: 'nota', entidad: 'device:x', autor: 'u', payload: {}, createdAt: '2025-01-01', revision: 0, status: 'pendiente' }]),
    )
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await new OutboxLocalRepo().pendientes()).toHaveLength(0)
  })

  it('lista no esperada en la réplica → respaldo y warn; nunca versiones inventadas', async () => {
    localStorage.setItem(claveReplica, JSON.stringify({ slug: 'sw-a', version: 9 }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const replica = new ReplicaLocalRepo()
    expect(await replica.version()).toBe(0)
    expect(await replica.count()).toBe(0)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('lista JSON'), expect.objectContaining({ key: claveReplica }))
  })

  it('una fila de réplica sin campos del contrato no cuenta como replicada', async () => {
    localStorage.setItem(
      claveReplica,
      JSON.stringify([{ slug: 'sw-a', version: 3, name: 'incompleto' }]),
    )
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const replica = new ReplicaLocalRepo()
    expect(await replica.count()).toBe(0)
  })

  it('una versión que no es un entero no negativo no entra a la réplica', async () => {
    localStorage.setItem(
      claveReplica,
      JSON.stringify([
        { ...filaReplica, version: Number.NaN },
        { ...filaReplica, version: Number.POSITIVE_INFINITY },
        { ...filaReplica, version: 1.5 },
        { ...filaReplica, version: -1 },
      ]),
    )
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const replica = new ReplicaLocalRepo()
    expect(await replica.count()).toBe(0)
    expect(await replica.version()).toBe(0)
  })

  it('si el almacenamiento rechaza la escritura, encolar rompe y no da la nota por guardada', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cuota agotada')
    })
    const repo = new OutboxLocalRepo()
    await expect(
      repo.enqueue({
        id: 'n1',
        tipo: 'nota',
        entidad: 'device:x',
        autor: 'u',
        payload: {},
        createdAt: '2025-01-01',
        revision: 1,
        status: 'pendiente',
      }),
    ).rejects.toThrow(/No se pudo guardar la aportación/)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('no se pudo persistir'),
      expect.objectContaining({ key: claveOutbox }),
    )
  })
})
