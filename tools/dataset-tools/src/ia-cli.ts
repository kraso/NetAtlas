#!/usr/bin/env tsx
/**
 * data:ia — asistente IA local-first (F7, §21): consulta y evaluación con
 * conjunto de oro contra el dataset real. Uso:
 *   pnpm data:ia "pregunta…"                      → respuesta con citas
 *   pnpm data:ia --eval [--max=40]                → eval (criterio F7)
 *   pnpm data:ia --db=ruta.sqlite "pregunta…"
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import {
  NodeSqliteDriver,
  SqliteToolContext,
  crearOracleSqlite,
  construirConjuntoOroDesdeDataset,
} from '@netatlas/data'
import { Fts5SearchIndex } from '@netatlas/search'
import { crearClienteIA, evaluarConjuntoOro, umbralDepliegue } from '@netatlas/domain'

const here = dirname(fileURLToPath(import.meta.url))
function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a?.slice(`--${name}=`.length)
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

const dbPath = arg('db') ?? join(here, '..', '..', '..', 'datasets', 'netatlas-seed.sqlite')
if (!existsSync(dbPath)) {
  console.error(`No existe el dataset: ${dbPath} (ejecuta pnpm dataset:build primero)`)
  process.exit(2)
}

const pregunta = process.argv.slice(2).find((x) => !x.startsWith('-') && !x.endsWith('.ts')) ?? ''

async function main(): Promise<void> {
  const db = new NodeSqliteDriver(dbPath)
  try {
    const search = new Fts5SearchIndex(db)
    const toolCtx = new SqliteToolContext(db, search)
    const port = crearClienteIA(toolCtx)

    if (flag('eval')) {
      const max = Number(arg('max') ?? '40')
      const preguntas = await construirConjuntoOroDesdeDataset(db, max)
      const oracle = crearOracleSqlite(db)
      const resultado = await evaluarConjuntoOro(port, preguntas, oracle)
      const umbral = umbralDepliegue(resultado)

      console.log('── Evaluación con conjunto de oro (criterio F7 §21.3) ──')
      console.log(`preguntas:      ${resultado.total} (respondidas ${resultado.respondidas}, honestas sin-datos ${resultado.sinDatos})`)
      console.log(`citas:          ${resultado.citasValidas}/${resultado.citasTotales} (fidelidad ${(resultado.fidelidadCitas * 100).toFixed(2)}% ≥ 95%)`)
      console.log(`alucinaciones:  ${resultado.alucinacionesSpecs} (objetivo 0)`)
      console.log(`deploy:         ${umbral.despliega ? 'AUTORIZADO ✓' : `BLOQUEADO ✗ — ${umbral.motivo}`}`)
      if (resultado.detalleAlucinaciones.length > 0) {
        console.log('detalle:')
        for (const a of resultado.detalleAlucinaciones) console.log(`  - ${a}`)
      }
      process.exit(resultado.aprobado ? 0 : 1)
    }

    if (pregunta.length === 0) {
      console.error('Uso: pnpm data:ia "pregunta…"  |  pnpm data:ia --eval')
      process.exit(1)
    }

    const r = await port.ask({ texto: pregunta })
    console.log('── Respuesta ──')
    console.log(r.texto)
    console.log('')
    if (r.citas.length > 0) {
      console.log('Citas:')
      for (const c of r.citas) {
        const fuente = c.fuenteSlug ? ` [fuente: ${c.fuenteSlug}]` : ''
        console.log(`  - ${c.etiqueta} (${c.tipo}:${c.slug})${fuente}${c.afirmacion ? ` — ${c.afirmacion}` : ''}`)
      }
    } else {
      console.log('Citas: (ninguna — respuesta honesta sin datos)')
    }
    if (r.herramientas.length > 0) {
      console.log('')
      console.log('Herramientas:')
      for (const h of r.herramientas) {
        const resumen = h.sinDatos ? '(sin datos)' : Object.keys(h.datos).slice(0, 3).join(', ')
        console.log(`  - ${h.herramienta} ${resumen}`)
      }
    }
  } finally {
    db.close()
  }
}

void main()