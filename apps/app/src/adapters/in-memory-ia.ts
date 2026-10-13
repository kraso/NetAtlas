import { crearClienteIA } from '@netatlas/domain'
import type { RespuestaIA } from '@netatlas/domain'
import type { InMemoryDataset } from './in-memory-tipos.js'
import { ToolContextDemo } from './in-memory-ia-contexto.js'

/**
 * Implementa el contrato UiAssistantRepo sobre el demo: el mismo cliente IA
 * del dominio (crearClienteIA) con un ToolContext que lee el dataset
 * in-memory. El flag `ai.enabled` es off por defecto (§21.4) y se persiste.
 */

const K_AI_ENABLED = 'netatlas.ai.enabled'

/** Repositorio de asistente demo: cliente IA + flag persistido (off por defecto). */
export class UiAssistantRepoDemo implements UiAssistantRepoLike {
  private readonly port: { ask(p: { texto: string }): Promise<RespuestaIA> }

  constructor(data: InMemoryDataset) {
    this.port = crearClienteIA(new ToolContextDemo(data)) as { ask(p: { texto: string }): Promise<RespuestaIA> }
  }

  async ask(texto: string): Promise<RespuestaIA> {
    return this.port.ask({ texto })
  }

  enabled(): boolean {
    try {
      return localStorage.getItem(K_AI_ENABLED) === 'on'
    } catch {
      return false
    }
  }

  setEnabled(on: boolean): void {
    try {
      if (on) localStorage.setItem(K_AI_ENABLED, 'on')
      else localStorage.removeItem(K_AI_ENABLED)
    } catch {
      // Sin almacenamiento: el flag no persiste pero no falla.
    }
  }
}

/** Tipo estructural del contrato UiAssistantRepo (evita import cíclico). */
export interface UiAssistantRepoLike {
  ask(texto: string): Promise<RespuestaIA>
  enabled(): boolean
  setEnabled(on: boolean): void
}
