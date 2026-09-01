/**
 * Escalado de topologías (F4 refinamiento, ADR-0003 / plan §13.1):
 * crecimiento sin degradar el render.
 *
 * EstraTegias:
 *  - Agregación por categoría (>1.500 nodos): colapsa dispositivos en
 *    supernodos por `categoryRole`/capa, manteniendo aristas resumidas y el
 *    conteo por grupo. Render SVG sigue siendo ligero y accesible.
 *  - Modo Canvas (>5.000 nodos): señal de render de alta densidad (listo para
 *    un backend WebGL; el token se usa por el visor para no renderizar SVG).
 *
 * Puro y testeable: no depende de Cytoscape ni de la UI.
 */

export const UMBRAL_AGREGACION = 1_500
export const UMBRAL_CANVAS = 5_000

/** Nodo ligero para el escala de agregación (no entidad, sino grupo). */
export interface NodoAgregado {
  readonly id: string
  readonly tipo: 'dispositivo' | 'grupo'
  /** Conteo de dispositivos reales que agrupa. */
  readonly cantidad: number
  /** Categoría (code) o rol del grupo; undefined en dispositivo suelto. */
  readonly categoria?: string
  /** Capa OSI dominante (promedio de layerHint). */
  readonly capa: number
}

export interface AristaAgregada {
  readonly from: string
  readonly to: string
  readonly cantidad: number
}

export interface TopologiaAgregada {
  readonly nodos: readonly NodoAgregado[]
  readonly aristas: readonly AristaAgregada[]
  /** Nodos reales colapsados (para la tabla accesible). */
  readonly nodosOriginales: number
  readonly esAgregada: boolean
}

export interface NodoFuente {
  readonly id: string
  readonly entityType: 'device' | 'category'
  readonly entitySlug: string
  readonly layerHint?: number | undefined
}

export interface AristaFuente {
  readonly from: string
  readonly to: string
}

/** Devolver la categoría de un dispositivo (slug); sin resolver → sueltos. */
export type ResolverCategoria = (slug: string) => string | undefined

/**
 * Decide el modo de render según el tamaño bruto (ADR-03):
 *  - < UMBRAL_AGREGACION: 'svg' (render normal).
 *  - [UMBRAL_AGREGACION, UMBRAL_CANVAS): 'agregado' (supernodos por categoría).
 *  - >= UMBRAL_CANVAS: 'canvas' (alta densidad, sin SVG).
 */
export function decidirModoRender(n: number): 'svg' | 'agregado' | 'canvas' {
  if (n >= UMBRAL_CANVAS) return 'canvas'
  if (n >= UMBRAL_AGREGACION) return 'agregado'
  return 'svg'
}

/**
 * Agrega la topología bruta en supernodos por categoría.
 * Los dispositivos con categoría conocida se agrupan; los de categoría
 * desconocida (o nodos de tipo category) quedan sueltos. Las aristas se
 * resumen entre grupos (cantidad = enlaces internos)
 * y se descartan los bucles auto-grupo (from === to) por limpieza.
 */
export function agregarTopologia(
  nodos: readonly NodoFuente[],
  aristas: readonly AristaFuente[],
  resolverCategoria: ResolverCategoria,
): TopologiaAgregada {
  const nodosOriginales = nodos.length

  // 1) Mapa nodo original → id agregado.
  const idAgregado = new Map<string, string>()
  const grupos = new Map<string, { categoria?: string; cantidad: number; capaSum: number; capaN: number }>()

  for (const n of nodos) {
    let gid: string
    let categoria: string | undefined
    if (n.entityType === 'category') {
      gid = `grupo:${n.entitySlug}`
      categoria = n.entitySlug
    } else {
      categoria = resolverCategoria(n.entitySlug)
      if (categoria) gid = `grupo:${categoria}`
      else gid = `dispositivo:${n.entitySlug}`
    }
    idAgregado.set(n.id, gid)

    if (gid.startsWith('grupo:')) {
      const g = grupos.get(gid) ?? { categoria, cantidad: 0, capaSum: 0, capaN: 0 }
      g.cantidad++
      if (n.layerHint !== undefined) {
        g.capaSum += n.layerHint
        g.capaN++
      }
      grupos.set(gid, g)
    }
  }

  // 2) Nodos agregados (grupos primero, luego sueltos).
  const nodosAgregados: NodoAgregado[] = []
  const usados = new Set<string>()
  for (const [gid, g] of grupos) {
    nodosAgregados.push({
      id: gid,
      tipo: 'grupo',
      cantidad: g.cantidad,
      categoria: g.categoria,
      capa: g.capaN > 0 ? Math.round(g.capaSum / g.capaN) : 1,
    })
    usados.add(gid)
  }
  // Dispositivos sueltos que no formaron grupo (categoría desconocida).
  for (const n of nodos) {
    const gid = idAgregado.get(n.id)!
    if (usados.has(gid)) continue
    usados.add(gid)
    nodosAgregados.push({
      id: gid,
      tipo: 'dispositivo',
      cantidad: 1,
      capa: n.layerHint ?? 1,
    })
  }

  // 3) Aristas resumidas entre grupos (dirección normalizada).
  interface AcumuladorArista {
    from: string
    to: string
    cantidad: number
  }
  const entre = new Map<string, AcumuladorArista>()
  for (const e of aristas) {
    const a = idAgregado.get(e.from)
    const b = idAgregado.get(e.to)
    if (!a || !b || a === b) continue
    const [x, y] = a < b ? [a, b] : [b, a]
    const k = `${x}|${y}`
    const actual = entre.get(k) ?? { from: x, to: y, cantidad: 0 }
    actual.cantidad++
    entre.set(k, actual)
  }

  return {
    nodos: nodosAgregados,
    aristas: [...entre.values()],
    nodosOriginales,
    esAgregada: nodosOriginales >= UMBRAL_AGREGACION,
  }
}