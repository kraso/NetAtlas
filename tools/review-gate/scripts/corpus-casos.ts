/**
 * Casos del corpus de respuestas reales: cambios verosímiles del repositorio con
 * violaciones conocidas por construcción, para poder etiquetar a mano los pares
 * de hallazgos que el cruce debe unir y los que no.
 *
 * Cada caso se monta en un repositorio temporal con el `.gga` real, así que el
 * prompt que recibe el proveedor es el del gate (alcance por hunks y contrato de
 * hallazgos), no una imitación. Lo que se mide con esto son las dos decisiones
 * del cruce: cuánta **similitud de regla** y cuánto **desvío de línea** se
 * toleran entre las dos pasadas.
 *
 * Los casos están elegidos por el par de decisiones que estresan:
 *  - `funcion-larga-y-catch`: dos violaciones distintas a pocas líneas (función
 *    larga + `catch` silencioso): el cruce NO debe unirlas.
 *  - `dos-funciones-largas`: la misma regla dos veces en el mismo fichero: el
 *    cruce sí debe unir el hallazgo con su gemelo de la otra pasada y no con el
 *    de la función vecina.
 *  - `modulo-largo-con-catch`: la violación mecánica (240 líneas) que el gate se
 *    queda para sí, más un `catch` silencioso que sí juzga el proveedor.
 *  - `barrel-en-runtime`: dos reglas con textos distintos sobre el mismo fichero.
 *  - `deuda-fuera-del-cambio`: la violación está en el cambio, pero la que se
 *    cuela es preexistente (dentro de la cabecera): se une igual, no bloquea.
 */
export interface Caso {
  id: string
  /** Violaciones que se han puesto a propósito, para poder etiquetar. */
  esperadas: string
  /** Ficheros que el cambio añade o deja en su versión final. */
  archivos: ReadonlyArray<{ ruta: string; contenido: string }>
  /**
   * Versión previa que se commitea antes: el cambio staged es solo lo que
   * difiera de ella. Sin esto, el caso es un fichero nuevo entero.
   */
  base?: ReadonlyArray<{ ruta: string; contenido: string }>
}

const lineas = (texto: string): string => `${texto.split('\n').join('\n')}\n`

/** Cuerpo de una función larga, con el mismo aspecto que el de la app. */
function cuerpoLargo(nombre: string, lineasUtiles: number): string[] {
  const salida = [`export function ${nombre}(entrada: readonly Registro[]): Resultado {`, '  const salida: Registro[] = []']
  for (let i = 1; i <= lineasUtiles; i += 1) {
    salida.push(`  if (entrada[${i}] !== undefined) salida.push({ ...entrada[${i}], orden: ${i} })`)
  }
  salida.push('  return { registros: salida, total: salida.length }', '}')
  return salida
}

const CABECERA_APP = [
  '/** Utilidades de carga del catálogo (app). */',
  'export interface Registro {',
  '  readonly id: string',
  '  readonly orden?: number',
  "  readonly nombre: string",
  '}',
  '',
  'export interface Resultado {',
  '  readonly registros: readonly Registro[]',
  '  readonly total: number',
  '}',
  '',
  'const almacen = new Map<string, Registro>()',
  '',
  'export function escribir(registro: Registro): void {',
  '  almacen.set(registro.id, registro)',
  '}',
].join('\n')

const FUNCION_LARGA_Y_CATCH = [
  CABECERA_APP,
  '',
  'export const FILTROS = { soloActivos: true, ordenPor: \'nombre\' }',
  '',
  ...cuerpoLargo('cargarCatalogo', 40),
  '',
  'export function guardarEnElAlmacen(registros: readonly Registro[]): void {',
  '  try {',
  '    for (const registro of registros) {',
  '      escribir(registro)',
  '    }',
  '  } catch {',
  '  }',
  '}',
]

const DOS_FUNCIONES_LARGAS = [
  CABECERA_APP,
  '',
  ...cuerpoLargo('ordenarPorNombre', 30),
  '',
  ...cuerpoLargo('reagruparPorFamilia', 30),
]

/** Módulo por encima del límite mecánico, con un `catch` silencioso dentro. */
function moduloLargo(): string[] {
  const salida = [CABECERA_APP, '', 'export function recogerTodo(entrada: readonly Registro[]): Resultado {']
  salida.push('  const salida: Registro[] = []')
  for (let i = 1; i <= 45; i += 1) {
    salida.push(`  salida.push({ id: 'paso-${i}', nombre: 'paso ${i}', orden: ${i} })`)
    salida.push(`  if (entrada.length > ${i}) salida.push({ ...entrada[0] as Registro, orden: ${i} })`)
  }
  salida.push('  return { registros: salida, total: salida.length }', '}', '')
  const relleno: string[] = []
  for (let i = 1; i <= 40; i += 1) {
    relleno.push(`export const ETIQUETA_${i} = 'etiqueta ${i}'`)
  }
  return [...salida, ...relleno, '', 'export function limpiarAlmacen(): void {', '  try {', '    almacen.clear()', '  } catch {', '  }', '}']
}

