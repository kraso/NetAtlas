#!/usr/bin/env tsx
// modules:lint — ningún módulo de src supera 200 líneas (barrels exentos) y
// ningún par de proyectos del workspace comparte nombre.
// Uso: pnpm modules:lint [raízRepo]
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { MAX_LINEAS, revisarRepo } from './modulos.js'
import { revisarNombres } from './nombres.js'

const here = dirname(fileURLToPath(import.meta.url))
const raiz = process.argv[2] ?? join(here, '..', '..', '..')

const informe = revisarRepo(raiz, MAX_LINEAS)
for (const v of informe.violaciones) {
  console.log(`[ERROR] [modulo-largo] ${v.ruta}: ${v.lineas} líneas (máximo ${v.maximo}); divide el módulo.`)
}
console.log(
  `\nmodules:lint: ${informe.violaciones.length} módulos por encima de ${MAX_LINEAS} líneas sobre ${informe.revisados} revisados (${informe.barrels} barrels exentos).`,
)

const nombres = revisarNombres(raiz)
for (const d of nombres.duplicados) {
  console.log(
    `[ERROR] [nombre-duplicado] ${d.nombre} lo declaran ${d.rutas.length} proyectos: ${d.rutas.join(', ')}. Renombra uno: \`pnpm --filter ${d.nombre}\` no sabría a cuál ir.`,
  )
}
console.log(
  `modules:lint: ${nombres.duplicados.length} nombres duplicados sobre ${nombres.revisados} proyectos del workspace.`,
)

if (informe.violaciones.length > 0 || nombres.duplicados.length > 0) process.exitCode = 1
