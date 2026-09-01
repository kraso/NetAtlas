import React from 'react'
import { useParams, Link } from 'react-router-dom'
import { OsiPanel, ConfidenceBadge, confidenceLabel } from '@netatlas/ui'
import { useCatalogStore } from '../viewmodels/catalog-store.js'
import { useFavoritosStore, useEsFavorito } from '../viewmodels/favorites-store.js'
import { useServices } from '../composition-root.js'
import type { UiDeviceAttributeValue } from '../composition-root.js'
import { Breadcrumbs } from './breadcrumbs.js'
import { FrontPanel } from './front-panel.js'
import { Genealogia } from './genealogia.js'

// El mapa local (Cytoscape) solo se carga al abrir la pestaña Diagramas.
const MapaLocal = React.lazy(() => import('./mapa-local.js').then((m) => ({ default: m.MapaLocal })))
import type { Device } from '@netatlas/domain'
import type { Assertion, Relationship } from '@netatlas/domain'

/**
 * Ficha de dispositivo (§10.5) — las 13 pestañas del plan:
 * Resumen · Especificaciones · Interfaces · Protocolos · Capacidades ·
 * Arquitectura · Capas OSI · Estándares · Compatibilidad · Diagramas ·
 * Historia · Documentación · Referencias.
 *
 * Cada pestaña se alimenta de los puertos del dominio (device, graph, sourcing);
 * donde el modelo aún no tiene datos se muestra un empty-state curado, nunca
 * datos inventados.
 */

interface PestañaDef {
  id: string
  label: string
  required?: boolean
}

const PESTAÑAS: readonly PestañaDef[] = [
  { id: 'resumen', label: 'Resumen', required: true },
  { id: 'especificaciones', label: 'Especificaciones' },
  { id: 'interfaces', label: 'Interfaces' },
  { id: 'protocolos', label: 'Protocolos' },
  { id: 'capacidades', label: 'Capacidades' },
  { id: 'arquitectura', label: 'Arquitectura' },
  { id: 'capas', label: 'Capas OSI', required: true },
  { id: 'estandares', label: 'Estándares' },
  { id: 'compatibilidad', label: 'Compatibilidad' },
  { id: 'diagramas', label: 'Diagramas' },
  { id: 'historia', label: 'Historia' },
  { id: 'documentacion', label: 'Documentación' },
  { id: 'referencias', label: 'Referencias' },
]

