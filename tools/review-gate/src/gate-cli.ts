#!/usr/bin/env tsx
/**
 * gate-cli — punto de entrada del gate de review.
 *
 * Lo usan el hook local (`--staged`, lo que está en el índice) y el job de
 * review de CI (`--pr-mode`, el rango del PR). La política vive en `gate.ts`;
 * aquí solo se resuelven argumentos, se elige el transporte y se traducen los
 * códigos de salida:
 *
 *   0  PASSED (o nada que revisar)
 *   1  FAILED por hallazgos reproducidos sobre el cambio
 *   2  la puerta no pudo decidir (proveedor caído, respuesta ilegible)
 *   3  configuración del gate (proveedor, reglas, rango del PR)
 *
 * `--dry-run` imprime el alcance sin llamar al proveedor —para ver qué se va a
 * mandar a revisar— y, ya puestos, lo que el gate ya decide sin él: las reglas
 * mecánicas.
 */
import { fileURLToPath } from 'node:url'
import { type Modo, calcularCambio, raizRepositorio } from './cambio.js'
import { leerConfig, leerReglas } from './config.js'
import { type ResultadoGate, ejecutarGate } from './gate.js'
import { seccionesMecanicas } from './informe.js'
import { revisarMecanicas } from './mecanicas.js'
import { construirPrompt } from './prompt.js'
import { ejecutorGga } from './proveedor.js'

/** Raíz del repositorio que contiene el tool: no depende del cwd. */
const RAIZ_DEL_TOOL = fileURLToPath(new URL('../../..', import.meta.url))

main()

function main(): void {
  const args = process.argv.slice(2)
  const modo: Modo = args.includes('--pr-mode') ? 'pr' : 'staged'
  let resultado: ResultadoGate
  try {
    const raiz = resolverRaiz(valor(args, 'raiz'))
    resultado = args.includes('--dry-run') ? alcanceEnSeco(raiz, modo, args) : correr(raiz, modo, args)
  } catch (error) {
    process.stdout.write(`El gate no puede correr: ${mensaje(error)}\n`)
    process.exit(3)
  }
  process.stdout.write(`${resultado.salida}\n`)
  process.exit(resultado.codigo)
}

function correr(raiz: string, modo: Modo, args: readonly string[]): ResultadoGate {
  const base = valor(args, 'base')
  return ejecutarGate({
    raiz,
    modo,
    ...(base !== undefined ? { base } : {}),
    pasadas: numero(args, 'pasadas'),
    timeoutSegundos: numero(args, 'timeout'),
    reintentos: numero(args, 'reintentos'),
    crudo: args.includes('--crudo'),
    ejecutor: ejecutorGga(),
  })
}

function alcanceEnSeco(raiz: string, modo: Modo, args: readonly string[]): ResultadoGate {
  const config = leerConfig(raiz, process.env)
  const base = valor(args, 'base')
  const cambio = calcularCambio({ raiz, modo, ...(base !== undefined ? { base } : {}), config })
  const cambiadas = cambio.alcances.reduce((total, alcance) => total + alcance.lineasCambiadas, 0)
  const cabecera = [
    `Simulacro (sin proveedor): ${cambio.alcances.length} ficheros en el alcance, ${cambiadas} líneas cambiadas`,
    `Modo: ${modo}${modo === 'pr' ? ` (${cambio.base}...HEAD)` : ''} · patrones del .gga: sí`,
  ]
  const cuerpo =
    args.includes('--prompt')
      ? [construirPrompt(leerReglas(raiz, config), cambio.alcances)]
      : cambio.alcances.map((alcance) => alcance.texto)
  const mecanicas = seccionesMecanicas(revisarMecanicas(cambio.alcances))
  return { codigo: 0, salida: [...cabecera, '', ...cuerpo, ...mecanicas].join('\n') }
}

function resolverRaiz(indicada: string | undefined): string {
  const candidata = indicada ?? RAIZ_DEL_TOOL
  try {
    return raizRepositorio(candidata)
  } catch {
    throw new Error(`«${candidata}» no es un repositorio git; indica uno con --raiz=<ruta>`)
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
  if (!Number.isFinite(valorNumerico) || valorNumerico < 1) {
    throw new Error(`--${nombre} necesita un entero positivo (llegó «${texto}»)`)
  }
  return valorNumerico
}

function mensaje(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
