import React from 'react'
import { Link } from 'react-router-dom'
import { useServices } from '../composition-root.js'
import type { UiGraphSubgraph } from '../composition-root.js'
import type { Device } from '@netatlas/domain'

/**
 * Genealogía (NET-HW-031, F3): cadena evolutiva de dispositivos
 * (succeeds/precedes/replaced-by/variant-of) y árbol de evolución de
 * tecnologías (evolves-into) dentro de la vecindad del dispositivo.
 * Todo se lee del grafo; si no hay datos curados se muestra empty-state.
 */

const GENEALOGICOS = ['succeeds', 'precedes', 'replaced-by', 'variant-of']
const TECNOLOGICOS = ['evolves-into', 'uses-technology']
const PROFUNDIDAD = 8

interface ParDirigido {
  suc: string
  pred: string
}

/** Normaliza una arista device→device a un par dirigido {sucesor, predecesor}. */
function parDirigido(source: string, target: string, predicate: string): ParDirigido | undefined {
  switch (predicate) {
    case 'succeeds': // subject sucede a object → subject=sucesor
      return { suc: source, pred: target }
    case 'precedes': // subject precede a object → object=sucesor
      return { suc: target, pred: source }
    case 'replaced-by': // subject reemplazado por object → object=sucesor
      return { suc: target, pred: source }
    default:
      return undefined
  }
}