const BARREL_EN_RUNTIME = [
  "import { importarLote } from '@netatlas/application'",
  "import { crearCliente } from '../adapters/in-memory-ia.js'",
  '',
  'export interface Lote { readonly rutas: readonly string[] }',
  '',
  ...cuerpoLargo('procesarLote', 34),
  '',
  'export function resumirLote(lote: Lote): string {',
  "  return `lote con ${lote.rutas.length} rutas`",
  '}',
]

const DEUDA_BASE = [
  CABECERA_APP,
  '',
  'export function sincronizarTodo(entrada: readonly Registro[]): Resultado {',
  '  const salida: Registro[] = []',
  '  for (const registro of entrada) {',
  '    try {',
  '      salida.push({ ...registro, orden: salida.length })',
  '    } catch {',
  '    }',
  '  }',
  '  return { registros: salida, total: salida.length }',
  '}',
  '',
  ...Array.from({ length: 60 }, (_, indice) => `export const MARCA_${indice + 1} = ${indice + 1}`),
]

const DEUDA_FINAL = [
  ...DEUDA_BASE,
  '',
  'export function compactar(entrada: readonly Registro[]): Resultado {',
  '  return { registros: entrada.filter((registro) => registro.nombre !== \'\'), total: entrada.length }',
  '}',
]

/** La función larga termina justo antes del `catch` vacío: lo más cerca que pueden estar dos violaciones distintas. */
const FUNCION_Y_CATCH_PEGADOS = [
  CABECERA_APP,
  '',
  ...cuerpoLargo('prepararSalida', 32),
  'export function vaciarAlmacen(): void {',
  '  try {',
  '    almacen.clear()',
  '  } catch {',
  '  }',
  '}',
]

/** Dos `catch` vacíos distintos, a dos líneas: la misma regla dos veces, pero no el mismo hallazgo. */
const DOS_CATCHES_VECINOS = [
  CABECERA_APP,
  '',
  'export function limpiarTodo(): void {',
  '  try {',
  '    almacen.clear()',
  '  } catch {',
  '  }',
  '',
  '  try {',
  "    almacen.delete('temporal')",
  '  } catch {',
  '  }',
  '}',
]

export const CASOS: readonly Caso[] = [
  {
    id: 'funcion-larga-y-catch',
    esperadas: 'una función de 44 líneas y un `catch` vacío que se traga el fallo, a pocas líneas',
    archivos: [{ ruta: 'apps/app/src/ui/cargar-datos.ts', contenido: lineas(FUNCION_LARGA_Y_CATCH.join('\n')) }],
  },
  {
    id: 'dos-funciones-largas',
    esperadas: 'dos funciones de 34 líneas en el mismo fichero',
    archivos: [{ ruta: 'apps/app/src/ui/ordenar-registros.ts', contenido: lineas(DOS_FUNCIONES_LARGAS.join('\n')) }],
  },
  {
    id: 'modulo-largo-con-catch',
    esperadas: 'módulo de más de 200 líneas (mecánico) con un `catch` vacío al final',
    archivos: [{ ruta: 'apps/app/src/ui/recoger-todo.ts', contenido: lineas(moduloLargo().join('\n')) }],
  },
  {
    id: 'barrel-en-runtime',
    esperadas: 'import de valor del barrel @netatlas/application y una función de 38 líneas',
    archivos: [{ ruta: 'apps/app/src/ui/procesar-lote.ts', contenido: lineas(BARREL_EN_RUNTIME.join('\n')) }],
  },
  {
    id: 'funcion-y-catch-pegados',
    esperadas: 'una función de 36 líneas cuya última línea toca el `catch` vacío: dos violaciones distintas a una línea',
    archivos: [{ ruta: 'apps/app/src/ui/preparar-salida.ts', contenido: lineas(FUNCION_Y_CATCH_PEGADOS.join('\n')) }],
  },
  {
    id: 'dos-catches-vecinos',
    esperadas: 'dos `catch` vacíos distintos a dos líneas: la misma regla, dos instancias',
    archivos: [{ ruta: 'apps/app/src/ui/limpiar-todo.ts', contenido: lineas(DOS_CATCHES_VECINOS.join('\n')) }],
  },
  {
    id: 'deuda-fuera-del-cambio',
    esperadas: 'un `catch` vacío preexistente (línea 8) y una función nueva al final',
    archivos: [{ ruta: 'apps/app/src/ui/sincronizar-todo.ts', contenido: lineas(DEUDA_FINAL.join('\n')) }],
    base: [{ ruta: 'apps/app/src/ui/sincronizar-todo.ts', contenido: lineas(DEUDA_BASE.join('\n')) }],
  },
]
