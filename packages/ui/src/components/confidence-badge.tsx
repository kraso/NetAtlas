import type { Confidence } from '@netatlas/domain'
import React from 'react'

/**
 * Insignia de confianza (§10.1 / §20.3).
 * Regla inviolable: ningún dato crítico sin insignia.
 * Mapea cada nivel a un token de color CSS.
 */
export function confidenceToken(confidence: Confidence): string {
  switch (confidence) {
    case 'official':
      return 'var(--conf-official)'
    case 'derived':
      return 'var(--conf-derived)'
    case 'third-party':
      return 'var(--conf-third-party)'
    case 'experimental':
      return 'var(--conf-experimental)'
    case 'historical':
      return 'var(--conf-historical)'
  }
}

export function confidenceLabel(confidence: Confidence): string {
  switch (confidence) {
    case 'official':
      return 'Oficial'
    case 'derived':
      return 'Derivado'
    case 'third-party':
      return 'Terceros'
    case 'experimental':
      return 'Experimental'
    case 'historical':
      return 'Histórico'
  }
}

export interface ConfidenceBadgeProps {
  readonly confidence: Confidence
  readonly size?: 'sm' | 'md'
}

/** Insignia accesible: el color nunca es el único canal (texto + título). */
export function ConfidenceBadge({ confidence, size = 'md' }: ConfidenceBadgeProps): React.JSX.Element {
  const color = confidenceToken(confidence)
  const label = confidenceLabel(confidence)
  const fontSize = size === 'sm' ? 'var(--font-size-xs)' : 'var(--font-size-sm)'
  return (
    <span
      className="confidence-badge mono"
      role="img"
      aria-label={`Confianza: ${label}`}
      title={`Fuente: ${label}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize,
        fontWeight: 600,
        color: 'var(--conf-fg)',
        backgroundColor: color,
        borderRadius: '10px',
        padding: '1px 8px',
        lineHeight: '1.5',
        border: '1px solid transparent',
      }}
    >
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--conf-fg)', display: 'inline-block', opacity: 0.85 }} />
      {label}
    </span>
  )
}