export function Genealogia({ device }: { device: Device }): React.JSX.Element {
  const [subgrafo, setSubgrafo] = React.useState<UiGraphSubgraph | undefined>()
  const slug = device.slug.value

  React.useEffect(() => {
    void (async () => {
      const { graph } = useServices.getState().services
      const sg = await graph.vecindad({ type: 'device', slug }, PROFUNDIDAD, [...GENEALOGICOS, ...TECNOLOGICOS])
      setSubgrafo(sg)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  if (!subgrafo) return <p role="status">Cargando genealogía…</p>
  if (subgrafo.edges.length === 0) {
    return <p className="empty-state">Genealogía (succeeds/precedes/replaced-by, evolves-into) pendiente de curación.</p>
  }

  // ── Dispositivos: árbol evolutivo ──────────────────────────────────────
  const pares = new Map<string, ParDirigido>()
  const hermanos: string[] = []
  for (const e of subgrafo.edges) {
    const a = e.source.startsWith('device:') ? e.source.slice('device:'.length) : undefined
    const b = e.target.startsWith('device:') ? e.target.slice('device:'.length) : undefined
    if (a === undefined || b === undefined) continue
    if (e.predicate === 'variant-of') {
      if (a !== slug && !hermanos.includes(a)) hermanos.push(a)
      if (b !== slug && !hermanos.includes(b)) hermanos.push(b)
      continue
    }
    const par = parDirigido(a, b, e.predicate)
    if (par) pares.set([par.suc, par.pred].sort().join('|'), par)
  }

  const predecesoresDe = (s: string): string[] =>
    [...pares.values()].filter((p) => p.suc === s).map((p) => p.pred)
  const sucesoresDe = (s: string): string[] =>
    [...pares.values()].filter((p) => p.pred === s).map((p) => p.suc)

  const ancestros = cadena(slug, predecesoresDe) // [slug, predecesor, prec-de-prec…]
  const descendientes = cadena(slug, sucesoresDe)

  // ── Tecnologías: cadenas evolves-into ──────────────────────────────────
  const tech = new Map<string, { de: string; a: string }>()
  for (const e of subgrafo.edges) {
    if (e.predicate !== 'evolves-into') continue
    const de = e.source.startsWith('technology:') ? e.source.slice('technology:'.length) : undefined
    const a = e.target.startsWith('technology:') ? e.target.slice('technology:'.length) : undefined
    if (de !== undefined && a !== undefined) tech.set(`${de}→${a}`, { de, a })
  }
  const cadenasTech = cadenasDe(tech)

  return (
    <div className="stack">
      <h2 style={{ fontSize: 'var(--font-size-md)' }}>Árbol evolutivo de dispositivos</h2>
      {ancestros.length <= 1 && descendientes.length <= 1 && hermanos.length === 0 ? (
        <p className="guia-tecnica">Sin vínculos de sucesión curados para este dispositivo.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <section aria-label="Antecesores">
            <h3 style={{ fontSize: 'var(--font-size-sm)' }}>Antecesores</h3>
            <ul className="arbol-genealogia">
              {ancestros.slice(1).map((s, i) => (
                <li key={s} className="mono" style={{ paddingLeft: i * 18 }}>
                  <Link to={`/device/${s}`}>{s}</Link>
                </li>
              ))}
              {ancestros.length > 1 ? <li className="guia-tecnica" style={{ paddingLeft: (ancestros.length - 1) * 18 }}>↓</li> : null}
              <li className="mono" style={{ fontWeight: 700 }}>{slug}</li>
            </ul>
          </section>
          <section aria-label="Sucesores">
            <h3 style={{ fontSize: 'var(--font-size-sm)' }}>Sucesores</h3>
            <ul className="arbol-genealogia">
              <li className="mono" style={{ fontWeight: 700 }}>{slug}</li>
              {descendientes.length > 1 ? <li className="guia-tecnica" style={{ paddingLeft: 18 }}>↓</li> : null}
              {descendientes.slice(1).map((s, i) => (
                <li key={s} className="mono" style={{ paddingLeft: (i + 1) * 18 }}>
                  <Link to={`/device/${s}`}>{s}</Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
      {hermanos.length > 0 ? (
        <p>
          Variantes relacionadas:{' '}
          {hermanos.map((s) => (
            <Link key={s} to={`/device/${s}`} className="mono" style={{ marginRight: 8 }}>{s}</Link>
          ))}
        </p>
      ) : null}

      <h2 style={{ fontSize: 'var(--font-size-md)' }}>Evolución de tecnologías</h2>
      {cadenasTech.length === 0 ? (
        <p className="guia-tecnica">
          Sin aristas evolves-into en la vecindad (tecnologías transversales §8.1).
        </p>
      ) : (
        <ul>
          {cadenasTech.map((cadena) => (
            <li key={cadena.join('→')} className="mono">
              {cadena.map((t, i) => (
                <span key={t}>
                  {i > 0 ? ' → ' : ''}
                  {t}
                </span>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** BFS dirigido: desde start, encadena siguiendo `siguiente` hasta agotar (acíclico). */
function cadena(start: string, siguiente: (s: string) => string[]): string[] {
  const out: string[] = [start]
  const visitado = new Set<string>([start])
  let actual = start
  let guard = 0
  while (guard++ < 32) {
    const cands = siguiente(actual).filter((c) => !visitado.has(c))
    if (cands.length === 0) break
    // Toma el primer candidato (árbol canónico; sin ciclos por lint §19.5-10)
    actual = cands[0]!
    visitado.add(actual)
    out.push(actual)
  }
  return out
}

/** Cadenas A→B→C a partir de aristas evolves-into no ramificadas. */
function cadenasDe(tech: ReadonlyMap<string, { de: string; a: string }>): string[][] {
  const de = new Map<string, string>()
  const a = new Map<string, string>()
  for (const { de: x, a: y } of tech.values()) {
    de.set(x, y)
    a.set(y, x)
  }
  const inicios = [...de.keys()].filter((x) => !a.has(x))
  const cadenas: string[][] = []
  for (const ini of inicios) {
    const cad: string[] = [ini]
    let actual = ini
    let guard = 0
    while (de.has(actual) && guard++ < 32) {
      actual = de.get(actual)!
      cad.push(actual)
    }
    cadenas.push(cad)
  }
  // También cadenas aisladas sin inicio detectable (ciclos no esperados)
  const cubiertos = new Set(cadenas.flat())
  for (const { de: x, a: y } of tech.values()) {
    if (!cubiertos.has(x)) cadenas.push([x, y])
  }
  return cadenas
}