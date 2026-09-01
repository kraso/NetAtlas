import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  NodeSqliteDriver,
  SqliteToolContext,
  crearOracleSqlite,
  construirConjuntoOroDesdeDataset,
} from '@netatlas/data'
import { Fts5SearchIndex } from '@netatlas/search'
import { crearClienteIA, evaluarConjuntoOro, umbralDepliegue } from '@netatlas/domain'

const SEED = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'datasets', 'netatlas-seed.sqlite')
const SIN_SEED = !existsSync(SEED)

/**
 * Criterio F7 (§27 / §21.3): "0 alucinaciones de specs en eval; feature flag
 * off por defecto". Se ejecuta contra el dataset REAL (330 dispositivos):
 *  - conjunto de oro construido desde la base validada (hechos verificables);
 *  - oráculo que comprueba cada cita contra las tablas (assertion/relationship/
 *    device/port/osi_profile), no contra lo que diga el asistente;
 *  - umbral: fidelidad de citas ≥ 0.95 y 0 alucinaciones.
 * Vive en apps/app porque requiere @netatlas/data y @netatlas/search juntos.
 */
describe('F7 — RAG con citas sobre el seed real (NET-HW-060, criterio F7)', () => {
  const skip = SIN_SEED ? it.skip : it

  skip('conjunto de oro construido desde el dataset es no vacío y verificable', async () => {
    const db = new NodeSqliteDriver(SEED)
    const preguntas = await construirConjuntoOroDesdeDataset(db, 40)
    db.close()
    expect(preguntas.length).toBeGreaterThan(20)
    expect(preguntas[0]?.pregunta.length).toBeGreaterThan(5)
  })

  skip('eval completo: fidelidad ≥ 0.95 y 0 alucinaciones → despliegue autorizado', async () => {
    const db = new NodeSqliteDriver(SEED)
    try {
      const search = new Fts5SearchIndex(db)
      const toolCtx = new SqliteToolContext(db, search)
      const port = crearClienteIA(toolCtx)

      const preguntas = await construirConjuntoOroDesdeDataset(db, 40)
      const oracle = crearOracleSqlite(db)
      const resultado = await evaluarConjuntoOro(port, preguntas, oracle)

      expect(resultado.aprobado).toBe(true)
      expect(resultado.alucinacionesSpecs).toBe(0)
      expect(resultado.fidelidadCitas).toBeGreaterThanOrEqual(0.95)
      // El pipeline de IA solo se despliega si supera el umbral (§21.3).
      expect(umbralDepliegue(resultado).despliega).toBe(true)
    } finally {
      db.close()
    }
  }, 120_000)

  skip('pregunta sin datos → respuesta honesta "no tengo datos" (guardarraíl)', async () => {
    const db = new NodeSqliteDriver(SEED)
    try {
      const search = new Fts5SearchIndex(db)
      const toolCtx = new SqliteToolContext(db, search)
      const port = crearClienteIA(toolCtx)
      const r = await port.ask({ texto: '¿Cuál es el rendimiento de un dispositivo inexistente-xyz? ¿y su precio?' })
      expect(r.modo).toBe('no-tengo-datos')
      expect(r.citas.length).toBe(0)
    } finally {
      db.close()
    }
  }, 30_000)

  skip('duda real: qué capas cubre el Catalyst 9300 → respuesta con citas', async () => {
    const db = new NodeSqliteDriver(SEED)
    try {
      const search = new Fts5SearchIndex(db)
      const toolCtx = new SqliteToolContext(db, search)
      const port = crearClienteIA(toolCtx)
      const r = await port.ask({ texto: '¿Qué capas cubre Cisco Catalyst 9300?' })
      expect(r.modo).not.toBe('no-tengo-datos')
      expect(r.citas.length).toBeGreaterThan(0)
      expect(r.citas.some((c) => c.slug.includes('9300'))).toBe(true)
    } finally {
      db.close()
    }
  }, 30_000)
})