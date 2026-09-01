import React from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Slug, Topology, TopologyNode, validateLinkCompatibility } from '@netatlas/domain'
import type { TopologyEdgeProps, TopologyNodeProps, NodeType } from '@netatlas/domain'
import type { Core } from 'cytoscape'
import { useTopologiesStore } from '../viewmodels/topologies-store.js'
import { useServices } from '../composition-root.js'
import { CytoscapeCanvas } from './cytoscape-canvas.js'
import { elementosDeTopologia, capasDe, rutaTopologia, tablaDeTopologia } from './topology-model.js'
import { Breadcrumbs } from './breadcrumbs.js'

/**
 * Ficha de topología (NET-HW-033/034/035/037, §13.2–13.4):
 *  - Visor: Cytoscape con posiciones persistidas al arrastrar, reordenar
 *    automático, filtros por capa OSI, click→ficha, alternativa accesible.
 *  - Exportación SVG/PNG (NET-HW-037).
 *  - Flujo de paquetes animado por saltos (NET-HW-035, mín.).
 *  - Laboratorio (NET-HW-034): crear/editar topologías de usuario y conectar
 *    dispositivos con validación de compatibilidad (regla del dominio).
 */

export function TopologySheet(): React.JSX.Element {
  const { slug = '' } = useParams<{ slug: string }>()
  const esNueva = slug === 'nueva'
  const navegar = useNavigate()
  const [topology, setTopology] = React.useState<Topology | undefined>()
  const [notFound, setNotFound] = React.useState(false)
  const [editando, setEditando] = React.useState(esNueva)

  React.useEffect(() => {
    setNotFound(false)
    setEditando(esNueva)
    if (esNueva) {
      setTopology(
        Topology.create({
          slug: 'borrador-topologia',
          name: 'Topología nueva',
          kind: 'user',
          nodes: [],
          edges: [],
        }),
      )
      return
    }
    void (async () => {
      const t = await useTopologiesStore.getState().bySlug(slug)
      setTopology(t)
      setNotFound(t === undefined)
    })()
  }, [slug, esNueva])

  if (notFound) {
    return (
      <section aria-labelledby="topologia-no-encontrada">
        <h1 id="topologia-no-encontrada">Topología no encontrada</h1>
        <p>
          «<span className="mono">{slug}</span>» no existe. <Link to="/topologies">Volver al visor de topologías</Link>.
        </p>
      </section>
    )
  }
  if (!topology) return <p role="status">Cargando topología…</p>

  const guardarYCerrar = async (t: Topology): Promise<void> => {
    await useTopologiesStore.getState().upsert(t)
    navegar(`/topology/${t.slug.value}`)
  }

  return (
    <section aria-labelledby={`topologia-${topology.slug.value}`}>
      <Breadcrumbs
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Topologías', to: '/topologies' },
          { label: topology.name },
        ]}
      />
      <h1 id={`topologia-${topology.slug.value}`}>{topology.name}</h1>
      <p className="mono guia-tecnica">
        {topology.slug.value} · {topology.kind === 'reference' ? 'referencia' : 'usuario'} ·{' '}
        {topology.nodes.length} nodos · {topology.edges.length} enlaces
        {!editando && topology.kind === 'user' ? (
          <button type="button" onClick={() => setEditando(true)} style={{ marginLeft: 10 }}>
            Editar
          </button>
        ) : null}
      </p>

      {editando ? (
        <EditorTopologia
          topologia={topology}
          onCambio={setTopology}
          onGuardar={guardarYCerrar}
          onCancelar={
            esNueva ? () => navegar('/topologies') : () => setEditando(false)
          }
        />
      ) : (
        <VisorTopologia
          topologia={topology}
          onCambio={setTopology}
        />
      )}
    </section>
  )
}

// ── Visor (NET-HW-033/035/037) ──────────────────────────────────────────────

