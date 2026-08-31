import React from 'react'

/**
 * Iconografía por macrocategoría (§10.1).
 * Set propio SVG, trazo 1.5 px, glifo geométrico identificador por CAT-*.
 * Accesible: cada icono lleva aria-hidden + el texto asociado en la UI.
 */

export type MacroCategoriaId =
  | 'CAT-IFC'
  | 'CAT-SWT'
  | 'CAT-RTR'
  | 'CAT-WLS'
  | 'CAT-ACC'
  | 'CAT-SEC'
  | 'CAT-TEL'
  | 'CAT-OPT'
  | 'CAT-IND'
  | 'CAT-IOT'
  | 'CAT-DCN'
  | 'CAT-PAS'
  | 'CAT-PWR'
  | 'CAT-VIR'
  | 'CAT-TST'

/** Norma informal de contorno: viewBox 24×24, trazo 1.5, fill none. */
const STROKE = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const PATH_BY_CAT: Record<MacroCategoriaId, React.ReactNode> = {
  'CAT-IFC': (
    <React.Fragment>
      <path d="M4 8h5v8H4z M15 8h5v8h-5z" {...STROKE} />
      <path d="M9 12h6" {...STROKE} />
    </React.Fragment>
  ),
  'CAT-SWT': (
    <React.Fragment>
      <path d="M4 5h16v14H4z" {...STROKE} />
      <path d="M8 8h8M8 12h8M8 16h8" {...STROKE} />
    </React.Fragment>
  ),
  'CAT-RTR': (
    <React.Fragment>
      <circle cx="12" cy="12" r="3" {...STROKE} />
      <path d="M12 9V4M12 15v5M9 12H4M15 12h5" {...STROKE} />
    </React.Fragment>
  ),
  'CAT-WLS': (
    <React.Fragment>
      <path d="M5 9a10 10 0 0 1 14 0" {...STROKE} />
      <path d="M8 12.5a6 6 0 0 1 8 0" {...STROKE} />
      <path d="M11 16a1.5 1.5 0 0 1 2 0" {...STROKE} />
    </React.Fragment>
  ),
  'CAT-ACC': (
    <React.Fragment>
      <path d="M4 8l8-4 8 4v8l-8 4-8-4z" {...STROKE} />
      <path d="M4 8l8 4 8-4M12 12v8" {...STROKE} />
    </React.Fragment>
  ),
  'CAT-SEC': (
    <React.Fragment>
      <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" {...STROKE} />
      <path d="M9.5 12l2 2 3.5-4" {...STROKE} />
    </React.Fragment>
  ),
  'CAT-TEL': (
    <React.Fragment>
      <path d="M4 7h16M4 17h16M7 7v10M17 7v10" {...STROKE} />
    </React.Fragment>
  ),
  'CAT-OPT': (
    <React.Fragment>
      <path d="M12 4v16M4 12h16" {...STROKE} />
      <path d="M6 7l2-1 8-1 2 1M6 17l2 1 8 1 2-1" {...STROKE} />
    </React.Fragment>
  ),
  'CAT-IND': (
    <React.Fragment>
      <path d="M4 18V9l4-3h8l4 3v9M4 18h16" {...STROKE} />
      <path d="M8 9v3M12 9v3M16 9v3M8 15h8" {...STROKE} />
    </React.Fragment>
  ),
  'CAT-IOT': (
    <React.Fragment>
      <rect x="9" y="9" width="6" height="6" {...STROKE} />
      <path d="M9 6a3 3 0 0 0-3 3M15 6a3 3 0 0 1 3 3M9 18a3 3 0 0 1-3-3M15 18a3 3 0 0 0 3-3" {...STROKE} />
    </React.Fragment>
  ),
  'CAT-DCN': (
    <React.Fragment>
      <rect x="6" y="5" width="12" height="9" {...STROKE} />
      <path d="M10 5V9h4V5M10 14v5M14 14v5M8 19h8" {...STROKE} />
    </React.Fragment>
  ),
  'CAT-PAS': (
    <React.Fragment>
      <path d="M5 7h4M8 5v4M15 7h4M18 5v4M6 17h12" {...STROKE} />
      <path d="M9 15v4M15 15v4" {...STROKE} />
    </React.Fragment>
  ),
  'CAT-PWR': (
    <React.Fragment>
      <path d="M12 4v8M9 7a3.5 3.5 0 0 0 6 0" {...STROKE} />
      <path d="M5 16a7 7 0 0 1 14 0v3H5z" {...STROKE} />
    </React.Fragment>
  ),
  'CAT-VIR': (
    <React.Fragment>
      <rect x="4" y="4" width="16" height="16" rx="2" {...STROKE} />
      <path d="M4 12h16M8 4v16" {...STROKE} />
    </React.Fragment>
  ),
  'CAT-TST': (
    <React.Fragment>
      <path d="M5 19h14" {...STROKE} />
      <path d="M7 19v-7M12 19V9M17 19V5" {...STROKE} />
    </React.Fragment>
  ),
}

export interface CategoryIconProps {
  readonly category: MacroCategoriaId | string
  readonly size?: number
}

/** Cualquier código CAT-* se normaliza a su macrocategoría raíz. */
export function macroOf(categoryCode: string): MacroCategoriaId {
  const root = categoryCode.split('-').slice(0, 2).join('-') as MacroCategoriaId
  return root in PATH_BY_CAT ? root : 'CAT-TST'
}

export function CategoryIcon({ category, size = 20 }: CategoryIconProps): React.JSX.Element {
  const root = macroOf(category)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-hidden="true"
      focusable="false"
      data-cat={root}
    >
      {PATH_BY_CAT[root]}
    </svg>
  )
}