export function DeviceSheet(): React.JSX.Element {
  const { slug = '' } = useParams<{ slug: string }>()
  const categories = useCatalogStore((s) => s.categories)
  const [device, setDevice] = React.useState<Device | undefined>()
  const [pestaña, setPestaña] = React.useState<string>('resumen')
  const [notFound, setNotFound] = React.useState(false)
  // Favoritos del usuario (F8B, NET-HW-064): local-first, sincronizable con /v1/favorites.
  const esFavorito = useEsFavorito(slug)
  const alternarFavorito = useFavoritosStore((s) => s.alternar)
  const sincronizarFavoritos = useFavoritosStore((s) => s.sincronizar)

  React.useEffect(() => {
    sincronizarFavoritos()
    void (async () => {
      const d = await useServices.getState().services.devices.findBySlug(slug)
      setDevice(d)
      setNotFound(d === undefined)
    })()
  }, [slug, sincronizarFavoritos])

  if (notFound) {
    return (
      <section aria-labelledby="no-encontrado">
        <h1 id="no-encontrado">Dispositivo no encontrado</h1>
        <p>
          «<span className="mono">{slug}</span>» no existe en el dataset. <Link to="/explore">Volver al explorador</Link>.
        </p>
      </section>
    )
  }
  if (!device) {
    return <p role="status">Cargando ficha…</p>
  }

  const cat = categories.find((c) => c.code === device.categoryCode)

  return (
    <section aria-labelledby={`ficha-${device.slug.value}`}>
      <Breadcrumbs
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Explorar', to: '/explore' },
          { label: device.name },
        ]}
      />
      <h1 id={`ficha-${device.slug.value}`}>{device.name}</h1>
      <p className="mono guia-tecnica">
        {device.slug.value} · {cat?.nameEs ?? device.categoryCode} ·{' '}
        <Link to={`/fabricante/${device.manufacturerSlug}`}>{device.manufacturerSlug}</Link>{' '}
        <button
          type="button"
          className="btn-favorito"
          aria-pressed={esFavorito}
          data-testid={`favorito-${device.slug.value}`}
          onClick={() => alternarFavorito(device.slug.value)}
          title={esFavorito ? 'Quitar de favoritos' : 'Añadir a favoritos'}
        >
          {esFavorito ? '★ En favoritos' : '☆ Favorito'}
        </button>
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 24 }}>
        <div>
          <div role="tablist" aria-label="Pestañas de la ficha" className="ficha-tabs">
            {PESTAÑAS.map((t) => (
              <button
                key={t.id}
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={pestaña === t.id}
                aria-controls={`panel-${t.id}`}
                onClick={() => setPestaña(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div id={`panel-${pestaña}`} role="tabpanel" aria-labelledby={`tab-${pestaña}`}>
            <PestanaContent device={device} pestaña={pestaña} />
          </div>
        </div>

        <PanelContextual device={device} />
      </div>
    </section>
  )
}

/** Panel contextual derecho (NET-HW-025): resumen de relaciones + panel frontal. */
function PanelContextual({ device }: { device: Device }): React.JSX.Element {
  const { relaciones } = useDeviceRelations(device)
  const soportes = relaciones.filter((r) => r.predicate === 'supports-protocol')
  const estandares = relaciones.filter((r) => r.predicate === 'implements-standard')

  return (
    <aside aria-label="Panel contextual" className="card" style={{ position: 'sticky', top: 16, height: 'fit-content' }}>
      <h2 style={{ fontSize: 'var(--font-size-md)' }}>Panel frontal</h2>
      <FrontPanel ports={device.ports} />

      <h3 style={{ fontSize: 'var(--font-size-sm)', marginTop: 16 }}>Soportes ({soportes.length})</h3>
      <p className="guia-tecnica">
        {soportes.length > 0
          ? soportes.slice(0, 6).map((r) => (
              <Link key={r.object.slug} to={`/protocolo/${r.object.slug}`} className="mono" style={{ marginRight: 6 }}>
                {r.object.slug}
              </Link>
            ))
          : 'Sin soportes curados.'}
      </p>

      <h3 style={{ fontSize: 'var(--font-size-sm)', marginTop: 12 }}>Estándares ({estandares.length})</h3>
      <p className="guia-tecnica">
        {estandares.length > 0 ? estandares.map((r) => <span key={r.object.slug} className="mono" style={{ marginRight: 6 }}>{r.object.slug}</span>) : 'Sin estándares curados.'}
      </p>

      <p style={{ marginTop: 12 }}>
        <Link to="/glosario" className="guia-tecnica">Glosario técnico →</Link>
      </p>
    </aside>
  )
}

/** Carga datos relacionales y de trazabilidad del dispositivo. */
function useDeviceRelations(device: Device | undefined): {
  relaciones: readonly Relationship[]
  assertions: readonly Assertion[]
  loading: boolean
} {
  const [relaciones, setRelaciones] = React.useState<readonly Relationship[]>([])
  const [assertions, setAssertions] = React.useState<readonly Assertion[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    if (!device) {
      setLoading(false)
      return
    }
    void (async () => {
      const { graph, sourcing } = useServices.getState().services
      const edges = await graph.edgesOf({ type: 'device', slug: device.slug.value })
      setRelaciones(edges)
      const asr = await sourcing.assertionsForDevice(device.slug.value)
      setAssertions(asr)
      setLoading(false)
    })()
  }, [device])

  return { relaciones, assertions, loading }
}

/** Carga los valores EAV del dispositivo (F3, pestaña Capacidades). */
function useDeviceAttributes(device: Device | undefined): {
  valores: readonly UiDeviceAttributeValue[]
  loading: boolean
} {
  const [valores, setValores] = React.useState<readonly UiDeviceAttributeValue[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    if (!device) {
      setLoading(false)
      return
    }
    void (async () => {
      const { attributes } = useServices.getState().services
      const values = await attributes.attributeValuesForDevice(device.slug.value)
      setValores(values)
      setLoading(false)
    })()
  }, [device])

  return { valores, loading }
}

const Empty = ({ message }: { message: string }): React.JSX.Element => (
  <p className="empty-state">{message}</p>
)

/**
 * Similares curados (NET-HW-032): lista de dispositivos similar-to con el
 * puente «Comparar desde aquí» hacia la ruta /comparar (F5 lo completa).
 */
function SimilaresComparar({
  deviceSlug,
  similares,
}: {
  deviceSlug: string
  similares: readonly Relationship[]
}): React.JSX.Element | null {
  if (similares.length === 0) return null
  const peers = similares.map((r) =>
    r.subject.type === 'device' && r.subject.slug === deviceSlug ? r.object.slug : r.subject.slug,
  )
  return (
    <section aria-label="Dispositivos similares">
      <h3 style={{ fontSize: 'var(--font-size-sm)' }}>Similares curados ({peers.length})</h3>
      <ul>
        {peers.map((p) => (
          <li key={p}>
            <Link to={`/device/${p}`} className="mono">
              {p}
            </Link>{' '}
            <Link
              to={`/comparar?a=${deviceSlug}&b=${p}`}
              className="guia-tecnica"
              aria-label={`Comparar ${deviceSlug} con ${p}`}
              style={{ marginLeft: 8 }}
            >
              Comparar desde aquí →
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function PestanaContent({ device, pestaña }: { device: Device; pestaña: string }): React.JSX.Element {
  const { relaciones, assertions, loading } = useDeviceRelations(device)
  const { valores: atributos, loading: atributosLoading } = useDeviceAttributes(device)
  if (loading) return <p role="status">Cargando…</p>

  const porPredicado = (pred: string): readonly Relationship[] =>
    relaciones.filter((r) => r.predicate === pred)
  const soportes = porPredicado('supports-protocol')
  const estandares = porPredicado('implements-standard')
  const medios = porPredicado('terminates-medium')
  const compatibles = porPredicado('compatible-with')
  const similares = porPredicado('similar-to')

  const assertionDe = (pred: string): Assertion | undefined => assertions.find((a) => a.predicate === pred)

  switch (pestaña) {
    case 'resumen':
      return (
        <div className="stack">
          <p>{device.summary ?? 'Sin resumen curado.'}</p>
          <p>
            Ciclo de vida: <span className="mono">{device.lifecycleStatus}</span>{' '}
            {assertionDe('throughput_gbps') ? (
              <>
                {' '}
                · Throughput: <span className="mono">{JSON.parse(assertionDe('throughput_gbps')!.valueJson).gbps} Gbps</span>{' '}
                <ConfidenceBadge confidence={assertionDe('throughput_gbps')!.confidence} size="sm" />
              </>
            ) : null}
          </p>
        </div>
      )

    case 'especificaciones':
      return (
        <table className="tabla-specs">
          <tbody>
            <tr><th scope="row">Modelo / SKU</th><td className="mono">{device.model ?? '—'} {device.sku ? `(${device.sku})` : ''}</td></tr>
            <tr><th scope="row">Fabricante</th><td>{device.manufacturerSlug}</td></tr>
            <tr><th scope="row">Capa principal</th><td className="mono">{device.osiProfile?.profile.primary ?? '—'}</td></tr>
            <tr><th scope="row">Puertos totales</th><td className="mono">{device.portCount()}</td></tr>
            <tr><th scope="row">Presentación</th><td className="mono">{device.releasedOn ?? '—'}</td></tr>
            <tr><th scope="row">Fecha EoL / EoS</th><td className="mono">{device.eolOn ?? '—'} / {device.eosOn ?? '—'}</td></tr>
          </tbody>
        </table>
      )

    case 'interfaces':
      return device.ports.length === 0 ? (
        <Empty message="Sin inventario de puertos curado." />
      ) : (
        <table className="tabla-specs">
          <thead>
            <tr>
              <th scope="col">Etiqueta</th>
              <th scope="col">Interfaz</th>
              <th scope="col">Cantidad</th>
              <th scope="col">Velocidades</th>
              <th scope="col">PoE</th>
            </tr>
          </thead>
          <tbody>
            {device.ports.map((p) => (
              <tr key={p.label}>
                <td>{p.label}</td>
                <td className="mono">{p.interfaceCode}</td>
                <td className="mono">{p.quantity}</td>
                <td className="mono">{p.speedsMbps.map((s) => (s >= 1000 ? `${s / 1000}G` : `${s}M`)).join(' / ')}</td>
                <td className="mono">{p.poeStandard ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )

    case 'protocolos':
      return soportes.length === 0 ? (
        <Empty message="Sin protocolos curados (se alimenta de la arista supports-protocol)." />
      ) : (
        <div className="stack">
          <ul>
            {soportes.map((r) => (
              <li key={r.object.slug}>
                <Link to={`/protocolo/${r.object.slug}`} className="mono">{r.object.slug}</Link>
              </li>
            ))}
          </ul>
          <p className="guia-tecnica">
            ¿Qué es un <Link to="/glosario/conmutador">conmutador</Link> o una{' '}
            <Link to="/glosario/vlan">VLAN</Link>? Ver el <Link to="/glosario">glosario técnico</Link>.
          </p>
        </div>
      )

    case 'capacidades':
      return atributosLoading ? (
        <p role="status">Cargando capacidades…</p>
      ) : (
        <div className="stack">
          {atributos.length > 0 ? (
            <table className="tabla-specs">
              <thead>
                <tr>
                  <th scope="col">Atributo</th>
                  <th scope="col">Valor</th>
                  <th scope="col">Unidad</th>
                </tr>
              </thead>
              <tbody>
                {atributos.map((a) => (
                  <tr key={a.key}>
                    <td>{a.labelEs}</td>
                    <td className="mono">{a.display}</td>
                    <td className="mono">{a.unit ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty-state">Sin atributos de categoría curados para este dispositivo (EAV §9.4).</p>
          )}
          {assertionDe('throughput_gbps') ? (
            <p>
              Capacidad total de conmutación:{' '}
              <span className="mono">
                {JSON.parse(assertionDe('throughput_gbps')!.valueJson).gbps} Gbps
              </span>{' '}
              <ConfidenceBadge confidence={assertionDe('throughput_gbps')!.confidence} size="sm" />
            </p>
          ) : null}
          {assertionDe('power_consumption_w') ? (
            <p>
              Consumo:{' '}
              <span className="mono">{JSON.parse(assertionDe('power_consumption_w')!.valueJson)} W</span>{' '}
              <ConfidenceBadge confidence={assertionDe('power_consumption_w')!.confidence} size="sm" />
            </p>
          ) : null}
        </div>
      )

    case 'arquitectura': {
      const arq = assertionDe('internal-architecture')
      if (!arq) {
        return <Empty message="Arquitectura interna (ASIC, CPU, memoria) pendiente de curación (F2)." />
      }
      const v = JSON.parse(arq.valueJson) as {
        cpu?: string
        soc?: { family?: string; note?: string }
        contentProcessors?: readonly string[]
        networkProcessors?: readonly string[]
        storage?: { type?: string; capacityGB?: number }
        summary?: string
      }
      return (
        <div className="stack">
          {v.summary ? <p>{v.summary}</p> : null}
          <table className="tabla-specs">
            <tbody>
              {v.cpu ? <tr><th scope="row">CPU</th><td className="mono">{v.cpu}</td></tr> : null}
              {v.soc?.family ? <tr><th scope="row">SoC</th><td className="mono">{v.soc.family}{v.soc.note ? ` — ${v.soc.note}` : ''}</td></tr> : null}
              {v.contentProcessors && v.contentProcessors.length > 0 ? (
                <tr><th scope="row">Procesadores de contenido</th><td className="mono">{v.contentProcessors.join(' + ')}</td></tr>
              ) : null}
              {v.networkProcessors && v.networkProcessors.length > 0 ? (
                <tr><th scope="row">Procesadores de red</th><td className="mono">{v.networkProcessors.join(' + ')}</td></tr>
              ) : null}
              {v.storage?.capacityGB ? (
                <tr><th scope="row">Almacenamiento</th><td className="mono">{v.storage.type} {v.storage.capacityGB} GB</td></tr>
              ) : null}
            </tbody>
          </table>
          <p className="guia-tecnica">
            Fuente:{' '}
            <a href={arq.source?.url ?? undefined} target="_blank" rel="noreferrer">{arq.source?.title}</a>{' '}
            <ConfidenceBadge confidence={arq.confidence} size="sm" />
            {arq.pendingReview ? <span className="guia-tecnica"> · pendiente revisión</span> : null}
          </p>
          {arq.note ? <p className="guia-tecnica">{arq.note}</p> : null}
        </div>
      )
    }

    case 'capas':
      return <OsiTab device={device} />

    case 'estandares':
      return estandares.length === 0 ? (
        <Empty message="Sin estándares implementados curados." />
      ) : (
        <ul>
          {estandares.map((r) => (
            <li key={r.object.slug}><span className="mono">{r.object.slug}</span></li>
          ))}
        </ul>
      )

    case 'compatibilidad':
      return (
        <div className="stack">
          {medios.length > 0 ? (
            <p>
              Medios que termina:{' '}
              {medios.map((r) => <span key={r.object.slug} className="mono" style={{ marginRight: 8 }}>{r.object.slug}</span>)}
            </p>
          ) : null}
          {compatibles.length > 0 ? (
            <p>Compatible con: {compatibles.map((r) => r.object.slug).join(', ')}</p>
          ) : null}
          <SimilaresComparar deviceSlug={device.slug.value} similares={similares} />
          {compatibles.length === 0 && similares.length === 0 && medios.length === 0 ? (
            <Empty message="Compatibilidades curadas pendientes (aristas compatible-with / similar-to / requires)." />
          ) : null}
        </div>
      )

    case 'diagramas':
      return (
        <React.Suspense fallback={<p role="status">Cargando mapa local…</p>}>
          <MapaLocal device={device} />
        </React.Suspense>
      )

    case 'historia':
      return <Genealogia device={device} />

    case 'documentacion':
      return <Empty message="Datasheets y documentación de la ficha pendientes (F2)." />

    case 'referencias':
      return assertions.length === 0 ? (
        <Empty message="Sin afirmaciones curadas con fuente." />
      ) : (
        <table className="tabla-specs">
          <thead>
            <tr>
              <th scope="col">Predicado</th>
              <th scope="col">Valor</th>
              <th scope="col">Fuente</th>
              <th scope="col">Confianza</th>
              <th scope="col">Verificado</th>
            </tr>
          </thead>
          <tbody>
            {assertions.map((a, i) => (
              <tr key={`${a.predicate}-${i}`}>
                <td className="mono">{a.predicate}</td>
                <td className="mono">{a.valueJson}</td>
                <td>
                  {confidenceLabel(a.confidence)}
                  <ConfidenceBadge confidence={a.confidence} size="sm" />
                  {a.reviewedBy ? null : <span className="guia-tecnica"> · pendiente revisión</span>}
                </td>
                <td className="mono">{a.source.title}</td>
                <td className="mono">{a.verifiedOn}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )

    default:
      return <Empty message="Pestaña no disponible." />
  }
}

/**
 * Pestaña Capas OSI (NET-HW-021 §8.4.2): panel vertical + TCP/IP derivado
 * + consulta inversa "qué dispositivos operan en estas capas".
 */
function OsiTab({ device }: { device: Device }): React.JSX.Element {
  const categories = useCatalogStore((s) => s.categories)
  const { devices } = useServices.getState().services
  const [seleccion, setSeleccion] = React.useState<readonly number[]>([device.osiProfile?.profile.primary ?? 3])
  const [similares, setSimilares] = React.useState<readonly Device[]>([])

  const perfil = device.osiProfile
  if (!perfil) {
    return <p className="empty-state">El dispositivo no declara perfil OSI curado.</p>
  }

  React.useEffect(() => {
    void (async () => {
      const page = await devices.listByCategory(device.categoryCode, { limit: 20 })
      const filtradas = page.items.filter(
        (d: Device) => d.slug.value !== device.slug.value && (d.osiProfile?.terminatesAny(seleccion) ?? false),
      )
      setSimilares(filtradas)
    })()
  }, [seleccion, device, devices])

  const toggle = (num: number): void => {
    setSeleccion((prev) => (prev.includes(num) ? prev.filter((n) => n !== num) : [...prev, num]))
  }

  return (
    <div className="stack">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          <h2 style={{ fontSize: 'var(--font-size-md)' }}>Perfil OSI</h2>
          <OsiPanel profile={perfil.profile} selected={seleccion} />
        </div>
        <div>
          <h2 style={{ fontSize: 'var(--font-size-md)' }}>Perfil TCP/IP (derivado)</h2>
          <p className="guia-tecnica">{(perfil.toTcpIpLayers() as readonly number[]).map((n) => `TCP/IP ${n}`).join(' · ')}</p>
          <h3 style={{ fontSize: 'var(--font-size-md)' }}>Consulta inversa por capas</h3>
          <div className="row" role="group" aria-label="Seleccionar capas">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={seleccion.includes(n)}
                onClick={() => toggle(n)}
                className="mono"
              >
                {n}
              </button>
            ))}
          </div>
          <p className="guia-tecnica">Capas seleccionadas: {seleccion.join(', ')}</p>
        </div>
      </div>

      <section aria-label="Dispositivos que operan en estas capas">
        <h3 style={{ fontSize: 'var(--font-size-md)' }}>
          Misma categoría que termina las capas seleccionadas ({similares.length})
        </h3>
        {similares.length === 0 ? (
          <p className="guia-tecnica">Ningún otro dispositivo de esta categoría cubre la selección.</p>
        ) : (
          <ul style={{ paddingLeft: 20 }}>
            {similares.map((d) => (
              <li key={d.slug.value}>
                <Link to={`/device/${d.slug.value}`}>{d.name}</Link>{' '}
                <span className="mono guia-tecnica">capa {d.osiProfile?.profile.primary}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="guia-tecnica" role="note">
        Los perfiles sin curación concreta heredan el de su categoría y se marcan como derivados.
      </p>
      <ConfidenceBadge confidence="derived" size="sm" />
    </div>
  )
}