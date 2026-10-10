import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OutboxLocalRepo, ReplicaLocalRepo } from '../src/viewmodels/sync-repos-local.js'

/**
 * Los adaptadores in-memory validan lo que leen de localStorage: JSON roto o
 * filas con forma inesperada no se tratan como datos del contrato (se registra
 * y se descarta/usa respaldo), en lugar de fallar más tarde en un .map().
 */
const claveOutbox = 'netatlas.sync.outbox.v1'
const claveReplica = 'netatlas.sync.replica.v1'

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
})
