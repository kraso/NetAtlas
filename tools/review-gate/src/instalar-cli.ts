#!/usr/bin/env tsx
/**
 * gate:install — instala el hook `pre-commit` versionado en el clon actual.
 *
 * El hook que instala GGA llama a `gga run` (veredicto por muestra); el del gate
 * llama a `pnpm review:gate`, que es la política versionada y testeada. Antes de
 * reemplazar nada se guarda una copia `.gga-backup` al lado.
 */
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { raizRepositorio } from './cambio.js'
import { decideInstalacion } from './instalar-hook.js'

const HOOK_VERSIONADO = fileURLToPath(new URL('../hook/pre-commit', import.meta.url))

main()

function main(): void {
  const forzar = process.argv.includes('--force')
  const raiz = raizRepositorio(process.cwd())
  const destino = rutaHook(raiz)
  const actual = existsSync(destino) ? readFileSync(destino, 'utf8') : null
  const decision = decideInstalacion(actual, forzar)
  if (decision.accion === 'rechazar') {
    process.stderr.write(`gate:install: ${decision.motivo}\n`)
    process.exit(1)
  }
  if (decision.accion === 'ya-instalado') {
    process.stdout.write(`gate:install: ${decision.motivo} (${destino})\n`)
    return
  }
  if (actual !== null) {
    copyFileSync(destino, `${destino}.gga-backup`)
  }
  mkdirSync(dirname(destino), { recursive: true })
  writeFileSync(destino, readFileSync(HOOK_VERSIONADO, 'utf8'))
  chmodSync(destino, 0o755)
  process.stdout.write(
    `gate:install: hook instalado en ${destino} (${decision.motivo})\n` +
      'El gate corre en cada commit: `git commit --no-verify` lo salta, y en CI lo cubre el job de review.\n',
  )
}

/** `git rev-parse --git-path hooks` es relativo a la raíz del repositorio. */
function rutaHook(raiz: string): string {
  const salida = execFileSync('git', ['-C', raiz, 'rev-parse', '--git-path', 'hooks'], {
    encoding: 'utf8',
  }).trim()
  const dir = isAbsolute(salida) ? salida : join(raiz, salida)
  return join(dir, 'pre-commit')
}
