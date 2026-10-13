#!/usr/bin/env tsx
// dist:lint — ningún `.js` del build de la app deja un import que el navegador no
// pueda resolver: un specifier desnudo deja la app en blanco.
// Uso: pnpm dist:lint [raízRepo]
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { DIR_DIST, revisarBundle } from './bundle.js'

const here = dirname(fileURLToPath(import.meta.url))
const raiz = process.argv[2] ?? join(here, '..', '..', '..')

const informe = revisarBundle(raiz)
if (informe.ausente) {
  console.log(
    `[ERROR] [bundle-ausente] no existe ${DIR_DIST} bajo ${raiz}: compila la app antes (pnpm --filter @netatlas/app build).`,
  )
} else {
  for (const v of informe.violaciones) {
    console.log(
      `[ERROR] [import-desnudo] ${v.ruta}: el navegador no puede resolver \`${v.specifier}\`; la app arrancaría en blanco (¿un barrel alcanzó un paquete external del build?).`,
    )
  }
  console.log(`\ndist:lint: ${informe.violaciones.length} imports desnudos sobre ${informe.revisados} ficheros de ${DIR_DIST}.`)
}

if (informe.ausente || informe.violaciones.length > 0) process.exitCode = 1
