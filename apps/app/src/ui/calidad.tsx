import React from 'react'
import { Link } from 'react-router-dom'
import { useQualityStore } from '../viewmodels/quality-store.js'
import { Breadcrumbs } from './breadcrumbs.js'

/**
 * Dashboard de calidad del dataset (NET-HW-047, §19.3): cobertura de fuentes
 * por categoría, distribución de confianza, atributos EAV, cola de
 * reconciliación con diff (NET-HW-045/049) y manifiesto del dataset (048).
 */
export function Calidad(): React.JSX.Element {
  const { report, pendientes, manifiesto, cargando, cargar, resolver } = useQualityStore()
  const [autor, setAutor] = React.useState('revisora')

  React.useEffect(() => {
    void cargar()
  }, [cargar])

  if (!report && cargando) return <p role="status">Calculando métricas de calidad…</p>
  if (!report) return <p className="empty-state">Sin métricas disponibles.</p>

  const metricas = [
    { label: 'Dispositivos', valor: String(report.dispositivos) },
    { label: 'Con assertions', valor: String(report.conAssertions) },
    { label: 'Cobertura de fuentes', valor: `${report.coberturaFuentes}%` },
    { label: 'Atributos EAV', valor: String(report.atributosEAV) },
    { label: 'Sin especificaciones EAV', valor: String(report.dispositivosSinEAV) },
    { label: 'Relaciones', valor: String(report.relaciones) },
  ]
  const critica = report.coberturaCritica
  // Threshold del plan maestro (§F2): cobertura ≥80% en datos críticos.
  const cumpleCritica = critica.porcentaje >= 80
  const faltantesPorTipo = (tipo: string): number =>
    critica.items.filter((i) => i.faltan.includes(tipo as 'throughput' | 'protocolos' | 'compatibilidades')).length

  return (
    <section aria-labelledby="titulo-calidad">
      <Breadcrumbs items={[{ label: 'Dashboard', to: '/' }, { label: 'Calidad' }]} />
      <h1 id="titulo-calidad">Calidad del dataset</h1>
      <p className="guia-tecnica">Cobertura de fuentes, confianza, atributos EAV y cola de reconciliación (sección 19.3).</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        {metricas.map((m) => (
          <div key={m.label} className="card">
            <p className="guia-tecnica" style={{ margin: 0 }}>{m.label}</p>
            <p className="mono" style={{ fontSize: 'var(--font-size-lg)', margin: 0 }}>{m.valor}</p>
          </div>
        ))}
      </div>

      <section aria-label="Cobertura de datos críticos" className="card" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 'var(--font-size-md)', marginTop: 0 }}>
          Datos críticos curados (throughput · protocolos · compatibilidades)
        </h2>
        <p className="guia-tecnica">
          Umbral del plan maestro (§F2): cobertura ≥80% en datos críticos. Hoy:{' '}
          <span className="mono" data-testid="cobertura-critica">{critica.porcentaje}%</span>{' '}
          ({critica.curados}/{critica.elegibles} dispositivos con electrónica){' '}
          {cumpleCritica ? '— ✔ cumple' : '— ⚠ por debajo del umbral'}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          <p className="guia-tecnica" style={{ margin: 0 }}>Sin throughput: <span className="mono">{faltantesPorTipo('throughput')}</span></p>
          <p className="guia-tecnica" style={{ margin: 0 }}>Sin protocolos: <span className="mono">{faltantesPorTipo('protocolos')}</span></p>
          <p className="guia-tecnica" style={{ margin: 0 }}>Sin compatibilidades: <span className="mono">{faltantesPorTipo('compatibilidades')}</span></p>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 20 }}>
        <section aria-label="Cobertura por categoría">
          <h2 style={{ fontSize: 'var(--font-size-md)' }}>Cobertura de fuentes por categoría</h2>
          <table className="tabla-specs">
            <thead>
              <tr>
                <th scope="col">Categoría</th>
                <th scope="col">Dispositivos</th>
                <th scope="col">Con fuente</th>
                <th scope="col">Cobertura</th>
              </tr>
            </thead>
            <tbody>
              {report.porCategoria.map((c) => (
                <tr key={c.categoria}>
                  <td className="mono">
                    <Link to={`/explore?cat=${c.categoria}`}>{c.categoria}</Link>
                  </td>
                  <td className="mono">{c.dispositivos}</td>
                  <td className="mono">{c.conAssertions}</td>
                  <td className="mono">{c.cobertura}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section aria-label="Confianza distribuida">
          <h2 style={{ fontSize: 'var(--font-size-md)' }}>Distribución de confianza</h2>
          {report.distribucionConfianza.length === 0 ? (
            <p className="empty-state">Sin assertions curadas.</p>
          ) : (
            <ul>
              {report.distribucionConfianza.map((d) => (
                <li key={d.confianza} className="mono" data-testid={`confianza-${d.confianza}`}>
                  {d.confianza}: {d.n}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {manifiesto ? (
        <section aria-label="Manifiesto del dataset" className="card" style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 'var(--font-size-md)' }}>Manifiesto del dataset</h2>
          <p className="mono guia-tecnica">
            {String(manifiesto['version'])} · publicado {String(manifiesto['publishedOn'])} · esquema v{String(manifiesto['schemaVersion'])}
          </p>
          <p className="mono guia-tecnica">sha256: {String(manifiesto['sha256'] ?? '—').slice(0, 24)}…</p>
          <p className="guia-tecnica">
            Conteos: {Object.entries((manifiesto['counts'] ?? {}) as Record<string, number>).map(([k, v]) => `${k}: ${v}`).join(' · ')}
          </p>
        </section>
      ) : (
        <p className="guia-tecnica" style={{ marginTop: 20 }}>
          Manifiesto no disponible en el modo demo (consulta el dataset SQLite real para verlo).
        </p>
      )}

      <section aria-label="Cola de reconciliación" style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 'var(--font-size-md)' }}>
          Cola de reconciliación ({pendientes.length} pendiente{pendientes.length === 1 ? '' : 's'})
        </h2>
        <p className="guia-tecnica">
          Candidatos con dedup score en [0.7, 0.98): nunca se fusionan sin revisión humana (NET-HW-045/049).
        </p>
        {pendientes.length === 0 ? (
          <p className="empty-state">No hay candidatos a revisión.</p>
        ) : (
          <div className="stack">
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              Revisión firmada por:
              <input value={autor} onChange={(e) => setAutor(e.target.value)} className="search-input" data-testid="revisor" style={{ width: 160 }} />
            </label>
            {pendientes.map((p) => (
              <div key={p.id} className="card" data-testid={`reconciliacion-${p.id}`}>
                <p className="mono">
                  {p.entradaSlug} ↔ {p.existenteSlug} · score {p.score.toFixed(3)}
                </p>
                <table className="tabla-specs">
                  <thead>
                    <tr>
                      <th scope="col">Campo</th>
                      <th scope="col">Entrante</th>
                      <th scope="col">Existente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.diff.map((d) => (
                      <tr key={d.campo}>
                        <td className="mono">{d.campo}</td>
                        <td className="mono">{d.entrante}</td>
                        <td className="mono">{d.existente}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="row" style={{ gap: 8, marginTop: 6 }}>
                  <button type="button" onClick={() => void resolver(p.id, 'accepted', autor)}>
                    Aceptar (fusionar datos del entrante)
                  </button>
                  <button type="button" onClick={() => void resolver(p.id, 'rejected', autor)}>
                    Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}