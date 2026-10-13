import React from 'react'
import { Slug, Topology } from '@netatlas/domain'
import type { TopologyNodeProps } from '@netatlas/domain'
import { useServices } from '../composition-root.js'
import { conNodo, sinNodo, validarYConectar } from './topology-editor-logica.js'

/**
 * Laboratorio-editor (NET-HW-034): crear topologías de usuario, añadir
 * dispositivos por slug y conectar nodos con validación de compatibilidad
 * (la lógica vive en `topology-editor-logica.ts`, pura y testeable).
 */

export interface EditorTopologiaProps {
  readonly topologia: Topology
  readonly onCambio: (t: Topology) => void
  readonly onGuardar: (t: Topology) => Promise<void>
  readonly onCancelar: () => void
}

export function EditorTopologia({ topologia, onCambio, onGuardar, onCancelar }: EditorTopologiaProps): React.JSX.Element {
  const [nombre, setNombre] = React.useState(topologia.name)
  const [busqueda, setBusqueda] = React.useState('')
  const [mensaje, setMensaje] = React.useState<string | undefined>()
  const [origen, setOrigen] = React.useState('')
  const [destino, setDestino] = React.useState('')

  const siguienteX = topologia.nodes.length * 60

  /**
   * Envuelve una acción asíncrona: un rechazo no puede perderse ni dejar la UI
   * muda — se registra y se muestra al usuario.
   */
  const conFalloVisible = (accion: () => Promise<void>): (() => void) => () => {
    void accion().catch((error: unknown) => {
      console.warn('[WARN] el editor de topologías falló', { error })
      setMensaje(error instanceof Error ? error.message : 'No se pudo completar la acción.')
    })
  }

  const añadirDispositivo = async (slugBuscado: string): Promise<void> => {
    const { devices } = useServices.getState().services
    const d = await devices.findBySlug(slugBuscado.trim())
    setBusqueda('')
    if (!d) {
      setMensaje(`Dispositivo «${slugBuscado}» no existe en el catálogo.`)
      return
    }
    if (topologia.nodeById(`device:${d.slug.value}`)) {
      setMensaje(`El dispositivo «${d.slug.value}» ya está en la topología.`)
      return
    }
    setMensaje(undefined)
    onCambio(conNodo(topologia, { entityType: 'device', entitySlug: d.slug.value, x: siguienteX, y: 0 }))
  }

  const quitarNodo = (id: string): void => {
    onCambio(sinNodo(topologia, id))
    setMensaje(undefined)
  }

  const conectar = async (): Promise<void> => {
    const resultado = await validarYConectar({ topologia, origen, destino, services: useServices.getState().services })
    if (!resultado.ok || !resultado.topologia) {
      setMensaje(resultado.mensaje)
      return
    }
    setMensaje(undefined)
    onCambio(resultado.topologia)
  }

  const guardar = async (): Promise<void> => {
    let slugFinal: string
    try {
      slugFinal = Slug.create(nombre).value
    } catch (error) {
      // Única causa posible: el formato del value object. Se muestra su mensaje
      // (no un diagnóstico inventado) y se deja rastro del fallo.
      console.warn('[WARN] nombre inválido al guardar la topología', { nombre, error })
      setMensaje(error instanceof Error ? error.message : 'Nombre inválido para slug: usa minúsculas, dígitos y guiones.')
      return
    }
    if (topologia.kind === 'reference') slugFinal = `usuario-${slugFinal}`
    await onGuardar(
      Topology.create({
        slug: slugFinal,
        name: nombre,
        kind: 'user',
        nodes: topologia.nodes.map((n): TopologyNodeProps => ({ entityType: n.entityType, entitySlug: n.entitySlug, x: n.x, y: n.y, layerHint: n.layerHint })),
        edges: topologia.edges.map((e) => ({ from: e.from, to: e.to, linkKind: e.linkKind, mediumCode: e.mediumCode, label: e.label })),
        metadata: topologia.metadata,
      }),
    )
  }

  return (
    <div className="stack">
      <p className="guia-tecnica">
        Laboratorio de topologías: añade dispositivos del catálogo y conéctalos; el enlace se valida por
        interfaz común (velocidades de puerto) o compatibilidad curada.
      </p>
      <div className="row" style={{ gap: 8 }}>
        <label className="sr-only" htmlFor="nombre-topo">Nombre</label>
        <input id="nombre-topo" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre de la topología" className="search-input" />
        <button type="button" onClick={conFalloVisible(guardar)}>Guardar topología</button>
        <button type="button" onClick={onCancelar}>Cancelar</button>
      </div>

      <div className="row" style={{ gap: 8 }}>
        <label className="sr-only" htmlFor="buscador-topo">Añadir dispositivo por slug</label>
        <input
          id="buscador-topo"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="slug de dispositivo (p. ej. cisco-c9300-48p)"
          className="search-input"
          data-testid="buscador-topo"
        />
        <button type="button" onClick={conFalloVisible(() => añadirDispositivo(busqueda))}>Añadir dispositivo</button>
      </div>

      <fieldset aria-label="Conectar nodos" className="card" style={{ margin: 0, padding: '8px 12px' }}>
        <legend style={{ fontSize: 'var(--font-size-xs)', padding: '0 4px' }}>Conectar nodos</legend>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <label className="sr-only" htmlFor="origen-topo">Nodo origen</label>
          <select id="origen-topo" value={origen} onChange={(e) => setOrigen(e.target.value)}>
            <option value="">— origen —</option>
            {topologia.nodes.map((n) => (
              <option key={n.id} value={n.id}>{n.id}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="destino-topo">Nodo destino</label>
          <select id="destino-topo" value={destino} onChange={(e) => setDestino(e.target.value)}>
            <option value="">— destino —</option>
            {topologia.nodes.map((n) => (
              <option key={n.id} value={n.id}>{n.id}</option>
            ))}
          </select>
          <button type="button" onClick={conFalloVisible(conectar)}>Validar y conectar</button>
        </div>
      </fieldset>

      {mensaje ? <p role="alert" className="empty-state">{mensaje}</p> : null}

      {topologia.nodes.length === 0 ? (
        <p className="empty-state">Topología vacía. Añade al menos un dispositivo para empezar.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {topologia.nodes.map((n) => (
            <li key={n.id} className="mono guia-tecnica" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '2px 0' }}>
              <span>{n.id}</span>
              <button type="button" onClick={() => quitarNodo(n.id)} aria-label={`Quitar ${n.id}`}>✕</button>
            </li>
          ))}
        </ul>
      )}
      <p className="guia-tecnica">
        Enlaces actuales: {topologia.edges.length === 0 ? 'ninguno' : topologia.edges.map((e) => `${e.from} → ${e.to}`).join(' · ')}
      </p>
    </div>
  )
}
