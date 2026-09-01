import React from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { compareDevices, evaluateCompatibilidad } from '@netatlas/domain'
import type { CompareDeviceInput, ComparisonReport } from '@netatlas/domain'
import { useServices } from '../composition-root.js'
import { Breadcrumbs } from './breadcrumbs.js'
import { generarPdfComparacion } from './exportar-pdf.js'
import type { Device } from '@netatlas/domain'

/**
 * Comparador de dispositivos (F5 / §18, NET-HW-040/041/042).
 *  - Selección 2–N dispositivos (querystring ids=… o a/b retrocompatibles)
 *  - Tabla por atributos EAV (comunes primero), modo "solo diferencias",
 *    insignias ▲/▼ de mejor valor/limitación, filas plegables
 *  - Compatibilidades curadas + incompatibilidades declarativas (041)
 *  - Veredicto por plantilla determinista del dominio (sin IA)
 *  - Aviso de comparación transversal (§18.4)
 *  - Exportación CSV (real) y PDF vía imprimir del navegador (042)
 */

export function Comparar(): React.JSX.Element {
  const [params, setParams] = useSearchParams()
  const navegar = useNavigate()
  const { devices: repo, attributes, graph } = useServices.getState().services
  const [report, setReport] = React.useState<ComparisonReport | null>(null)
  const [cargando, setCargando] = React.useState(true)
  const [soloDiferencias, setSoloDiferencias] = React.useState(false)
  const [expandidas, setExpandidas] = React.useState<ReadonlySet<string>>(new Set())
  const [busqueda, setBusqueda] = React.useState('')
  const [sugerencias, setSugerencias] = React.useState<readonly { slug: string; label: string }[]>([])

  const slugsRaw = params.get('ids') ?? ''
  const slugs = React.useMemo(() => {
    const deIds = slugsRaw ? slugsRaw.split(',').map((s) => s.trim()).filter(Boolean) : []
    const deAb = [
      ...(params.get('a') ? [params.get('a')!] : []),
      ...(params.get('b') ? [params.get('b')!] : []),
    ]
    return [...new Set([...deIds, ...deAb])]
  }, [slugsRaw, params])

  React.useEffect(() => {
    setCargando(true)
    const puertosPorSlug = new Map<string, number[]>()
    const mediosPorSlug = new Map<string, string[]>()
    const poePorSlug = new Map<string, { budget?: number; required?: number }>()
    void (async () => {
      if (slugs.length < 2) {
        setReport(null)
        setCargando(false)
        return
      }
      const inputs: CompareDeviceInput[] = []
      const slugsOrden = [...slugs]
      const deviceSlugs = new Map<string, Device>()
      for (const s of slugsOrden) {
        const d = await repo.findBySlug(s)
        if (d) deviceSlugs.set(s, d)
      }
      for (const s of slugsOrden) {
        const d = deviceSlugs.get(s)
        if (!d) continue
        const vals = await attributes.attributeValuesForDevice(s)
        const dim = await graph.edgesOf({ type: 'device', slug: s })
        const medios = dim.filter((r) => r.predicate === 'terminates-medium').map((r) => r.object.slug)
        const poeBudget = vals.find((v) => v.key === 'poe_budget_w')
        const poeRequired = vals.find((v) => v.key === 'poe_required_w')
        const puertosPoe = d.ports.reduce((acc, p) => acc + (p.poeStandard ? p.quantity : 0), 0)
        inputs.push({
          slug: s,
          name: d.name,
          categoryCode: d.categoryCode,
          categoryName: d.categoryCode,
          attributes: [
            ...vals.map((v) => ({
              def: { key: v.key, labelEs: v.labelEs, valueType: v.valueType, unit: v.unit, compareRule: 'higher-better' as const },
              display: v.display,
              valueNumber: parseNumero(v.display),
            })),
            {
              def: { key: 'puertos_totales', labelEs: 'Puertos totales', valueType: 'number' as const, compareRule: 'higher-better' as const },
              display: String(d.portCount()),
              valueNumber: d.portCount(),
            },
            {
              def: { key: 'puertos_poe', labelEs: 'Puertos con PoE', valueType: 'number' as const, compareRule: 'higher-better' as const },
              display: String(puertosPoe),
              valueNumber: puertosPoe,
            },
            ...(medios.length > 0
              ? [{ def: { key: 'medios', labelEs: 'Medios que termina', valueType: 'text' as const, compareRule: 'none' as const }, display: medios.join(', ') }]
              : []),
          ],
        })
        puertosPorSlug.set(s, d.ports.flatMap((p) => p.speedsMbps))
        mediosPorSlug.set(s, medios)
        poePorSlug.set(s, { budget: poeBudget ? parseNumero(poeBudget.display) : undefined, required: poeRequired ? parseNumero(poeRequired.display) : undefined })
      }

      if (inputs.length < 2) {
        setReport(null)
        setCargando(false)
        return
      }

      // Compatibilidades curadas + incompatibilidades declarativas por par
      const curadas: Array<readonly [string, string]> = []
      const declarativos: { a: string; b: string; res: { compatible: boolean; note?: string } }[] = []
      for (let i = 0; i < inputs.length; i++) {
        for (let j = i + 1; j < inputs.length; j++) {
          const x = inputs[i]!
          const y = inputs[j]!
          const aristasX = await graph.edgesOf({ type: 'device', slug: x.slug })
          if (aristasX.some((r) => r.predicate === 'compatible-with' && r.object.type === 'device' && r.object.slug === y.slug)) {
            curadas.push([x.slug, y.slug])
          }
          const res = evaluateCompatibilidad({
            a: x.slug,
            b: y.slug,
            speedsA: puertosPorSlug.get(x.slug) ?? [],
            speedsB: puertosPorSlug.get(y.slug) ?? [],
            mediumsA: mediosPorSlug.get(x.slug) ?? [],
            mediumsB: mediosPorSlug.get(y.slug) ?? [],
            poeBudgetAW: poePorSlug.get(x.slug)?.budget,
            poeBudgetBW: poePorSlug.get(y.slug)?.budget,
            poeRequiredAW: poePorSlug.get(x.slug)?.required,
            poeRequiredBW: poePorSlug.get(y.slug)?.required,
          })
          if (!res.compatible) declarativos.push({ a: x.slug, b: y.slug, res })
        }
      }

      const informe = compareDevices({ devices: inputs, curatedCompatible: curadas })
      // Adhiere las incompatibilidades declarativas al reporte como notas
      setReport({
        ...informe,
        compatibilidades: [
          ...informe.compatibilidades,
          ...declarativos.map((d) => ({ a: d.a, b: d.b, compatible: false, note: d.res.note })),
        ],
        veredicto: [...declarativos.map((d) => `Incompatibilidad declarada: ${d.res.note}`), ...informe.veredicto],
      })
      setCargando(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slugs.join('|')])

  // Sugerencias del buscador de dispositivos
  React.useEffect(() => {
    if (!busqueda.trim()) {
      setSugerencias([])
      return
    }
    void (async () => {
      const { search } = useServices.getState().services
      const grouped = await search.suggestGrouped(busqueda.trim(), 5)
      setSugerencias(grouped['Dispositivos'] ?? [])
    })()
  }, [busqueda])

  const añadir = (slug: string): void => {
    const next = [...slugs, slug]
    setParams({ ids: next.join(',') }, { replace: true })
    setBusqueda('')
    setSugerencias([])
  }

  const quitar = (slug: string): void => {
    const next = slugs.filter((s) => s !== slug)
    if (next.length === 0) navegar('/comparar')
    else setParams({ ids: next.join(',') }, { replace: true })
  }

  const exportarCsv = (): void => {
    if (!report) return
    const filas = report.rows.flatMap((r) =>
      r.values.map((v) => [r.labelEs, v.deviceSlug, v.display, r.unit ?? '']),
    )
    const csv = [
      ['Atributo', 'Dispositivo', 'Valor', 'Unidad'].join(';'),
      ...filas.map((f) => f.map((c) => c.includes(';') ? `"${c}"` : c).join(';')),
    ].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `netatlas-comparacion-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportarPdf = async (): Promise<void> => {
    if (!report) return
    try {
      // Descarga directa con jsPDF (NET-HW-042, deuda F5 resuelta).
      await generarPdfComparacion(report)
    } catch {
      // Fallback: impresión del navegador si jsPDF no puede generar.
      try {
        window.print()
      } catch {
        // Sin soporte (jsdom): se ignora
      }
    }
  }

  const toggleFila = (key: string): void => {
    setExpandidas((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const visibles = soloDiferencias ? (report?.rows ?? []).filter((r) => !r.allEqual) : (report?.rows ?? [])

  return (
    <section aria-labelledby="titulo-comparar">
      <Breadcrumbs items={[{ label: 'Dashboard', to: '/' }, { label: 'Explorar', to: '/explore' }, { label: 'Comparación' }]} />
      <h1 id="titulo-comparar">Comparación de dispositivos</h1>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <label className="sr-only" htmlFor="buscar-comparar">Añadir dispositivo</label>
        <input
          id="buscar-comparar"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Añadir dispositivo por nombre o slug…"
          className="search-input"
          data-testid="buscar-comparar"
        />
        <button type="button" onClick={exportarCsv}>Exportar CSV</button>
        <button type="button" onClick={() => void exportarPdf()}>Exportar PDF</button>
      </div>
      {sugerencias.length > 0 ? (
        <ul aria-label="Sugerencias" style={{ listStyle: 'none', margin: '4px 0', padding: 0 }}>
          {sugerencias.map((s) => (
            <li key={s.slug}>
              <button type="button" onClick={() => añadir(s.slug)} className="mono guia-tecnica">
                + {s.label} ({s.slug})
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {cargando ? (
        <p role="status">Cargando comparación…</p>
      ) : report === null ? (
        <p className="empty-state">
          El comparador necesita al menos dos dispositivos. Selecciónalos desde el{' '}
          <Link to="/explore">explorador</Link> (casillas + «Comparar seleccionados») o desde una ficha
          («Comparar desde aquí»).
        </p>
      ) : (
        <div className="stack">
          {report.transversal ? (
            <p role="note" className="empty-state">
              Comparación transversal entre categorías: solo las filas comunes se comparan;{' '}
              {report.atributosEspecificos} atributo{report.atributosEspecificos === 1 ? '' : 's'} específico
              {report.atributosEspecificos === 1 ? '' : 's'} no entran en la tabla.
            </p>
          ) : null}

          <div className="row" style={{ gap: 8 }}>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={soloDiferencias} onChange={(e) => setSoloDiferencias(e.target.checked)} aria-label="Modo solo diferencias" />
              Solo diferencias ({report.filasConDiferencias})
            </label>
            <span className="guia-tecnica">▲ mejor valor · ▼ limitación (según regla del atributo)</span>
          </div>

          {visibles.length === 0 ? (
            <p className="empty-state">
              {soloDiferencias ? 'No hay diferencias entre los candidatos con los datos comparados.' : 'Sin atributos comunes que comparar.'}
            </p>
          ) : (
            <table className="tabla-specs">
              <thead>
                <tr>
                  <th scope="col">Atributo</th>
                  {report.devices.map((d) => (
                    <th scope="col" key={d.slug}>
                      <Link to={`/device/${d.slug}`}>{d.name}</Link>
                      <button type="button" onClick={() => quitar(d.slug)} aria-label={`Quitar ${d.name}`} className="mono guia-tecnica" style={{ marginLeft: 6 }}>✕</button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibles.map((r) => (
                  <FilaComparacion key={r.key} fila={r} expandida={expandidas.has(r.key)} onToggle={() => toggleFila(r.key)} />
                ))}
              </tbody>
            </table>
          )}

          {report.especificas.length > 0 ? (
            <p className="guia-tecnica">
              Atributos específicos no comparados: <span className="mono">{report.especificas.map((e) => `${e.labelEs} (${e.key})`).join(' · ')}</span>
            </p>
          ) : null}

          {report.compatibilidades.length > 0 ? (
            <section aria-label="Compatibilidades e incompatibilidades">
              <h2 style={{ fontSize: 'var(--font-size-md)' }}>Compatibilidad entre candidatos</h2>
              <ul>
                {report.compatibilidades.map((c, i) => (
                  <li key={`${c.a}-${c.b}-${i}`} className={c.compatible ? '' : 'empty-state'} style={{ margin: 0 }}>
                    <span className="mono">{c.a} ↔ {c.b}</span>: {c.note ?? (c.compatible ? 'compatibles' : 'incompatibles')}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-label="Veredicto" className="card">
            <h2 style={{ fontSize: 'var(--font-size-md)' }}>Veredicto</h2>
            <ul>
              {report.veredicto.map((v, i) => (
                <li key={i} style={{ margin: '2px 0' }}>{v}</li>
              ))}
            </ul>
            <p className="guia-tecnica" role="note">
              Síntesis determinista por plantilla (sin IA ni puntuación global): la ponderación la decide el usuario.
            </p>
          </section>
        </div>
      )}
    </section>
  )
}

function FilaComparacion({
  fila,
  expandida,
  onToggle,
}: {
  fila: ComparisonReport['rows'][number]
  expandida: boolean
  onToggle: () => void
}): React.JSX.Element {
  return (
    <React.Fragment>
      <tr>
        <th scope="row" style={{ fontWeight: 'normal' }}>
          <button type="button" onClick={onToggle} aria-expanded={expandida} className="mono guia-tecnica" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
            {expandida ? '▾' : '▸'} {fila.labelEs}
            {fila.unit ? <span> ({fila.unit})</span> : null}
            {!fila.common ? <span aria-label="atributo específico"> *</span> : null}
          </button>
        </th>
        {fila.values.map((v) => (
          <td key={v.deviceSlug} className="mono" data-testid={`celda-${fila.key}-${v.deviceSlug}`}>
            {v.display}
            {v.isBest ? <span role="img" aria-label="mejor valor" title="Mejor valor según la regla" data-testid={`best-${fila.key}`}> ▲</span> : null}
            {v.lossReason ? <span aria-hidden="true" title={v.lossReason} style={{ color: 'var(--conf-third-party, #d29922)' }}> ▼</span> : null}
          </td>
        ))}
      </tr>
      {expandida ? (
        <tr>
          <td colSpan={fila.values.length + 1} className="guia-tecnica">
            {fila.values.filter((v) => v.lossReason).map((v) => <p key={v.deviceSlug} style={{ margin: '2px 0' }}>{v.lossReason}</p>)}
            {fila.values.every((v) => !v.lossReason) ? <p style={{ margin: 0 }}>Sin pérdidas frente al mejor valor: todos los candidatos coinciden o no aplica regla numérica.</p> : null}
          </td>
        </tr>
      ) : null}
    </React.Fragment>
  )
}

function parseNumero(display: string): number | undefined {
  const parsed = Number(String(display).replace(/[^\d.\-]/g, ''))
  return Number.isFinite(parsed) ? parsed : undefined
}