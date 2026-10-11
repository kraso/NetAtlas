import React from 'react'
import { useNavigate, type Topology, type Core, CytoscapeCanvas, capasDe, TablaTopologia, construirElementosVisor, exportarDiagrama, resumenVistaAgregada, useFlujoPaquetes, usePersistenciaLayout, useVistaEscala } from './topology-viewer-piezas.js'

/**
 * Visor de topologías (NET-HW-033/035/037): Cytoscape con posiciones
 * persistidas al arrastrar, reordenar en Web Worker, filtros por capa OSI,
 * click→ficha, flujo de paquetes animado, exportación SVG/PNG y alternativa
 * accesible en tabla. El estado y la lógica viven en `topology-*.ts`.
 */

export interface VisorTopologiaProps {
  readonly topologia: Topology
  readonly onCambio: (t: Topology) => void
}

export function VisorTopologia({ topologia, onCambio }: VisorTopologiaProps): React.JSX.Element {
  const navegar = useNavigate()
  const cyRef = React.useRef<Core | undefined>(undefined)
  const [layoutName, setLayoutName] = React.useState<'preset' | 'capas'>('preset')
  const [capas] = React.useState<readonly number[]>(capasDe(topologia))
  const [activas, setActivas] = React.useState<readonly number[]>([])
  const [modoAgregado, setModoAgregado] = React.useState(true)
  const { flujoActivo, origen, ruta, alternarFlujo, onTapNode } = useFlujoPaquetes(topologia, cyRef, navegar)
  const { agregada, modo } = useVistaEscala(topologia)
  const { reordenando, errorReordenado, reordenar, guardarLayout } = usePersistenciaLayout(topologia, onCambio, () => setLayoutName('capas'))

  const elementos = React.useMemo(
    () => construirElementosVisor({ topologia, activas, ruta, modo, agregada, modoAgregado }),
    [topologia, activas, ruta, modo, agregada, modoAgregado],
  )

  const toggleCapa = (num: number): void => {
    setActivas((prev) => (prev.includes(num) ? prev.filter((c) => c !== num) : [...prev, num]))
  }

  const [errorExport, setErrorExport] = React.useState<string | null>(null)

  const exportar = (formato: 'svg' | 'png'): void => {
    const resultado = exportarDiagrama(cyRef.current, topologia.slug.value, formato)
    setErrorExport(resultado.ok ? null : resultado.motivo)
  }

  return (
    <div className="stack">
      <div className="row" role="toolbar" aria-label="Acciones del visor" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button type="button" onClick={() => void reordenar()} disabled={reordenando}>
          {reordenando ? 'Reordenando…' : 'Reordenar (layout por capas)'}
        </button>
        {errorReordenado ? (
          <span className="empty-state" role="alert" data-testid="error-reordenado">
            No se pudo reordenar el diagrama: {errorReordenado}
          </span>
        ) : null}
        {modo !== 'svg' && agregada ? (
          <button type="button" onClick={() => setModoAgregado(!modoAgregado)} aria-pressed={modoAgregado}>
            {modoAgregado
              ? `${resumenVistaAgregada(agregada)}`
              : `Vista agregada (${agregada.nodosOriginales.toLocaleString('es')} nodos → ${agregada.nodos.length} entidades)`}
          </button>
        ) : null}
        {modo === 'canvas' ? (
          <span className="guia-tecnica" role="status">
            Modo Canvas de alta densidad ({topologia.nodes.length.toLocaleString('es')} nodos): render ligero sin SVG.
          </span>
        ) : null}
        <button type="button" onClick={() => exportar('svg')}>Exportar SVG</button>
        <button type="button" onClick={() => exportar('png')}>Exportar PNG</button>
        {errorExport ? (
          <span className="empty-state" role="alert" data-testid="error-export">
            No se pudo exportar el diagrama: {errorExport}
          </span>
        ) : null}
        <button type="button" aria-pressed={flujoActivo} onClick={alternarFlujo}>
          {flujoActivo ? 'Cancelar flujo de paquetes' : 'Simular flujo de paquetes'}
        </button>
        {flujoActivo ? (
          <span className="guia-tecnica" role="status">
            Toca dos nodos para simular el recorrido{origen ? ` (origen: ${origen})` : ''}…
          </span>
        ) : null}
        {ruta.length > 0 ? (
          <span className="mono guia-tecnica" role="status">
            Ruta: {ruta.join(' → ')}
          </span>
        ) : null}
        <span className="guia-tecnica">Arrastra los nodos: el layout se guarda automáticamente.</span>
      </div>

      {capas.length > 0 ? (
        <fieldset aria-label="Filtros por capa OSI" className="card" style={{ margin: 0, padding: '6px 12px' }}>
          <legend style={{ fontSize: 'var(--font-size-xs)', padding: '0 4px' }}>Filtros por capa OSI</legend>
          <div className="row" role="group" aria-label="Capas" style={{ flexWrap: 'wrap' }}>
            {capas.map((num) => (
              <label key={num} className="mono" style={{ fontSize: 'var(--font-size-xs)', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <input type="checkbox" checked={activas.includes(num)} onChange={() => toggleCapa(num)} aria-label={`Capa ${num}`} />
                Capa {num}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <CytoscapeCanvas
        elements={elementos}
        layout={layoutName}
        onTapNode={onTapNode}
        onDragfree={guardarLayout}
        onReady={(cy) => {
          cyRef.current = cy
        }}
        ariaLabel={`Topología ${topologia.name}: ${elementos.length} elementos`}
        testId="canvas-topologia"
      />

      <details className="guia-tecnica">
        <summary>Alternativa accesible (nodos y enlaces como tabla)</summary>
        <TablaTopologia topologia={topologia} />
      </details>
    </div>
  )
}
