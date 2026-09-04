import React from 'react'
import { useNavigate, Link } from 'react-router-dom'
import type { Core } from 'cytoscape'
import { useServices } from '../composition-root.js'
import type { UiGraphSubgraph } from '../composition-root.js'
import { CytoscapeCanvas } from './cytoscape-canvas.js'
import { Breadcrumbs } from './breadcrumbs.js'

/**
 * Mapa global del conocimiento con agregación por categoría (NET-HW-036, §13.2):
 * nodos = categorías (con conteo de dispositivos), aristas = relaciones
 * device-device agregadas entre categorías. Click en un nodo → explorador.
 */
export function MapaGlobal(): React.JSX.Element {
  const navegar = useNavigate()
  const [subgrafo, setSubgrafo] = React.useState<UiGraphSubgraph | undefined>()
  const [cy, setCy] = React.useState<Core | null>(null)
  // `revision` cambia cuando el warmezo HTTP reemplaza el demo por el dataset real
  // (F8B: 6 devices → 330). Re-ejecuta `mapaGlobal()` con el dataset actualizado.
  const revision = useServices((s) => s.revision)
  // Contador de variantes de ordenacion: cada clic en Reordenar gira los anillos
  // con angulo aureo y alterna el sentido (siempre una disposicion ordenada).
  const [variante, setVariante] = React.useState(0)

  React.useEffect(() => {
    void (async () => {
      const { graph } = useServices.getState().services
      setSubgrafo(await graph.mapaGlobal())
    })()
  }, [revision])

  // Memoizado: CytoscapeCanvas recrea la instancia cuando `elements` cambia de
  // identidad. Construirlo inline en cada render (mas setCy de onReady) destruia
  // y recreaba el grafo en bucle: parpadeo e interaccion imposible.
  // Declarado antes del return temprano (reglas de hooks).
  // Posiciones iniciales ordenadas (anillos por tamano): la categoria con mas
  // dispositivos al centro y el resto en anillos concentricos. Determinista:
  // el mismo dataset siempre pinta el mismo mapa.
  const elements = React.useMemo(() => {
    const nodos = [...(subgrafo?.nodes ?? [])].sort((a, b) => conteoDe(b.label) - conteoDe(a.label))
    const posiciones = calcularAnillos(nodos, 0)
    return [
      ...nodos.map((n) => ({
        data: { id: n.id, label: n.label, tipo: n.type },
        position: posiciones.get(n.id),
      })),
      ...(subgrafo?.edges.map((e) => ({ data: { id: e.id, source: e.source, target: e.target, label: e.predicate } })) ?? []),
    ]
  }, [subgrafo])
  const alPulsarNodo = React.useCallback(
    (id: string) => {
      if (id.startsWith('category:')) navegar(`/explore?cat=${id.slice('category:'.length)}`)
    },
    [navegar],
  )

  if (!subgrafo) return <p role="status">Calculando mapa global…</p>

  return (
    <section aria-labelledby="titulo-mapa-global">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Topologías', to: '/topologies' },
          { label: 'Mapa global' },
        ]}
      />
      <h1 id="titulo-mapa-global">Mapa global del conocimiento</h1>
      <p className="guia-tecnica">
        Todo el catálogo agregado por categoría: cada nodo es una macrocategoría con su número de
        dispositivos; las aristas cuentan las relaciones device↔device entre categorías. Haz clic en un
        nodo para ver sus dispositivos en el explorador.
      </p>

      <div className="zoom-toolbar" role="toolbar" aria-label="Controles de zoom, pan y layout del mapa">
        <button
          type="button"
          aria-label="Acercar"
          title="Acercar (Ctrl+ / rueda)"
          data-testid="zoom-in"
          disabled={!cy}
          onClick={() => {
            if (cy) cy.zoom({ level: cy.zoom() * 1.25, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } })
          }}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Alejar"
          title="Alejar (Ctrl- / rueda)"
          data-testid="zoom-out"
          disabled={!cy}
          onClick={() => {
            if (cy) cy.zoom({ level: cy.zoom() * 0.8, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } })
          }}
        >
          −
        </button>
        <button
          type="button"
          aria-label="Ajustar a pantalla"
          title="Ajustar a pantalla (fit)"
          data-testid="zoom-fit"
          disabled={!cy}
          onClick={() => { if (cy) cy.fit() }}
        >
          ⌂
        </button>
        <button
          type="button"
          aria-label="Reordenar (variante ordenada)"
          title="Reordenar (variante de la disposicion inicial)"
          data-testid="layout-relayout"
          disabled={!cy}
          onClick={() => {
            if (!cy || !subgrafo) return
            const v = variante + 1
            setVariante(v)
            const nodos = [...subgrafo.nodes].sort((a, b) => conteoDe(b.label) - conteoDe(a.label))
            const pos = calcularAnillos(nodos, v)
            cy.layout({
              name: 'preset',
              positions: (node: any) => pos.get(typeof node === 'string' ? node : node.id()) ?? { x: 350, y: 230 },
              animate: true,
              animationDuration: 500,
              fit: true,
              padding: 40,
            }).run()
          }}
        >
          ↻
        </button>
      </div>

      <CytoscapeCanvas
        elements={elements}
        layout="preset"
        onReady={setCy}
        onTapNode={alPulsarNodo}
        ariaLabel={`Mapa global: ${subgrafo.nodes.length} categorías y ${subgrafo.edges.length} relaciones entre categorías`}
        testId="canvas-mapa-global"
      />

      <details className="guia-tecnica">
        <summary>Alternativa accesible (categorías y enlaces como tabla)</summary>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 8 }}>
          <table className="tabla-specs">
            <thead>
              <tr>
                <th scope="col">Categoría</th>
                <th scope="col">Dispositivos</th>
              </tr>
            </thead>
            <tbody>
              {subgrafo.nodes.map((n) => {
                const [label, conteo] = separarConteo(n.label)
                return (
                  <tr key={n.id}>
                    <td>
                      <Link to={`/explore?cat=${n.id.slice('category:'.length)}`}>{label}</Link>
                    </td>
                    <td className="mono">{conteo}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <table className="tabla-specs">
            <thead>
              <tr>
                <th scope="col">Entre categorías</th>
                <th scope="col">Enlaces</th>
              </tr>
            </thead>
            <tbody>
              {subgrafo.edges.map((e) => (
                <tr key={e.id}>
                  <td className="mono">
                    {e.source.slice('category:'.length)} ↔ {e.target.slice('category:'.length)}
                  </td>
                  <td className="mono">{e.predicate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}

/**
 * Anillos ordenados por tamano (variante N): la categoria mayor al centro y el
 * resto en dos anillos. Cada variante gira los anillos con angulo aureo y alterna
 * el sentido, asi Reordenar siempre produce una disposicion ordenada distinta.
 */
function calcularAnillos(
  nodos: ReadonlyArray<{ readonly id: string }>,
  variante: number,
): Map<string, { x: number; y: number }> {
  const CX = 350
  const CY = 230
  const ANGULO_AUREO = Math.PI * (3 - Math.sqrt(5))
  const giro = variante * ANGULO_AUREO
  const sentido = variante % 2 === 0 ? 1 : -1
  const posiciones = new Map<string, { x: number; y: number }>()
  nodos.forEach((n, i) => {
    if (i === 0) {
      posiciones.set(n.id, { x: CX, y: CY })
    } else {
      const anillo = i <= 8 ? 1 : 2
      const radio = anillo === 1 ? 150 : 265
      const k = anillo === 1 ? i - 1 : i - 9
      const total = anillo === 1 ? Math.min(nodos.length - 1, 8) : nodos.length - 9
      const ang = sentido * ((2 * Math.PI * k) / Math.max(total, 1)) - Math.PI / 2 + giro
      posiciones.set(n.id, { x: CX + radio * Math.cos(ang), y: CY + radio * Math.sin(ang) * 0.72 })
    }
  })
  return posiciones
}

/** Extrae el conteo final «(42)» de la etiqueta para ordenar nodos por tamano. */
function conteoDe(label: string): number {
  const m = /\((\d+)\)\s*$/.exec(label)
  return m ? Number(m[1]!) : 0
}

/** Separa «Nombre (42)» en [Nombre, 42]. */
function separarConteo(label: string): [string, string] {
  const m = /^(.*)\s+\((\d+)\)$/.exec(label)
  return m ? [m[1]!, m[2]!] : [label, '—']
}