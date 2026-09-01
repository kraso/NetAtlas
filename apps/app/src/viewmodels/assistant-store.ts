import { create } from 'zustand'
import type { RespuestaIA, CitaIA } from '@netatlas/domain'
import { useServices } from '../composition-root.js'

export interface MensajeChat {
  readonly id: number
  readonly rol: 'user' | 'assistant'
  readonly texto: string
  readonly citas?: readonly CitaIA[]
  readonly herramientas?: readonly { herramienta: string; sinDatos?: boolean }[]
  readonly modo?: RespuestaIA['modo']
}

interface AssistantState {
  mensajes: readonly MensajeChat[]
  /** Flag `ai.enabled` (§21.4) — off por defecto. */
  enabled: boolean
  pensando: boolean
  activar(): void
  desactivar(): void
  /** Relee el flag persistido (tests/recarga con localStorage distinto). */
  sincronizar(): void
  preguntar(texto: string): Promise<void>
  limpiar(): void
}

let nextId = 1

export const useAssistantStore = create<AssistantState>((set, get) => ({
  mensajes: [],
  enabled: useServices.getState().services.asistente.enabled(),
  pensando: false,

  activar() {
    useServices.getState().services.asistente.setEnabled(true)
    set({ enabled: true })
  },

  desactivar() {
    useServices.getState().services.asistente.setEnabled(false)
    set({ enabled: false })
  },

  /** Relee el flag persistido (tests/recarga con localStorage distinto). */
  sincronizar() {
    set({ enabled: useServices.getState().services.asistente.enabled() })
  },

  async preguntar(texto: string) {
    const limpio = texto.trim()
    if (limpio.length === 0 || get().pensando) return
    const userMsg: MensajeChat = { id: nextId++, rol: 'user', texto: limpio }
    set((s) => ({ mensajes: [...s.mensajes, userMsg], pensando: true }))
    try {
      const r: RespuestaIA = await useServices.getState().services.asistente.ask(limpio)
      const asstMsg: MensajeChat = {
        id: nextId++,
        rol: 'assistant',
        texto: r.texto,
        citas: r.citas,
        herramientas: r.herramientas.map((h) => ({ herramienta: h.herramienta, sinDatos: h.sinDatos })),
        modo: r.modo,
      }
      set((s) => ({ mensajes: [...s.mensajes, asstMsg], pensando: false }))
    } catch {
      set((s) => ({
        mensajes: [
          ...s.mensajes,
          { id: nextId++, rol: 'assistant', texto: 'Lo siento: no pude completar la consulta con los datos locales.', modo: 'no-tengo-datos' },
        ],
        pensando: false,
      }))
    }
  },

  limpiar() {
    set({ mensajes: [] })
  },
}))