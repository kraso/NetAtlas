#!/usr/bin/env tsx
// modules:lint — ningún módulo de src supera 200 líneas (barrels exentos),
// ningún par de proyectos del workspace comparte nombre, ninguna dependencia
// interna se declara fuera de `workspace:*`, y ningún módulo de la app importa
// el barrel de @netatlas/application en runtime (arrastra @netatlas/data, que el
// navegador no resuelve: la app arranca en blanco).
// Uso: pnpm modules:lint [raízRepo]
//
// Las reglas viven en módulos aparte y se consumen por el barrel del paquete:
// el CLI solo las recorre y decide el exit code.
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  BARREL_APLICACION,
  DIR_APP,
  ESPECIFICADOR_INTERNO,
  MAX_LINEAS,
  revisarBarrels,
  revisarDependencias,
  revisarNombres,
  revisarRepo,
} from './index.js'

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

const dependencias = revisarDependencias(raiz)
for (const v of dependencias.violaciones) {
  if (v.motivo === 'especificador-invalido') {
    console.log(
      `[ERROR] [dependencia-invalida] ${v.ruta}: ${v.dependencia} en ${v.seccion} declara ${v.declarada}, que no es una cadena; una dependencia de otro proyecto del workspace va con "${v.esperada}".`,
    )
    continue
  }
  console.log(
    `[ERROR] [dependencia-interna] ${v.ruta}: ${v.dependencia} declarada "${v.declarada}" en ${v.seccion}; una dependencia de otro proyecto del workspace va con "${v.esperada}". Con un rango, pnpm la resuelve fuera del repo.`,
  )
}
console.log(
  `modules:lint: ${dependencias.violaciones.length} dependencias internas fuera de "${ESPECIFICADOR_INTERNO}" sobre ${dependencias.internas} revisadas en ${dependencias.revisados} proyectos.`,
)

const barrels = revisarBarrels(raiz)
for (const v of barrels.violaciones) {
  console.log(
    `[ERROR] [barrel-aplicacion] ${v.ruta}:${v.linea} importa el barrel de ${BARREL_APLICACION} en runtime (${v.sentencia}): el barrel reexporta la importación por lote y arrastra @netatlas/importers → @netatlas/data, que el navegador no resuelve. Importa la subruta (${BARREL_APLICACION}/casos/…) o el tipo con \`import type\`.`,
  )
}
console.log(
  `modules:lint: ${barrels.violaciones.length} imports de valor del barrel en ${barrels.revisados} módulos de ${DIR_APP}.`,
)

if (
  informe.violaciones.length > 0 ||
  nombres.duplicados.length > 0 ||
  dependencias.violaciones.length > 0 ||
  barrels.violaciones.length > 0
)
  process.exitCode = 1
