import type { SqliteDriver } from '../driver.js'
import type { PreguntaOro } from '@netatlas/domain'
import { SqliteDeviceRepository } from '../repositories/device-repository.js'
import { SqliteSourcingRepository } from '../repositories/sourcing-repository.js'
import { capasDe, totalPuertos, valorLegible } from './sqlite-assistant-helpers.js'

/**
 * Conjunto de oro determinista (NET-HW-060): una pregunta por (dispositivo
 * relevante × atributo verificable) + escenarios curados. Cada pregunta exige
 * hechos que SÍ existen en la base (se verifica con el oráculo).
 *
 * La lógica está particionada en `sqlite-assistant-conjunto-oro-logica.ts`:
 * - `paginarDispositivos`: pagination por categoría.
 * - `generarPreguntasDeDispositivo`: preguntas por dispositivo.
 * - `escenariosCurados`: preguntas curadas fijas.
 */

/**
 * Paginación: recolecta hasta `total` dispositivos de CAT-SWT y CAT-RTR.
 */
export async function paginarDispositivos(
  repoDevices: SqliteDeviceRepository,
  total: number,
): Promise<readonly { slug: string; nombre: string }[]> {
  const paginas: { slug: string; nombre: string }[] = []
  let cursor: string | undefined
  for (let saltos = 0; saltos < 8 && paginas.length < total; saltos++) {
    const page = await repoDevices.listByCategory('CAT-SWT', { limit: 100, cursor })
    for (const d of page.items) {
      if (paginas.length >= total) break
      paginas.push({ slug: d.slug.value, nombre: d.name })
    }
    cursor = page.nextCursor
    if (cursor === undefined) break
  }
  if (paginas.length < total) {
    const page2 = await repoDevices.listByCategory('CAT-RTR', { limit: total })
    for (const d of page2.items) {
      if (paginas.length >= total) break
      paginas.push({ slug: d.slug.value, nombre: d.name })
    }
  }
  return paginas
}

/**
 * Genera preguntas para un dispositivo: throughput/consumo (numéricas),
 * puertos y capas.
 */
export async function generarPreguntasDeDispositivo(
  repoSourcing: SqliteSourcingRepository,
  db: SqliteDriver,
  d: { slug: string; nombre: string },
): Promise<PreguntaOro[]> {
  const preguntas: PreguntaOro[] = []
  const assertions = await repoSourcing.assertionsForDevice(d.slug)
  const numericas = assertions.filter((a) => {
    try {
      return typeof (JSON.parse(a.valueJson) as unknown) === 'number'
    } catch (error) {
      // Best-effort explícito: una assertion ilegible no genera pregunta numérica.
      console.warn(`[WARN] conjunto de oro: assertion ilegible en "${d.slug}" (${a.predicate})`, { valueJson: a.valueJson, error })
      return false
    }
  })
  for (const a of numericas.slice(0, 2)) {
    preguntas.push({
      pregunta: `¿Cuál es el ${a.predicate.replace(/_/g, ' ')} de ${d.nombre}?`,
      hechosEsperados: [{ sujetoSlug: d.slug, predicado: a.predicate, valor: valorLegible(a.predicate, a.valueJson) }],
    })
  }
  preguntas.push({
    pregunta: `¿Cuántos puertos tiene ${d.nombre}?`,
    hechosEsperados: [{ sujetoSlug: d.slug, predicado: 'puertos', valor: String(totalPuertos(db, d.slug)) }],
  })
  preguntas.push({
    pregunta: `¿Qué capas termina ${d.nombre}?`,
    hechosEsperados: [{ sujetoSlug: d.slug, predicado: 'capas que termina', valor: capasDe(db, d.slug).join(', ') }],
  })
  return preguntas
}

/** Escenarios curados (§21.2): preguntas fijas de oro. */
export function escenariosCurados(db: SqliteDriver): PreguntaOro[] {
  return [
    { pregunta: '¿Qué switches capa 3 de 10 Gbps hay en el catálogo?', hechosEsperados: [] },
    { pregunta: '¿Qué capas cubre Cisco Catalyst 9300?', hechosEsperados: [{ sujetoSlug: 'cisco-c9300-48p', predicado: 'capas que termina', valor: capasDe(db, 'cisco-c9300-48p').join(', ') }] },
    { pregunta: '¿Quién fabrica el MikroTik CCR1036?', hechosEsperados: [{ sujetoSlug: 'mikrotik-ccr1036', predicado: 'fabricante', valor: 'mikrotik' }] },
  ]
}

/**
 * Construye el conjunto de oro determinista: una pregunta por (dispositivo
 * relevante × atributo verificable) + escenarios curados.
 */
export async function construirConjuntoOroDesdeDataset(db: SqliteDriver, maxDispositivos = 60): Promise<readonly PreguntaOro[]> {
  const repoDevices = new SqliteDeviceRepository(db)
  const repoSourcing = new SqliteSourcingRepository(db)
  const count = await repoDevices.count()
  const total = Math.min(count, maxDispositivos)

  const paginas = await paginarDispositivos(repoDevices, total)

  const preguntas: PreguntaOro[] = []
  for (const d of paginas) {
    preguntas.push(...await generarPreguntasDeDispositivo(repoSourcing, db, d))
  }

  preguntas.push(...escenariosCurados(db))

  return preguntas
}
