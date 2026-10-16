#!/usr/bin/env tsx
/**
 * corpus — recoge respuestas reales del proveedor para ajustar el cruce.
 *
 * Por cada caso (ver `corpus-casos.ts`) monta un repositorio temporal con el
 * `.gga` real, calcula el alcance con `calcularCambio` y manda **el prompt del
 * gate** dos veces por el **transporte del gate**, sin que una pasada sepa de la
 * otra. Lo único que cambia respecto a un `pnpm review:gate` es quién pone el
 * proveedor: aquí `--proveedores`, porque el del `.gga` depende de la ventana de
 * cuota del día.
 *
 * Guarda cada muestra en cuanto llega (`--salida`), así que un corte a mitad
 * conserva lo recogido. Uso:
 *
 *   pnpm --filter @netatlas/review-gate corpus --proveedores=opencode:opencode/cat-jam-free
 *   pnpm --filter @netatlas/review-gate corpus --rondas=30 --espera=60
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { leerConfig, leerReglas } from '../src/config.js'
import { calcularCambio, construirPrompt } from '../src/index.js'
import { peticionDe, revisar } from '../src/pasadas.js'
import { ejecutorGga } from '../src/proveedor.js'
import { CASOS, type Caso } from './corpus-casos.js'
import { RAIZ_DEL_TOOL, RUTA_CORPUS, leerCorpus, type Corpus, type MuestraCorpus } from './corpus-tipos.js'

/** Los gratuitos del gateway, que abren ventana sin credencial. */
const PROVEEDORES_POR_DEFECTO = [
  'opencode:opencode/cat-jam-free',
  'opencode:opencode/space-bunny-free',
  'opencode:opencode/ll-alpha-free',
  'opencode:opencode/mimo-v2.6-flash-free',
  'opencode:opencode/glm-5.3-flash-free',
  'opencode:opencode/deepseek-v4.1-flash-free',
  'opencode:opencode/muse-spark-1.3-contributor-free',
]

main()

function main(): void {
  const args = process.argv.slice(2)
  const salida = valor(args, 'salida') ?? RUTA_CORPUS
  const proveedores = (valor(args, 'proveedores') ?? PROVEEDORES_POR_DEFECTO.join(',')).split(',')
  const solo = valor(args, 'solo')
  const casos = solo === undefined ? CASOS : CASOS.filter((caso) => solo.split(',').includes(caso.id))
  recoger({
    corpus: leerCorpus(salida),
    casos,
    proveedores,
    timeoutSegundos: numero(args, 'timeout') ?? 240,
    rondas: numero(args, 'rondas') ?? 1,
    espera: numero(args, 'espera') ?? 0,
    salida,
    // Transporte alternativo: sirve para verificar el arnés sin proveedor. Lo que
    // devuelva ese shim no son respuestas reales y el corpus lo delata con el
    // proveedor que quede anotado en cada muestra.
    shim: valor(args, 'shim'),
  })
}

interface OpcionesRecogida {
  corpus: Corpus
  casos: readonly Caso[]
  proveedores: readonly string[]
  timeoutSegundos: number
  rondas: number
  espera: number
  salida: string
  shim?: string
}

function recoger(opciones: OpcionesRecogida): void {
  const { corpus, casos, proveedores, timeoutSegundos, rondas, espera, salida, shim } = opciones
  for (let ronda = 1; ronda <= rondas; ronda += 1) {
    for (const proveedor of proveedores) {
      for (const caso of pendientes(corpus, casos)) {
        const muestra = intentarCaso(caso, proveedor, timeoutSegundos, shim)
        if (muestra === null) {
          continue
        }
        corpus.muestras.push({ ...muestra, proveedor, fecha: new Date().toISOString() })
        guardarCorpus(salida, corpus)
        console.log(`ok   ${proveedor} · ${caso.id} · 2 respuestas guardadas`)
      }
    }
    const faltan = pendientes(corpus, casos)
    if (faltan.length === 0 || ronda === rondas) {
      break
    }
    console.log(`ronda ${ronda}: sin ventana para ${faltan.length} caso(s); espero ${espera}s`)
    dormir(espera)
  }
  const faltan = pendientes(corpus, casos).map((caso) => caso.id)
  console.log(
    `muestras: ${corpus.muestras.length}${faltan.length === 0 ? '' : ` · sin recoger: ${faltan.join(', ')}`}`,
  )
}