function VisorTopologia({
  topologia,
  onCambio,
}: {
  topologia: Topology
  onCambio: (t: Topology) => void
}): React.JSX.Element {
  const navegar = useNavigate()
  const cyRef = React.useRef<Core | undefined>(undefined)
  const [layoutName, setLayoutName] = React.useState<'preset' | 'breadthfirst'>('preset')
  const [capas, setCapas] = React.useState<readonly number[]>(capasDe(topologia))
  const [activas, setActivas] = React.useState<readonly number[]>([])
  const [flujoActivo, setFlujoActivo] = React.useState(false)
  const [origen, setOrigen] = React.useState<string | undefined>()
  const [destino, setDestino] = React.useState<string | undefined>()
  const [ruta, setRuta] = React.useState<readonly string[]>([])
  const timers = React.useRef<number[]>([])
  // Refs frescas: el handler de Cytoscape se registra una vez y debe leer el
  // estado actual (sin closures obsoletos) al encadenar taps del flujo.
  const flujoRef = React.useRef(false)
  const origenRef = React.useRef<string | undefined>(undefined)
  const destinoRef = React.useRef<string | undefined>(undefined)

  React.useEffect(() => {
    return () => {
      for (const t of timers.current) clearTimeout(t)
    }
  }, [])

  const elementos = React.useMemo(() => {
    const filtrados = activas.length > 0 ? topologia.nodes.filter((n) => n.layerHint === undefined || activas.includes(n.layerHint)) : topologia.nodes
    const conEnRuta = new Set(ruta)
    return elementosDeTopologia(
      Topology.create({
        slug: topologia.slug.value,
        name: topologia.name,
        kind: topologia.kind,
        nodes: filtrados.map(
          (n): TopologyNodeProps => ({ entityType: n.entityType, entitySlug: n.entitySlug, x: n.x, y: n.y, layerHint: n.layerHint }),
        ),
        edges: topologia.edges.filter(
          (e) => filtrados.some((n) => n.id === e.from) && filtrados.some((n) => n.id === e.to),
        ).map(
          (e): TopologyEdgeProps => ({ from: e.from, to: e.to, linkKind: e.linkKind, mediumCode: e.mediumCode, label: e.label }),
        ),
      }),
    ).map((el) => ({
      data: { ...el.data, enRuta: conEnRuta.has(String(el.data.id)) },
    }))
  }, [topologia, activas, ruta])

  const animar = (rutaIds: readonly string[]): void => {
    const cy = cyRef.current
    if (!cy) return
    cy.elements().removeClass('enRuta')
    rutaIds.forEach((id, i) => {
      timers.current.push(
        window.setTimeout(() => {
          cy.getElementById(id).addClass('enRuta')
          if (i === rutaIds.length - 1) setFlujoActivo(false)
        }, i * 350),
      )
    })
  }

  const onTapNode = React.useCallback(
    (id: string): void => {
      if (flujoRef.current) {
        if (!origenRef.current) {
          origenRef.current = id
          setOrigen(id)
          return
        }
        if (!destinoRef.current && id !== origenRef.current) {
          destinoRef.current = id
          setDestino(id)
          const r = rutaTopologia(topologia, origenRef.current, id)
          setRuta(r)
          if (r.length > 0) animar(r)
          else {
            flujoRef.current = false
            setFlujoActivo(false)
            setRuta([])
          }
          origenRef.current = undefined
          destinoRef.current = undefined
          setOrigen(undefined)
          setDestino(undefined)
        }
        return
      }
      const nodo = topologia.nodeById(id)
      if (!nodo) return
      if (nodo.entityType === 'device') navegar(`/device/${nodo.entitySlug}`)
      else navegar(`/explore?cat=${nodo.entitySlug}`)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [topologia, navegar],
  )

  const guardarLayout = (positions: ReadonlyArray<{ id: string; x: number; y: number }>): void => {
    void useTopologiesStore
      .getState()
      .saveLayout(
        topologia.slug.value,
        positions.map((p) => ({ nodeId: p.id, x: p.x, y: p.y })),
      )
      .then(() => {
        void useTopologiesStore.getState().bySlug(topologia.slug.value).then((t) => {
          if (t) onCambio(t)
        })
      })
  }

  const exportar = (formato: 'svg' | 'png'): void => {
    const cy = cyRef.current
    if (!cy) return
    try {
      const nombre = `${topologia.slug.value}-${new Date().toISOString().slice(0, 10)}.${formato}`
      if (formato === 'png') {
        const blob = cy.png({ output: 'blob', bg: '#0d1117', full: true }) as Blob
        descargarBlob(blob, nombre)
      } else {
        const svg = cy.svg({ scale: 1, full: true })
        descargarBlob(new Blob([svg], { type: 'image/svg+xml' }), nombre)
      }
    } catch {
      // Sin soporte del navegador (p. ej. jsdom): se ignora silenciosamente.
    }
  }

  const toggleCapa = (num: number): void => {
    setActivas((prev) => (prev.includes(num) ? prev.filter((c) => c !== num) : [...prev, num]))
  }

  return (
    <div className="stack">
      <div className="row" role="toolbar" aria-label="Acciones del visor" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button type="button" onClick={() => setLayoutName((l) => (l === 'preset' ? 'breadthfirst' : 'preset'))}>
          {layoutName === 'preset' ? 'Reordenar automáticamente' : 'Volver al layout guardado'}
        </button>
        <button type="button" onClick={() => exportar('svg')}>Exportar SVG</button>
        <button type="button" onClick={() => exportar('png')}>Exportar PNG</button>
        <button
          type="button"
          aria-pressed={flujoActivo}
          onClick={() => {
            if (!flujoActivo) {
              flujoRef.current = true
              setFlujoActivo(true)
              setRuta([])
            } else {
              flujoRef.current = false
              origenRef.current = undefined
              destinoRef.current = undefined
              setOrigen(undefined)
              setDestino(undefined)
              setFlujoActivo(false)
              setRuta([])
            }
          }}
        >
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

function TablaTopologia({ topologia }: { topologia: Topology }): React.JSX.Element {
  const { nodos, aristas } = tablaDeTopologia(topologia)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 8 }}>
      <table className="tabla-specs">
        <thead>
          <tr>
            <th scope="col">Tipo</th>
            <th scope="col">Entidad</th>
            <th scope="col">Capa</th>
            <th scope="col">Posición</th>
          </tr>
        </thead>
        <tbody>
          {nodos.map(([tipo, entidad, capa, pos]) => (
            <tr key={`${tipo}-${entidad}`}>
              <td className="mono">{tipo}</td>
              <td className="mono">{entidad}</td>
              <td className="mono">{capa}</td>
              <td className="mono">{pos}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="tabla-specs">
        <thead>
          <tr>
            <th scope="col">Origen</th>
            <th scope="col">Destino</th>
            <th scope="col">Etiqueta</th>
          </tr>
        </thead>
        <tbody>
          {aristas.map(([from, to, label]) => (
            <tr key={`${from}-${to}`}>
              <td className="mono">{from}</td>
              <td className="mono">{to}</td>
              <td className="mono">{label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Laboratorio-editor (NET-HW-034) ─────────────────────────────────────────

function EditorTopologia({
  topologia,
  onCambio,
  onGuardar,
  onCancelar,
}: {
  topologia: Topology
  onCambio: (t: Topology) => void
  onGuardar: (t: Topology) => Promise<void>
  onCancelar: () => void
}): React.JSX.Element {
  const [nombre, setNombre] = React.useState(topologia.name)
  const [busqueda, setBusqueda] = React.useState('')
  const [mensaje, setMensaje] = React.useState<string | undefined>()
  const [origen, setOrigen] = React.useState('')
  const [destino, setDestino] = React.useState('')

  const siguienteX = topologia.nodes.length * 60

  const conNodo = (nodo: TopologyNodeProps): Topology =>
    Topology.create({
      slug: topologia.slug.value,
      name: topologia.name,
      kind: topologia.kind,
      nodes: [...topologia.nodes.map(proyectarNodo), nodo],
      edges: topologia.edges.map(proyectarArista),
      metadata: topologia.metadata,
    })

  const sinNodo = (id: string): Topology =>
    Topology.create({
      slug: topologia.slug.value,
      name: topologia.name,
      kind: topologia.kind,
      nodes: topologia.nodes.filter((n) => n.id !== id).map(proyectarNodo),
      edges: topologia.edges.filter((e) => e.from !== id && e.to !== id).map(proyectarArista),
      metadata: topologia.metadata,
    })

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
    onCambio(conNodo({ entityType: 'device', entitySlug: d.slug.value, x: siguienteX, y: 0 }))
  }

  const quitarNodo = (id: string): void => {
    onCambio(sinNodo(id))
    setMensaje(undefined)
  }

  const conectar = async (): Promise<void> => {
    if (!origen || !destino || origen === destino) {
      setMensaje('Selecciona dos nodos distintos para conectar.')
      return
    }
    const { devices, graph } = useServices.getState().services
    const peer = (id: string): { slug: string; tipo: string } => {
      const i = id.indexOf(':')
      return { tipo: id.slice(0, i), slug: id.slice(i + 1) }
    }
    const a = peer(origen)
    const b = peer(destino)
    const [da, db] = [
      a.tipo === 'device' ? await devices.findBySlug(a.slug) : undefined,
      b.tipo === 'device' ? await devices.findBySlug(b.slug) : undefined,
    ]
    const speedsA = da?.ports.flatMap((p) => p.speedsMbps) ?? []
    const speedsB = db?.ports.flatMap((p) => p.speedsMbps) ?? []
    const aristasA = a.tipo === 'device' ? await graph.edgesOf({ type: 'device', slug: a.slug }) : []
    const curada = aristasA.some(
      (r) => r.predicate === 'compatible-with' && r.object.type === 'device' && r.object.slug === b.slug && b.tipo === 'device',
    )
    const resultado = validateLinkCompatibility({ fromSpeeds: speedsA, toSpeeds: speedsB, curatedCompatible: curada })
    if (!resultado.ok) {
      setMensaje(resultado.reason)
      return
    }
    if (topologia.edges.some((e) => (e.from === origen && e.to === destino) || (e.from === destino && e.to === origen))) {
      setMensaje('Ese enlace ya existe.')
      return
    }
    setMensaje(undefined)
    onCambio(
      Topology.create({
        slug: topologia.slug.value,
        name: topologia.name,
        kind: topologia.kind,
        nodes: topologia.nodes.map(proyectarNodo),
        edges: [...topologia.edges.map(proyectarArista), { from: origen, to: destino, label: 'enlace' }],
        metadata: topologia.metadata,
      }),
    )
  }

  const guardar = async (): Promise<void> => {
    let slugFinal: string
    try {
      slugFinal = Slug.create(nombre).value
    } catch {
      setMensaje('Nombre inválido para slug: usa minúsculas, dígitos y guiones.')
      return
    }
    if (topologia.kind === 'reference') slugFinal = `usuario-${slugFinal}`
    await onGuardar(
      Topology.create({
        slug: slugFinal,
        name: nombre,
        kind: 'user',
        nodes: topologia.nodes.map(proyectarNodo),
        edges: topologia.edges.map(proyectarArista),
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
        <button type="button" onClick={guardar}>Guardar topología</button>
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
        <button type="button" onClick={() => void añadirDispositivo(busqueda)}>Añadir dispositivo</button>
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
          <button type="button" onClick={() => void conectar()}>Validar y conectar</button>
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

function proyectarNodo(n: TopologyNode): TopologyNodeProps {
  return { entityType: n.entityType, entitySlug: n.entitySlug, x: n.x, y: n.y, layerHint: n.layerHint }
}

function proyectarArista(e: { from: string; to: string; linkKind?: string; mediumCode?: string; label?: string }): TopologyEdgeProps {
  return { from: e.from, to: e.to, linkKind: e.linkKind, mediumCode: e.mediumCode, label: e.label }
}

function descargarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}