import { describe, expect, it } from 'vitest'
import { construirAlcance, type AlcanceFichero } from '../src/alcance.js'
import type { Hunk } from '../src/hunks.js'
import { esReglaMecanica, revisarMecanicas } from '../src/mecanicas.js'
import { alcanceDePrueba, correrGate } from './soporte.js'

const RUTA = 'apps/app/src/largo.ts'

function alcance(ruta: string, contenido: readonly string[], hunks: readonly Hunk[]): AlcanceFichero {
  return construirAlcance({ ruta, contenido: contenido.join('\n'), hunks: [...hunks] })
}

/** Fichero de relleno de `total` líneas, con `cambiadas` marcadas al final. */
function relleno(total: number, cambiadas: number, borradas = 0): AlcanceFichero {
  const lineas = Array.from({ length: total }, (_, indice) => `const linea${indice + 1} = ${indice + 1}`)
  return alcance(RUTA, lineas, [{ desde: total - cambiadas + 1, hasta: total, borradas }])
}

function imports(cantidad: number): string[] {
  return Array.from(
    { length: cantidad },
    (_, indice) => `import { cosa${indice + 1} } from './pieza${indice + 1}.js'`,
  )
}

function conNombres(lineas: readonly string[], ruta = RUTA): AlcanceFichero {
  return alcance(
    ruta,
    lineas,
    lineas.map((_, indice) => ({ desde: indice + 1, hasta: indice + 1, borradas: 0 })),
  )
}

describe('límite de líneas del módulo', () => {
  it('bloquea el cambio que cruza el límite, con la línea y la cuenta delante', () => {
    const { bloqueantes, avisos } = revisarMecanicas([relleno(205, 6, 1)])
    expect(avisos).toEqual([])
    expect(bloqueantes).toHaveLength(1)
    expect(bloqueantes[0]).toMatchObject({ ruta: RUTA, linea: 200, regla: 'Módulos de menos de 200 líneas' })
    expect(bloqueantes[0]?.evidencia).toContain('lo lleva a 205 líneas')
  })

  it('un módulo que ya venía por encima avisa y no bloquea', () => {
    const { bloqueantes, avisos } = revisarMecanicas([relleno(205, 2)])
    expect(bloqueantes).toEqual([])
    expect(avisos[0]?.evidencia).toContain('ya venía con 205 líneas')
  })

  it('un módulo del límite hacia abajo no dice nada', () => {
    expect(revisarMecanicas([relleno(200, 4)])).toMatchObject({ bloqueantes: [], avisos: [], informativos: [] })
  })

  it('el barrel largo queda exento: su tamaño es la superficie pública', () => {
    const barrel = Array.from({ length: 205 }, (_, indice) => `export * from './pieza${indice + 1}.js'`)
    const { bloqueantes, avisos, informativos } = revisarMecanicas([
      alcance('packages/domain/src/index.ts', barrel, [{ desde: 200, hasta: 205, borradas: 0 }]),
    ])
    expect({ bloqueantes, avisos, informativos }).toEqual({ bloqueantes: [], avisos: [], informativos: [] })
  })

  it('los ficheros de test y lo que no es `src` quedan fuera de la cuenta', () => {
    const cambio = [{ desde: 200, hasta: 205, borradas: 0 }]
    const largo = Array.from({ length: 205 }, (_, indice) => `const linea${indice + 1} = ${indice + 1}`)
    const fuera = [
      alcance('apps/app/src/piezas.test.ts', largo, cambio),
      alcance('apps/app/e2e/camino.spec.ts', largo, cambio),
      alcance('tools/dataset-tools/fixtures/ejemplo.ts', largo, cambio),
    ]
    expect(revisarMecanicas(fuera)).toEqual({ bloqueantes: [], avisos: [], informativos: [] })
  })
})

describe('declaraciones de import', () => {
  it('cuenta el cambio que cruza el máximo y lo señala, sin bloquear el commit', () => {
    const lineas = [...imports(5), "import { cosa6 } from './pieza6.js'", 'export const x = 1']
    const { bloqueantes, avisos, informativos } = revisarMecanicas([
      alcance(RUTA, lineas, [{ desde: 6, hasta: 6, borradas: 0 }]),
    ])
    expect(bloqueantes).toEqual([])
    expect(avisos).toEqual([])
    expect(informativos[0]).toMatchObject({ linea: 6, regla: 'Imports: máximo 5 declaraciones' })
    expect(informativos[0]?.evidencia).toContain('lleva el fichero a 6 declaraciones')
  })

  it('un fichero que ya venía por encima se cuenta igual y tampoco bloquea', () => {
    const lineas = [...imports(7), 'export const x = 1']
    const { bloqueantes, informativos } = revisarMecanicas([
      alcance(RUTA, lineas, [{ desde: 8, hasta: 8, borradas: 0 }]),
    ])
    expect(bloqueantes).toEqual([])
    expect(informativos[0]?.evidencia).toContain('venía con 7 declaraciones')
  })

  it('cuenta también los `export … from`', () => {
    const lineas = ["export { a } from './a.js'", "export * from './b.js'", 'export const x = 1']
    const { informativos } = revisarMecanicas([alcance(RUTA, lineas, [{ desde: 3, hasta: 3, borradas: 0 }])])
    expect(informativos).toEqual([])
  })
})

