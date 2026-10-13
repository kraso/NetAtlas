/**
 * Lógica de persistencia del layout del visor (NET-HW-033 + F4 refinamiento),
 * extraída de `topology-layout.ts` para mantener el hook por debajo del límite
 * de 200 líneas (§Convenciones).
 *
 * Las funciones no usan React: reciben el store y sus callbacks como
 * parámetros, así que pueden probarse sin contexto de componente (sí tienen
 * efectos: calculan el layout, lo persisten y notifican al llamador).
 */
import type { Topology } from '@netatlas/domain'
import { useTopologiesStore } from '../viewmodels/topologies-store.js'

/** Calcula un layout en worker y aplica el resultado al topo + persiste. */
export async function reordenarLayout(
  topologia: Topology,
  onCambio: (t: Topology) => void,
  alAplicarLayout: () => void,
): Promise<void> {
  const nodosLayout = topologia.nodes.map((n) => ({ id: n.id, layerHint: n.layerHint }))
  const { calcularLayoutEnWorker } = await import('../workers/layout-worker-client.js')
  const posiciones = await calcularLayoutEnWorker({ nodos: nodosLayout, separacionX: 90, separacionY: 130 })
  const porPos = new Map(posiciones.map((p) => [p.id, { x: p.x, y: p.y }]))
  const conLayout = topologia.withLayout(
    topologia.nodes.map((n) => {
      const pos = porPos.get(n.id) ?? { x: 0, y: (n.layerHint ?? 1) * 130 }
      return { nodeId: n.id, x: pos.x, y: pos.y }
    }),
  )
  onCambio(conLayout)
  const layoutNodes = conLayout.nodes.map((n) => {
    if (n.x === undefined || n.y === undefined) {
      throw new Error(`usePersistenciaLayout.reordenar: nodo ${n.id} sin coordenadas después del layout`)
    }
    return { nodeId: n.id, x: n.x, y: n.y }
  })
  await useTopologiesStore.getState().saveLayout(topologia.slug.value, layoutNodes)
  alAplicarLayout()
}

/** Persiste posiciones manuales de arrastre como layout de usuario. */
export function guardarLayout(
  topologia: Topology,
  onCambio: (t: Topology) => void,
  positions: ReadonlyArray<{ id: string; x: number; y: number }>,
): void {
  void useTopologiesStore
    .getState()
    .saveLayout(topologia.slug.value, positions.map((p) => ({ nodeId: p.id, x: p.x, y: p.y })))
    .then(() => useTopologiesStore.getState().bySlug(topologia.slug.value))
    .then((t) => {
      if (t) onCambio(t)
    })
    .catch((error: unknown) => {
      // El guardado es best-effort, pero un fallo no puede pasar en silencio.
      console.warn('[WARN] no se pudo persistir el layout de la topología', { slug: topologia.slug.value, error })
    })
}
