import React from 'react'
import { Link } from 'react-router-dom'
import type { Assertion, Relationship } from '@netatlas/domain'

/** Empty-state honesto: se muestra cuando el modelo aún no tiene el dato. */
export const Empty = ({ message }: { message: string }): React.JSX.Element => (
  <p className="empty-state">{message}</p>
)

/**
 * Prefijo que marca fichas estructurales sintéticas (contrato con
 * tools/dataset-tools/src/assisted-gen.ts: las 299 generadas lo llevan en el
 * resumen; ninguna curada). La UI lo usa para la insignia «ficha estructural».
 */
const PREFIJO_ESTRUCTURAL = 'Ficha de referencia estructural'

export function esFichaEstructural(summary: string | undefined): boolean {
  return (summary ?? '').startsWith(PREFIJO_ESTRUCTURAL)
}

/**
 * URL de un recurso servido desde el bundle (`public/assets/…`). Codifica cada
 * segmento: hay datasheets con espacios, `+` y paréntesis en el nombre.
 */
export function urlDeBundle(ruta: string): string {
  return `/${ruta.split('/').map(encodeURIComponent).join('/')}`
}

/** Throughput en Gbps de una assertion, o `undefined` si esa assertion no está. */
export function datoGbps(assertion: Assertion | undefined): number | undefined {
  if (!assertion) return undefined
  const v = JSON.parse(assertion.valueJson) as { gbps?: number }
  return v.gbps
}

/** Extremos `similar-to` de un dispositivo, leyendo la arista en ambos sentidos. */
function peersDe(similares: readonly Relationship[], deviceSlug: string): readonly string[] {
  return similares.map((r) =>
    r.subject.type === 'device' && r.subject.slug === deviceSlug ? r.object.slug : r.subject.slug,
  )
}

interface PropsSimilares {
  readonly deviceSlug: string
  readonly similares: readonly Relationship[]
}

/**
 * Similares curados (NET-HW-032): lista de dispositivos similar-to con el
 * puente «Comparar desde aquí» hacia la ruta /comparar (F5 lo completa).
 */
export function SimilaresComparar({ deviceSlug, similares }: PropsSimilares): React.JSX.Element | null {
  if (similares.length === 0) return null
  const peers = peersDe(similares, deviceSlug)
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
