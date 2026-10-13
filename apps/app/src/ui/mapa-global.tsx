import React from 'react'
import { useNavigate } from 'react-router-dom'
import type { Core, NodeSingular } from 'cytoscape'
import { useServices, type UiGraphSubgraph } from '../composition-root.js'
import { Breadcrumbs, CategoriasAccesibles, CytoscapeCanvas, EnlacesAccesibles, elementsDelMapa, posicionesDeVariante } from './mapa-global-piezas.js'

/**
 * Mapa global del conocimiento con agregación por categoría (NET-HW-036, §13.2):
 * nodos = categorías (con conteo de dispositivos), aristas = relaciones
 * device-device agregadas entre categorías. Click en un nodo → explorador.
 * El cálculo de posiciones vive en `mapa-global-logica.ts` y las tablas
 * accesibles en `mapa-global-tablas.tsx`.
 */
export function MapaGlobal(): React.JSX.Element {
  const navegar = useNavigate()
  const [subgrafo, setSubgrafo] = React.useState<UiGraphSubgraph | undefined>()
  const [error, setError] = React.useState<string | undefined>()
  const [cy, setCy] = React.useState<Core | null>(null)
  // `revision` cambia cuando el warmezo HTTP reemplaza el demo por el dataset real
  // (F8B: 6 devices → 330). Re-ejecuta `mapaGlobal()` con el dataset actualizado.
  const revision = useServices((s) => s.revision)
  // Contador de variantes de ordenación: cada clic en Reordenar gira los anillos.
  const [variante, setVariante] = React.useState(0)

  React.useEffect(() => {
    void (async () => {
      try {
        const { graph } = useServices.getState().services
        setSubgrafo(await graph.mapaGlobal())
        setError(undefined)
      } catch (err) {
        // Carga del mapa fallida: se registra y se comunica (nunca spinner eterno).
        console.error('[ERROR] no se pudo cargar el mapa global', { err })
        setError(err instanceof Error ? err.message : String(err))
      }
    })()
  }, [revision])

  // Memoizado: CytoscapeCanvas recrea la instancia cuando `elements` cambia de
  // identidad; construirlo inline en cada render destruía y recreaba el grafo.
  const elements = React.useMemo(() => elementsDelMapa(subgrafo), [subgrafo])

  const alPulsarNodo = React.useCallback(
    (id: string) => {
      if (id.startsWith('category:')) navegar(`/explore?cat=${id.slice('category:'.length)}`)
    },
    [navegar],
  )

  const reordenar = React.useCallback(() => {
    if (!cy || !subgrafo) return
    const siguiente = variante + 1
    setVariante(siguiente)
    const pos = posicionesDeVariante(subgrafo, siguiente)
    cy.layout({
      name: 'preset',
      // Los typings exigen (nodeid: string) pero Cytoscape invoca con el nodo.
      positions: (node: string | NodeSingular) => pos.get(typeof node === 'string' ? node : node.id()) ?? { x: 350, y: 230 },
      animate: true,
      animationDuration: 500,
      fit: true,
      padding: 40,
    }).run()
  }, [cy, subgrafo, variante])

  if (error) return <p className="empty-state" role="alert">No se pudo cargar el mapa global: {error}</p>
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
          onClick={reordenar}
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
          <CategoriasAccesibles subgrafo={subgrafo} />
          <EnlacesAccesibles subgrafo={subgrafo} />
        </div>
      </details>
    </section>
  )
}