describe('nomenclatura', () => {
  it('señala snake_case en una variable de TS y el tipo en minúscula', () => {
    const { bloqueantes } = revisarMecanicas([conNombres(['const mi_variable = 1', 'interface aparato {}'])])
    expect(bloqueantes.map((hallazgo) => hallazgo.linea)).toEqual([1, 2])
    expect(bloqueantes[0]?.evidencia).toContain('camelCase')
  })

  it('acepta lo que el repositorio usa: componentes en PascalCase y constantes en mayúsculas', () => {
    const bien = conNombres([
      'function Dashboard() {}',
      'const MAX_LINEAS = 200',
      'const miVariable = 1',
      'export class AppStore {}',
      'type Revision = string',
    ])
    expect(revisarMecanicas([bien]).bloqueantes).toEqual([])
  })

  it('señala una columna SQL que no es snake_case', () => {
    const { bloqueantes } = revisarMecanicas([
      conNombres(['const sql = "SELECT id FROM aparatos WHERE deviceId = ?"']),
    ])
    expect(bloqueantes[0]?.evidencia).toContain('deviceId')
    expect(bloqueantes).toHaveLength(1)
  })

  it('en un fichero de test el SQL es dato de ejemplo, aunque el test lo ponga en contraejemplo', () => {
    const { bloqueantes } = revisarMecanicas([
      conNombres(
        ['const ejemplo = "SELECT deviceId FROM aparatos"', 'const buena = "SELECT device_id FROM aparatos"'],
        'apps/app/src/consulta.test.ts',
      ),
    ])
    expect(bloqueantes).toEqual([])
  })

  it('no juzga nombres fuera de TS: en un `*.sh` el snake_case es la convención', () => {
    const script = ['function mi_funcion() {', '  local una_variable=1']
    const { bloqueantes } = revisarMecanicas([
      alcance('tools/repo-lint/scripts/uno.sh', script, [{ desde: 1, hasta: 2, borradas: 0 }]),
    ])
    expect(bloqueantes).toEqual([])
  })
})

describe('cruce con el proveedor', () => {
  it('reconoce las reglas mecánicas por el texto de la regla', () => {
    expect(esReglaMecanica('Módulos de menos de 200 líneas')).toBe(true)
    expect(esReglaMecanica('Imports: máximo 5 declaraciones import')).toBe(true)
    expect(esReglaMecanica('Nomenclatura: camelCase para variables')).toBe(true)
    expect(esReglaMecanica('Funciones de menos de 30 líneas')).toBe(false)
    expect(esReglaMecanica('Error handling explícito, nunca silencioso')).toBe(false)
  })

  it('bloquea la regla mecánica aunque el proveedor apruebe', () => {
    const { codigo, salida, llamadas } = correrGate(['STATUS: PASSED\n'], [relleno(205, 6, 1)])
    expect(codigo).toBe(1)
    expect(llamadas).toBe(1)
    expect(salida).toContain('Mecánicos — los comprueba el gate con el contenido (bloquean) (1)')
    expect(salida).toContain('VEREDICTO: FAILED — 1 regla(s) mecánica(s) incumplida(s)')
  })

  it('el hallazgo del proveedor sobre una regla mecánica no cuenta, ni con dos pasadas', () => {
    const delProveedor = `STATUS: FAILED\nFINDING: apps/app/src/demo.ts|21|Módulos de menos de 200 líneas|el módulo pasa de 200 líneas\n`
    const { codigo, salida, llamadas } = correrGate(
      [delProveedor, delProveedor],
      [alcanceDePrueba('apps/app/src/demo.ts', 120, 20, 24)],
    )
    expect(codigo).toBe(0)
    expect(llamadas).toBe(1)
    expect(salida).toContain('Ignorados del proveedor — reglas mecánicas, ya decididas aquí (1)')
    expect(salida).toContain('VEREDICTO: PASSED')
  })

  it('las reglas mecánicas no dependen de las pasadas: se informan con una sola', () => {
    const { salida } = correrGate(['STATUS: PASSED\n'], [relleno(205, 2)])
    expect(salida).toContain('Mecánicos preexistentes — no bloquean (el cambio no cruza el límite) (1)')
    expect(salida).toContain('VEREDICTO: PASSED')
  })

  it('el conteo de imports lo dice el gate y no falla el commit', () => {
    const lineas = [...imports(6), 'export const x = 1']
    const { codigo, salida } = correrGate(['STATUS: PASSED\n'], [
      alcance(RUTA, lineas, [{ desde: 1, hasta: lineas.length, borradas: 0 }]),
    ])
    expect(codigo).toBe(0)
    expect(salida).toContain('Mecánicos informativos — los cuenta el gate y no bloquean (1)')
    expect(salida).toContain('VEREDICTO: PASSED')
  })
})

describe('reglas que el gate decide solo', () => {
  it('un cambio limpio de un módulo corto no produce mecánicos', () => {
    const { bloqueantes, avisos, informativos } = revisarMecanicas([
      alcanceDePrueba('apps/app/src/demo.ts', 120, 20, 24),
    ])
    expect({ bloqueantes, avisos, informativos }).toEqual({ bloqueantes: [], avisos: [], informativos: [] })
  })
})
