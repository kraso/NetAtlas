/**
 * Transporte HTTP del cliente (F8A, §23.4[3]): implementa `SyncServer` del
 * dominio sobre fetch. El cliente NO conoce SQL: habla con la API REST.
 * Cuando no hay red, fetch lanza y `sincronizar()` deja la cola intacta.
 */
import type { OutboxEntry, SyncDevice, SyncServer } from '@netatlas/domain'

export class HttpSyncServer implements SyncServer {
  constructor(
    private readonly baseUrl: string,
    private readonly token?: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async serverVersion(): Promise<number> {
    const r = await this.getJson('/api/snapshot?since=0')
    return Number(r.version ?? 0)
  }

  async pullSnapshot(since: number): Promise<readonly SyncDevice[]> {
    const r = await this.getJson(`/api/snapshot?since=${since}`)
    return (r.dispositivos ?? []) as readonly SyncDevice[]
  }

  async pushContribuciones(entradas: readonly OutboxEntry[]): Promise<readonly string[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/contributions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify({ entradas }),
    })
    if (!res.ok) {
      throw new Error(`servidor rechazó contribuciones (HTTP ${res.status})`)
    }
    const cuerpo = (await res.json()) as { aceptadas?: readonly string[] }
    return cuerpo.aceptadas ?? []
  }

  private async getJson(path: string): Promise<Record<string, unknown>> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`)
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} en ${path}`)
    }
    return (await res.json()) as Record<string, unknown>
  }
}