function pendientes(corpus: Corpus, casos: readonly Caso[]): readonly Caso[] {
  const recogidos = new Set(corpus.muestras.map((muestra) => muestra.id))
  return casos.filter((caso) => !recogidos.has(caso.id))
}

/** Las dos pasadas del caso, o `null` si el proveedor no completó alguna. */
function intentarCaso(
  caso: Caso,
  proveedor: string,
  timeoutSegundos: number,
  shim?: string,
): Omit<MuestraCorpus, 'proveedor' | 'fecha'> | null {
  const raiz = montarCaso(caso)
  try {
    const config = leerConfig(raiz, { GGA_PROVIDER: proveedor })
    const cambio = calcularCambio({ raiz, modo: 'staged', config })
    if (cambio.alcances.length === 0) {
      console.log(`sin alcance: ${caso.id} (¿patrones del .gga?)`)
      return null
    }
    const peticion = peticionDe({
      config,
      raiz,
      prompt: construirPrompt(leerReglas(raiz, config), cambio.alcances),
      timeoutSegundos,
    })
    const ejecutor = shim === undefined ? ejecutorGga() : ejecutorGga(shim)
    const primera = revisar(ejecutor, peticion, 0)
    const segunda = revisar(ejecutor, peticion, 0)
    if ('motivo' in primera || 'motivo' in segunda) {
      const motivo = 'motivo' in primera ? primera.motivo : 'motivo' in segunda ? segunda.motivo : ''
      console.log(`falla una pasada de ${caso.id}: ${motivo}`)
      return null
    }
    return {
      id: caso.id,
      esperadas: caso.esperadas,
      archivos: caso.archivos,
      alcance: cambio.alcances.map((alcance) => ({
        ruta: alcance.ruta,
        contenido: alcance.contenido,
        hunks: alcance.hunks,
      })),
      respuestas: [primera.texto, segunda.texto],
    }
  } finally {
    rmSync(raiz, { recursive: true, force: true })
  }
}

/** Repositorio temporal con el `.gga` real: el prompt es el del gate, no una imitación. */
function montarCaso(caso: Caso): string {
  const raiz = mkdtempSync(join(tmpdir(), 'corpus-gate-'))
  copyFileSync(join(RAIZ_DEL_TOOL, '.gga'), join(raiz, '.gga'))
  copyFileSync(join(RAIZ_DEL_TOOL, 'AGENTS.md'), join(raiz, 'AGENTS.md'))
  git(raiz, 'init', '-q')
  for (const archivo of caso.base ?? caso.archivos) {
    escribir(raiz, archivo.ruta, archivo.contenido)
  }
  if (caso.base !== undefined) {
    git(raiz, 'add', '-A')
    git(raiz, '-c', 'user.email=corpus@local', '-c', 'user.name=corpus', 'commit', '-q', '-m', 'base')
    for (const archivo of caso.archivos) {
      escribir(raiz, archivo.ruta, archivo.contenido)
    }
  }
  git(raiz, 'add', '-A')
  return raiz
}

function escribir(raiz: string, ruta: string, contenido: string): void {
  const destino = join(raiz, ruta)
  mkdirSync(dirname(destino), { recursive: true })
  writeFileSync(destino, contenido)
}

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' })
}

function guardarCorpus(salida: string, corpus: Corpus): void {
  writeFileSync(salida, `${JSON.stringify(corpus, null, 2)}\n`)
}

/** Espera sincrónica: el transporte del gate ya es sincrónico (`spawnSync`). */
function dormir(segundos: number): void {
  if (segundos > 0) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, segundos * 1000)
  }
}

function valor(args: readonly string[], nombre: string): string | undefined {
  const prefijo = `--${nombre}=`
  return args.find((arg) => arg.startsWith(prefijo))?.slice(prefijo.length)
}

function numero(args: readonly string[], nombre: string): number | undefined {
  const texto = valor(args, nombre)
  if (texto === undefined) {
    return undefined
  }
  const valorNumerico = Number.parseInt(texto, 10)
  return Number.isFinite(valorNumerico) && valorNumerico >= 0 ? valorNumerico : undefined
}
