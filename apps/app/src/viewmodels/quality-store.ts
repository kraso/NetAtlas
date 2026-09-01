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
  cargar: () => Promise<void>
  resolver: (id: number, decision: 'accepted' | 'rejected', autor: string) => Promise<void>
}

export const useQualityStore = create<QualityState>((set, get) => ({
  pendientes: [],
  cargando: false,
  cargar: async () => {
    set({ cargando: true })
    const { quality } = useServices.getState().services
    const [report, pendientes, manifiesto] = await Promise.all([
      quality.report(),
      quality.reconciliacionesPendientes(),
      quality.manifiesto(),
    ])
    set({ report, pendientes, manifiesto, cargando: false })
  },
  resolver: async (id, decision, autor) => {
    const { quality } = useServices.getState().services
    await quality.resolverReconciliacion(id, decision, autor)
    await get().cargar()
  },
}))