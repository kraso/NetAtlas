import type { PlanIA } from './comprender-contratos.js'
import type { ResultadoHerramienta } from './assistant.js'
import { contextoVacio } from './rag.js'
import type { ContextoRecuperado, HechoIA } from './rag.js'

/**
 * Conversión de los resultados planos de las herramientas en hechos con citas
 * (§21.1[4]): cada hecho es trazable a su entidad y los valores vienen EXACTOS
 * de los datos devueltos (nunca interpolados/libres). Un builder por herramienta.
 */

type Datos = Readonly<Record<string, unknown>>

export function contextoDesdeResultados(
  resultados: readonly ResultadoHerramienta[],
  plan: PlanIA,
): ContextoRecuperado {
  const hechos: HechoIA[] = []
  for (const r of resultados) hechos.push(...hechosDe(r.herramienta, r.datos, plan, hechos.length))
  if (hechos.length === 0) return contextoVacio()
  return { hechos, consulta: plan.textoBusqueda ?? plan.llamadas.map((l) => l.herramienta).join(', ') }
}

/** Hechos de una herramienta; `hechosPrevios` mantiene el fallback del comparador. */
function hechosDe(
  herramienta: string,
  datos: Datos,
  plan: PlanIA,
  hechosPrevios: number,
): readonly HechoIA[] {
  switch (herramienta) {
    case 'search_catalog':
      return hechosBusqueda(datos)
    case 'get_device':
      return hechosDispositivo(datos)
    case 'compare_devices':
      return hechosComparacion(datos, hechosPrevios)
    case 'find_compatible':
      return hechosCompatibles(datos)
    case 'what_layers':
      return hechosCapas(datos)
    case 'successors':
      return hechosSucesores(datos, plan)
    case 'build_topology':
      return hechosTopologia(datos)
    default:
      return []
  }
}

function hechosBusqueda(datos: Datos): readonly HechoIA[] {
  const lista = (datos.resultados ?? []) as readonly { slug: string; nombre: string; categoria: string }[]
  return lista.slice(0, 8).map((item) => ({
    sujeto: item.nombre,
    sujetoSlug: item.slug,
    tipoSujeto: 'device' as const,
    predicado: 'categoria',
    valor: item.categoria,
  }))
}

/** Ficha del dispositivo: campos fijos + assertions con su fuente. */
function hechosDispositivo(datos: Datos): readonly HechoIA[] {
  const slug = String(datos.slug ?? '')
  const nombre = String(datos.nombre ?? slug)
  const fijos: readonly (readonly [string, unknown])[] = [
    ['fabricante', datos.fabricante],
    ['categoria', datos.categoria],
    ['lanza', datos.lanza],
  ]
  const hechos = fijos
    .filter(([, valor]) => valor !== undefined)
    .map(([predicado, valor]) => hechoDispositivo(nombre, slug, predicado, String(valor)))
  return [...hechos, ...hechosPuertos(datos, nombre, slug), ...hechosAssertions(datos, nombre, slug)]
}

function hechosPuertos(datos: Datos, nombre: string, slug: string): readonly HechoIA[] {
  if (datos.puertos === undefined) return []
  const puertos = Array.isArray(datos.puertos) ? datos.puertos : []
  const total = puertos.reduce((acc: number, p: { cantidad?: number }) => acc + (p.cantidad ?? 0), 0)
  return [hechoDispositivo(nombre, slug, 'puertos', String(total))]
}

function hechosAssertions(datos: Datos, nombre: string, slug: string): readonly HechoIA[] {
  if (!Array.isArray(datos.assertions)) return []
  const lista = datos.assertions as readonly { predicado?: string; valor?: string; fuenteSlug?: string; fuenteTitulo?: string }[]
  return lista
    .filter((a) => a.predicado !== undefined && a.valor !== undefined)
    .map((a) => hechoDispositivo(nombre, slug, a.predicado!, String(a.valor), a.fuenteSlug, a.fuenteTitulo))
}

function hechosComparacion(datos: Datos, hechosPrevios: number): readonly HechoIA[] {
  const filas = (datos.diferencias ?? []) as readonly { clave: string; labelEs: string; valores: Record<string, string> }[]
  const dispositivos = (datos.dispositivos ?? []) as readonly { slug: string; nombre: string }[]
  const nombres = new Map(dispositivos.map((x) => [x.slug, x.nombre]))
  const hechos = filas.flatMap((fila) => hechosDeFila(fila, nombres))
  if (hechos.length === 0 && hechosPrevios === 0 && dispositivos.length > 0) {
    const primero = dispositivos[0]!
    return [hechoDispositivo(primero.nombre, primero.slug, 'comparacion', `comparación de ${dispositivos.length} dispositivos`)]
  }
  return hechos
}

function hechosDeFila(
  fila: { labelEs: string; valores: Record<string, string> },
  nombres: ReadonlyMap<string, string>,
): readonly HechoIA[] {
  return Object.entries(fila.valores ?? {})
    .filter(([, valor]) => valor !== '—' && valor !== '')
    .map(([slug, valor]) =>
      hechoDispositivo(nombres.get(slug) ?? slug, slug, 'comparacion', `${fila.labelEs}: ${valor}`),
    )
}

function hechosCompatibles(datos: Datos): readonly HechoIA[] {
  const dispositivo = String(datos.dispositivo ?? '')
  const compatibles = (datos.compatibles ?? []) as readonly { slug: string; nombre: string; via: string }[]
  return compatibles.map((c) => hechoDispositivo(c.nombre, c.slug, 'compatible con', dispositivo))
}

function hechosCapas(datos: Datos): readonly HechoIA[] {
  const slug = String(datos.slug ?? '')
  const nombre = String(datos.nombre ?? slug)
  const termina = Array.isArray(datos.termina) ? datos.termina.join(', ') : ''
  const transparente = Array.isArray(datos.transparente) ? datos.transparente.join(', ') : ''
  const hechos: HechoIA[] = []
  if (termina) hechos.push(hechoDispositivo(nombre, slug, 'capas que termina', termina))
  if (transparente) hechos.push(hechoDispositivo(nombre, slug, 'capas transparente', transparente))
  return hechos
}

function hechosSucesores(datos: Datos, plan: PlanIA): readonly HechoIA[] {
  const lista = (datos.resultados ?? []) as readonly { relacion: string; slug: string; nombre: string }[]
  return lista.map((s) =>
    hechoDispositivo(s.nombre, s.slug, relacionDe(s.relacion), plan.slugPrincipal ?? ''),
  )
}

function hechosTopologia(datos: Datos): readonly HechoIA[] {
  const slug = String(datos.slug ?? '')
  if (!slug) return []
  return [{
    sujeto: String(datos.nombre ?? 'Topología generada'),
    sujetoSlug: slug,
    tipoSujeto: 'topology',
    predicado: 'topologia generada',
    valor: `${String(datos.nodos ?? 0)} nodos`,
  }]
}

/** Hecho de un dispositivo con cita opcional de la fuente documental. */
function hechoDispositivo(
  sujeto: string,
  sujetoSlug: string,
  predicado: string,
  valor: string,
  fuenteSlug?: string,
  fuenteTitulo?: string,
): HechoIA {
  return { sujeto, sujetoSlug, tipoSujeto: 'device', predicado, valor, fuenteSlug, fuenteTitulo }
}

/** Relación de sucesión → predicado legible en español. */
function relacionDe(relacion: string): string {
  if (relacion === 'replaced-by') return 'reemplaza a'
  if (relacion === 'succeeds') return 'sucede a'
  return 'precede a'
}
