import { create } from 'zustand'

/**
 * Historial de ruta (NET-HW-025) — seguimiento de la navegación del usuario
 * para el panel contextual y las migas relacionales.
 */

export interface RastroPaso {
  readonly titulo: string
  readonly ruta: string
}

interface HistoriaState {
  readonly pasos: readonly RastroPaso[]
  registrar: (titulo: string, ruta: string) => void
  retroceder: () => string | undefined
}

const MAX_PASOS = 20

export const useHistoriaStore = create<HistoriaState>((set, get) => ({
  pasos: [],

  registrar: (titulo, ruta) => {
    const actuales = get().pasos
    // Evita pasos consecutivos iguales (recarga/efecto)
    const ultimo = actuales[actuales.length - 1]
    if (ultimo && ultimo.ruta === ruta) return
    const siguientes = [...actuales, { titulo, ruta }].slice(-MAX_PASOS)
    set({ pasos: siguientes })
  },

  retroceder: () => {
    const actuales = get().pasos
    if (actuales.length < 2) return undefined
    const anteriores = actuales.slice(0, -1)
    const destino = anteriores[anteriores.length - 1]?.ruta
    set({ pasos: anteriores })
    return destino
  },
}))