import React from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Topology, useTopologiesStore, VisorTopologia, EditorTopologia, Breadcrumbs } from './topology-piezas.js'

/**
 * Ficha de topología (NET-HW-033/034/035/037, §13.2–13.4):
 *  - Visor: Cytoscape con posiciones persistidas al arrastrar, reordenar
 *    automático, filtros por capa OSI, click→ficha, alternativa accesible
 *    (`topology-viewer.tsx`).
 *  - Exportación SVG/PNG (NET-HW-037) y flujo de paquetes (NET-HW-035).
 *  - Laboratorio (NET-HW-034): crear/editar topologías de usuario y conectar
 *    dispositivos con validación de compatibilidad (`topology-editor.tsx`).
 */

export function TopologySheet(): React.JSX.Element {
  const { slug = '' } = useParams<{ slug: string }>()
  const esNueva = slug === 'nueva'
  const navegar = useNavigate()
  const [topology, setTopology] = React.useState<Topology | undefined>()
  const [notFound, setNotFound] = React.useState(false)
  const [editando, setEditando] = React.useState(esNueva)
  const [errorGuardado, setErrorGuardado] = React.useState<string | undefined>()

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
    })().catch((err: unknown) => {
      // Si la carga falla, no dejamos el usuario en un loading infinito.
      console.error(`TopologySheet: error cargando ${slug}:`, err)
      setNotFound(true)
    })
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
    try {
      await useTopologiesStore.getState().upsert(t)
      navegar(`/topology/${t.slug.value}`)
    } catch (err) {
      // Guardar es la acción que el usuario pidió: un fallo se registra y se ve.
      console.error(`TopologySheet: no se pudo guardar ${t.slug.value}:`, err)
      setErrorGuardado(err instanceof Error ? err.message : 'No se pudo guardar la topología.')
    }
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

      {errorGuardado ? (
        <p className="empty-state" role="alert" data-testid="error-guardado">
          No se pudo guardar la topología: {errorGuardado}
        </p>
      ) : null}

      {editando ? (
        <EditorTopologia
          topologia={topology}
          onCambio={setTopology}
          onGuardar={guardarYCerrar}
          onCancelar={esNueva ? () => navegar('/topologies') : () => setEditando(false)}
        />
      ) : (
        <VisorTopologia topologia={topology} onCambio={setTopology} />
      )}
    </section>
  )
}
