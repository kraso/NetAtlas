import { create } from 'zustand'
import { useServices } from '../composition-root.js'
import type { UiQualityReport, UiReconciliationRow } from '../composition-root.js'

/**
 * ViewModel de calidad del dataset (F6, NET-HW-047/049): métricas de cobertura,
 * cola de reconciliación con diff y manifiesto del dataset.
 */

interface QualityState {
  report?: UiQualityReport
  pendientes: readonly UiReconciliationRow[]
  manifiesto?: Record<string, unknown>
  cargando: boolean
  /** Último fallo al cargar o resolver la cola; la vista lo muestra con `role="alert"`. */
  error: string | undefined
  cargar: () => Promise<void>
  resolver: (id: number, decision: 'accepted' | 'rejected', autor: string) => Promise<void>
}

export const useQualityStore = create<QualityState>((set, get) => ({
  pendientes: [],
  cargando: false,
  error: undefined,
  cargar: async () => {
    set({ cargando: true, error: undefined })
    try {
      const { quality } = useServices.getState().services
      const [report, pendientes, manifiesto] = await Promise.all([
        quality.report(),
        quality.reconciliacionesPendientes(),
        quality.manifiesto(),
      ])
      set({ report, pendientes, manifiesto, cargando: false })
    } catch (error) {
      // Sin métricas la página se quedaba en «Sin métricas disponibles», que es
      // falso: el fallo se registra con contexto, se publica y `cargando` cae.
      console.error('[ERROR] no se pudieron cargar las métricas de calidad', { error })
      set({ cargando: false, error: 'No se pudieron cargar las métricas de calidad.' })
    }
  },
  resolver: async (id, decision, autor) => {
    try {
      const { quality } = useServices.getState().services
      await quality.resolverReconciliacion(id, decision, autor)
      await get().cargar()
    } catch (error) {
      // Resolver es la acción que el usuario pidió: se registra y se ve.
      console.error('[ERROR] no se pudo resolver el candidato de la cola', { id, decision, error })
      set({ error: 'No se pudo resolver el candidato de la cola de reconciliación.' })
    }
  },
}))