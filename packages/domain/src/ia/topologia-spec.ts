/**
 * Especificación de topología generada por lenguaje (§21.2 escenario 2,
 * NET-HW-061): roles detectados en la frase + validación del JSON de entrada.
 */

export interface RolRequerido {
  readonly rol: string
  readonly cantidad: number
}

export interface TopologiaSpec {
  readonly name: string
  /** Roles detectados (switch/router/host/ap/firewall) con su cantidad. */
  readonly roles: readonly RolRequerido[]
}

export const ROLES_CONOCIDOS: Readonly<Record<string, string>> = {
  switch: 'switch',
  switches: 'switch',
  conmutador: 'switch',
  conmutadores: 'switch',
  router: 'router',
  routers: 'router',
  enrutador: 'router',
  host: 'host',
  hosts: 'host',
  cliente: 'host',
  clientes: 'host',
  equipo: 'host',
  equipos: 'host',
  ap: 'ap',
  aps: 'ap',
  'punto de acceso': 'ap',
  firewall: 'firewall',
  cortafuegos: 'firewall',
  servidor: 'servidor',
  servidores: 'servidor',
}

const NUMEROS: Readonly<Record<string, number>> = {
  un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
}

/** Extrae los roles de una frase de topología: "dos switches, un router y cuatro hosts". */
export function extraerRoles(textoNormalizado: string): readonly RolRequerido[] {
  const roles = new Map<string, number>()
  // Patrón: [número|palabra][espacios]rol(,|y|espacio)
  const re = /(\d+|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(switch|switches|conmutador(?:es)?|router(?:s)?|enrutador(?:es)?|hosts?|clientes?|equipos?|ap(?:s)?|punto de acceso|firewall(?:s)?|cortafuegos|servidores?)\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(textoNormalizado)) !== null) {
    const cantidad = NUMEROS[m[1]!] ?? parseInt(m[1]!, 10)
    const rol = ROLES_CONOCIDOS[m[2]!] ?? m[2]!
    roles.set(rol, (roles.get(rol) ?? 0) + Math.max(1, cantidad))
  }
  // Fallback: "switch" sin número → 1
  if (roles.size === 0 && /\bswitch(es|)\b/.test(textoNormalizado)) roles.set('switch', 1)
  return [...roles.entries()].map(([rol, cantidad]) => ({ rol, cantidad }))
}

/** Parsea la especificación desde texto libre (modo "generación por lenguaje"). */
export function parsearSpec(texto: string, nameSugerido: string): TopologiaSpec {
  const n = texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[,.!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return { name: nameSugerido, roles: extraerRoles(n) }
}

/** Valida que una especificación JSON tenga la forma esperada (esquema §21.2). */
export function validarSpecJSON(valor: unknown): TopologiaSpec | undefined {
  if (typeof valor !== 'object' || valor === null) return undefined
  const v = valor as Record<string, unknown>
  if (typeof v.name !== 'string' || !Array.isArray(v.roles)) return undefined
  const roles: RolRequerido[] = []
  for (const r of v.roles) {
    if (typeof r !== 'object' || r === null) return undefined
    const rr = r as Record<string, unknown>
    if (typeof rr.rol !== 'string' || typeof rr.cantidad !== 'number' || rr.cantidad < 1) return undefined
    roles.push({ rol: rr.rol, cantidad: Math.floor(rr.cantidad) })
  }
  if (roles.length === 0) return undefined
  return { name: v.name, roles }
}
