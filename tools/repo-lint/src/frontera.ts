/**
 * Regla de frontera del bundle: qué módulos pueden acabar en el navegador y
 * cuáles no.
 *
 * Se recorre el grafo de imports **de valor** desde la entrada que declara
 * `apps/app/index.html` (`src/main.tsx`): los de tipo no cuentan, porque con
 * `verbatimModuleSyntax` el compilado los borra enteros. Si por ahí se alcanza
 * un builtin de Node (`node:sqlite`, `node:fs`…), el build lo deja en un stub,
 * el chunk no se puede ejecutar y la app queda inservible; el camino se reporta
 * para saber por dónde entró.
 *
 * `@netatlas/server` define la frontera con dos casos:
 *
 * - El barrel (`@netatlas/server`) NO cruza: reexporta `sqlite-store` →
 *   `node:sqlite`. La app no lo importa; habla con el servidor por la subruta
 *   `@netatlas/server/sync-http`, que es transporte sobre `fetch` y sí cruza.
 * - La composición SQLite del escritorio sí importa `node:path` y `node:sqlite`,
 *   y entra al bundle como chunk perezoso (se importa en dinámico desde la
 *   composición raíz y solo se evalúa donde hay runtime de Node): es una
 *   **puerta de Node** de `PUERTAS_NODE`. La regla no la juzga, pero la nombra,
 *   así que una puerta nueva hay que declararla a la vista.
 *
 * La resolución de specifiers vive en `frontera-resolucion.ts`: aquí solo se
 * camina el grafo y se decide.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { carpetasDeProyectos, fuenteDeModulo, relativa, resolver } from './frontera-resolucion.js'
import { sentenciasDeValor } from './sentencias-valor.js'

/** Builtin de Node: ningún navegador lo carga. */
export const PREFIJO_NODE = 'node:'

/** Entrada del bundle: la que carga el `index.html` de la app. */
export const ENTRADA_APP = join('apps', 'app', 'src', 'main.tsx')

/** La subruta del servidor que sí cruza: transporte sobre `fetch`. */
export const SUBRUTA_NAVEGADOR = '@netatlas/server/sync-http'

/**
 * Puertas de Node: subárboles que la app alcanza a propósito y que solo se
 * evalúan donde hay Node. Se declaran aquí, con el motivo, en vez de eximir un
 * `node:*` suelto: una puerta nueva se ve en el diff.
 */
export const PUERTAS_NODE: ReadonlyMap<string, string> = new Map([
  [
    'apps/app/src/composition-root-sqlite.ts',
    'composición SQLite del escritorio: se importa en dinámico desde la composición raíz y solo se evalúa con runtime de Node',
  ],
])

export interface ViolacionFrontera {
  /** Módulo que importa el builtin, relativo a la raíz. */
  readonly ruta: string
  readonly specifier: string
  /** Camino desde la entrada del bundle hasta ese módulo: por dónde entró. */
  readonly cadena: readonly string[]
}

export interface InformeFrontera {
  /** `true` cuando no está la entrada: sin ella no hay nada que revisar. */
  readonly ausente: boolean
  /** Módulos alcanzables desde la entrada, sin contar la entrada. */
  readonly alcanzados: number
  /** Puertas de Node cruzadas, declaradas en `PUERTAS_NODE`. */
  readonly puertas: readonly string[]
  readonly violaciones: readonly ViolacionFrontera[]
}

/** Camino desde la entrada hasta el módulo: por dónde entró al bundle. */
function cadena(raizRepo: string, padre: ReadonlyMap<string, string | undefined>, hasta: string): readonly string[] {
  const camino: string[] = []
  let actual: string | undefined = hasta
  while (actual !== undefined) {
    camino.unshift(relativa(raizRepo, actual))
    actual = padre.get(actual)
  }
  return camino
}

interface Frontera {
  readonly vistos: Set<string>
  readonly padre: Map<string, string | undefined>
  readonly puertas: string[]
  readonly violaciones: ViolacionFrontera[]
}

/** Lo que no cambia a lo largo del recorrido: la raíz y las carpetas del workspace. */
interface Contexto {
  readonly raizRepo: string
  readonly carpetas: ReadonlyMap<string, string>
}

/** Expande un módulo y devuelve los destinos nuevos que hay que seguir. */
function expandir(ctx: Contexto, frontera: Frontera, actual: string): readonly string[] {
  const destinos: string[] = []
  const ruta = relativa(ctx.raizRepo, actual)
  for (const { specifier } of sentenciasDeValor(fuenteDeModulo(actual), ruta)) {
    if (specifier.startsWith(PREFIJO_NODE)) {
      frontera.violaciones.push({ ruta, specifier, cadena: cadena(ctx.raizRepo, frontera.padre, actual) })
      continue
    }
    const destino = resolver(actual, specifier, ctx.carpetas)
    if (destino === null || frontera.vistos.has(destino)) continue
    frontera.vistos.add(destino)
    frontera.padre.set(destino, actual)
    const destinoRel = relativa(ctx.raizRepo, destino)
    if (PUERTAS_NODE.has(destinoRel)) {
      frontera.puertas.push(destinoRel)
      continue
    }
    destinos.push(destino)
  }
  return destinos
}

/** Frontera del bundle, o `ausente` si no está la entrada que hay que seguir. */
function recorrer(raizRepo: string): Frontera & { readonly ausente: boolean } {
  const entrada = join(raizRepo, ENTRADA_APP)
  const frontera: Frontera = { vistos: new Set(), padre: new Map(), puertas: [], violaciones: [] }
  if (!existsSync(entrada)) return { ...frontera, ausente: true }
  const ctx: Contexto = { raizRepo, carpetas: carpetasDeProyectos(raizRepo) }
  frontera.vistos.add(entrada)
  // Cola con índice en vez de `shift()`: el array crece y no se reconstruye a
  // cada paso, que con un workspace entero importa.
  const cola = [entrada]
  for (let i = 0; i < cola.length; i += 1) {
    const actual = cola[i]
    if (actual === undefined) continue
    cola.push(...expandir(ctx, frontera, actual))
  }
  return { ...frontera, ausente: false }
}

/** Revisa la frontera y devuelve los builtins de Node alcanzables desde la app. */
export function revisarFrontera(raizRepo: string): InformeFrontera {
  const { ausente, vistos, puertas, violaciones } = recorrer(raizRepo)
  violaciones.sort((a, b) => a.ruta.localeCompare(b.ruta) || a.specifier.localeCompare(b.specifier))
  return {
    ausente,
    alcanzados: ausente ? 0 : vistos.size - 1,
    puertas: [...puertas].sort(),
    violaciones,
  }
}
