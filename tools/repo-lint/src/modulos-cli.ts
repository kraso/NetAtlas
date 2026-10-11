#!/usr/bin/env tsx
// modules:lint — ningún módulo de src supera 200 líneas (barrels exentos).
// Uso: pnpm modules:lint [raízRepo]
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { MAX_LINEAS, revisarRepo } from './modulos.js'

const here = dirname(fileURLToPath(import.meta.url))
const raiz = process.argv[2] ?? join(here, '..', '..', '..')

const informe = revisarRepo(raiz, MAX_LINEAS)
for (const v of informe.violaciones) {
  console.log(`[ERROR] [modulo-largo] ${v.ruta}: ${v.lineas} líneas (máximo ${v.maximo}); divide el módulo.`)
}
console.log(
  `\nmodules:lint: ${informe.violaciones.length} módulos por encima de ${MAX_LINEAS} líneas sobre ${informe.revisados} revisados (${informe.barrels} barrels exentos).`,
)
if (informe.violaciones.length > 0) process.exitCode = 1
