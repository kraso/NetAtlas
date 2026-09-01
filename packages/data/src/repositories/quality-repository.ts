import type { SqliteDriver } from '../driver.js'

/**
 * Dashboard de calidad del dataset (NET-HW-047, §19.3): cobertura de fuentes
 * por categoría, distribución de confianza, atributos EAV cubiertos y
 * dispositivos sin especificaciones. Todo agregado desde la BD (SQL).
 */

export interface CoberturaCategoria {
  readonly categoria: string
  readonly dispositivos: number
  readonly conAssertions: number
  readonly cobertura: number // 0..100
}

export interface QualityReport {
  readonly dispositivos: number
  readonly conAssertions: number
  readonly coberturaFuentes: number // % global
  readonly distribucionConfianza: readonly { confianza: string; n: number }[]
  readonly atributosEAV: number
  readonly dispositivosSinEAV: number
  readonly relaciones: number
  readonly reconciliacionesPendientes: number
  readonly porCategoria: readonly CoberturaCategoria[]
}

export class SqliteQualityRepository {
  constructor(private readonly db: SqliteDriver) {}

  qualityReport(): QualityReport {
    const dispositivos = Number(this.db.prepare('SELECT COUNT(*) AS c FROM device').get()?.c ?? 0)

    const conAssertions = Number(
      this.db.prepare("SELECT COUNT(DISTINCT subject_id) AS c FROM assertion WHERE subject_type = 'device'").get()?.c ?? 0,
    )

    const confianzaRows = this.db
      .prepare('SELECT confidence AS confianza, COUNT(*) AS n FROM assertion GROUP BY confidence ORDER BY n DESC')
      .all() as { confianza: string; n: number }[]
    const distribucionConfianza = confianzaRows.map((r) => ({ confianza: String(r.confianza), n: Number(r.n) }))

    const atributosEAV = Number(this.db.prepare('SELECT COUNT(*) AS c FROM device_attribute').get()?.c ?? 0)
    const dispositivosSinEAV = Number(
      this.db
        .prepare('SELECT COUNT(*) AS c FROM device d WHERE NOT EXISTS (SELECT 1 FROM device_attribute da WHERE da.device_id = d.id)')
        .get()?.c ?? 0,
    )
    const relaciones = Number(this.db.prepare('SELECT COUNT(*) AS c FROM relationship').get()?.c ?? 0)

    const catRows = this.db
      .prepare(
        `SELECT c.code AS categoria, COUNT(DISTINCT d.id) AS dispositivos,
                COUNT(DISTINCT a.subject_id) AS con_assertions
         FROM category c
         JOIN device d ON d.category_id = c.id
         LEFT JOIN assertion a ON a.subject_type = 'device' AND a.subject_id = d.id
         GROUP BY c.code
         ORDER BY c.code`,
      )
      .all() as { categoria: string; dispositivos: number; con_assertions: number }[]
    const porCategoria: CoberturaCategoria[] = catRows.map((r) => {
      const n = Number(r.dispositivos)
      const con = Number(r.con_assertions)
      return { categoria: String(r.categoria), dispositivos: n, conAssertions: con, cobertura: n > 0 ? Math.round((con / n) * 100) : 0 }
    })

    const reconciliacionesPendientes = Number(
      this.db.prepare("SELECT COUNT(*) AS c FROM reconciliation WHERE status = 'pending'").get()?.c ?? 0,
    )

    return {
      dispositivos,
      conAssertions,
      coberturaFuentes: dispositivos > 0 ? Math.round((conAssertions / dispositivos) * 100) : 0,
      distribucionConfianza,
      atributosEAV,
      dispositivosSinEAV,
      relaciones,
      reconciliacionesPendientes,
      porCategoria,
    }
  }
}