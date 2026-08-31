import React from 'react'
import type { Port } from '@netatlas/domain'

/**
 * Panel frontal SVG (NET-HW-022) — render del inventario de puertos.
 * Cada puerto se pinta como un conector; la velocidad máxima y el PoE
 * determinan el color. Accesible: tabla de equivalencia textual (role="img"
 * con aria-label + lista sr-only de los puertos).
 */

function colorDePuerto(speeds: readonly number[], poe?: string): string {
  const max = Math.max(...speeds, 0)
  if (poe) return 'var(--conf-official)'
  if (max >= 10000) return 'var(--layer-3)'
  if (max >= 1000) return 'var(--layer-2)'
  return 'var(--border-strong)'
}

export interface FrontPanelProps {
  readonly ports: readonly Port[]
  readonly width?: number
}

interface FilaPuertos {
  readonly label: string
  readonly iface: string
  readonly count: number
  readonly speeds: readonly number[]
  readonly poe?: string
}

export function FrontPanel({ ports, width = 320 }: FrontPanelProps): React.JSX.Element {
  // Conservador: agrupar puertos por etiqueta (cada grupo → una fila de conectores)
  const filas: FilaPuertos[] = React.useMemo(() => {
    const filas: FilaPuertos[] = []
    for (const p of ports) {
      filas.push({
        label: p.label,
        iface: p.interfaceCode,
        count: Math.min(p.quantity, 24), // visual acotado; el dato real está en la tabla
        speeds: p.speedsMbps,
        poe: p.poeStandard,
      })
    }
    return filas
  }, [ports])

  const alto = 40 + filas.length * 36

  return (
    <div>
      <svg
        role="img"
        aria-label={`Panel frontal: ${ports.length} grupos de puertos`}
        width={width}
        height={alto}
        viewBox={`0 0 ${width} ${alto}`}
        style={{ background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 8 }}
      >
        {filas.map((fila, i) => {
          const y = 28 + i * 36
          const gap = 6
          const portW = 14
          const maxInRow = Math.floor((width - 40) / (portW + gap))
          const visibles = Math.min(fila.count, maxInRow)
          return (
            <g key={`${fila.label}-${i}`}>
              <text x={10} y={y - 8} fontSize="10" fill="var(--text-muted)" className="mono">
                {fila.iface} · {fila.count}
              </text>
              {Array.from({ length: visibles }).map((_, j) => {
                const x = 36 + j * (portW + gap)
                return (
                  <rect
                    key={j}
                    x={x}
                    y={y}
                    width={portW}
                    height={10}
                    rx={2}
                    fill={colorDePuerto(fila.speeds, fila.poe)}
                    stroke="var(--bg-base)"
                    strokeWidth={1}
                  />
                )
              })}
            </g>
          )
        })}
      </svg>
      <ul className="sr-only" aria-label="Puertos del dispositivo">
        {ports.map((p) => (
          <li key={p.label}>
            {p.label}: {p.interfaceCode} ×{p.quantity} · {p.speedsMbps.join('/')} Mbps{p.poeStandard ? ` · ${p.poeStandard}` : ''}
          </li>
        ))}
      </ul>
    </div>
  )
}