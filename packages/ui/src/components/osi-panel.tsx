import React from 'react'
import type { OsiProfile } from '@netatlas/domain'

/**
 * Panel OSI/TCP-IP vertical (§8.4.2).
 * Cada capa usa el token semántico `--layer-N`; las capas que el dispositivo
 * termina se resaltan; las transparentes se atenúan.
 * Accesible: la alternativa de texto lista las capas terminadas (no solo color).
 */

export const OSI_LABELS: readonly { num: number; es: string; tcpIp: number }[] = [
  { num: 1, es: 'Física', tcpIp: 1 },
  { num: 2, es: 'Enlace de datos', tcpIp: 1 },
  { num: 3, es: 'Red', tcpIp: 2 },
  { num: 4, es: 'Transporte', tcpIp: 3 },
  { num: 5, es: 'Sesión', tcpIp: 4 },
  { num: 6, es: 'Presentación', tcpIp: 4 },
  { num: 7, es: 'Aplicación', tcpIp: 4 },
]

export interface OsiPanelProps {
  readonly profile: OsiProfile
  /** Selector de capa (consulta inversa): resalta la selección si termina. */
  readonly selected?: readonly number[] | undefined
}

export function OsiPanel({ profile, selected }: OsiPanelProps): React.JSX.Element {
  const { terminate, transparent, primary } = profile
  const selectedSet = new Set(selected ?? [])
  const terminadas = OSI_LABELS.filter((l) => terminate.includes(l.num)).map((l) => l.es)

  return (
    <div className="osi-panel" role="group" aria-label="Perfil de capas OSI">
      <div className="visually-readable" aria-hidden="false">
        <p className="sr-only">
          Capas que termina: {terminadas.join(', ') || 'ninguna'}
          {primary ? ` · capa principal: ${primary}` : ''}
        </p>
      </div>
      <ol className="osi-list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {OSI_LABELS.map((l) => {
          const termina = terminate.includes(l.num)
          const traspasa = transparent.includes(l.num)
          const esPrimaria = l.num === primary
          const enSeleccion = selectedSet.has(l.num)
          return (
            <li key={l.num}>
              <div
                aria-label={`Capa ${l.num} ${l.es} — ${termina ? 'termina' : traspasa ? 'transparente' : 'no participa'}${esPrimaria ? ' (principal)' : ''}`}
                role={termina || enSeleccion ? 'status' : 'listitem'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '6px 10px',
                  border: `1px solid ${enSeleccion ? 'var(--focus-ring)' : 'var(--border)'}`,
                  borderRadius: 6,
                  backgroundColor: termina ? `color-mix(in srgb, var(--layer-${l.num}) 26%, var(--bg-surface))` : 'transparent',
                  opacity: termina ? 1 : 0.55,
                }}
              >
                <span className="mono" style={{ width: 22, textAlign: 'right', color: `var(--layer-${l.num})`, fontWeight: 700 }}>
                  {l.num}
                </span>
                <span style={{ flex: 1, fontWeight: esPrimaria ? 700 : 500 }}>{l.es}</span>
                <span className="mono" aria-hidden="true" style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>
                  TCP/IP {l.tcpIp}
                </span>
                {termina ? (
                  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: `var(--layer-${l.num})` }} />
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}