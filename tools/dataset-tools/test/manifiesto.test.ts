import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { escribirManifiesto, fechaDePublicacion, rutaManifiesto, type DatosManifiesto } from '../src/build-manifiesto.js'
import { carpetaTemporal, escribirTexto, leerTexto, limpiar, rutaEn } from './soporte-dataset.js'

/**
 * Identidad del manifiesto: el fichero versionado solo cambia cuando el
 * dataset cambia de verdad. Reconstruir las mismas fuentes no es una
 * publicación nueva, y por eso la fecha se hereda y la revisión solo sube
 * cuando el contenido (hash, esquema o conteos) es otro.
 */

const dir = carpetaTemporal('netatlas-manifiesto-')

afterAll(() => {
  limpiar(dir)
})

afterEach(() => {
  delete process.env.NETATLAS_SEED_PUBLISHED_ON
  delete process.env.NETATLAS_SIGN_PRIVATE_KEY
})

/** Archivo de dataset de mentira: aquí solo importa que cambie de bytes. */
function datasetFalso(nombre: string, contenido = 'dispositivos=3'): string {
  const outPath = rutaEn(dir, `${nombre}.sqlite`)
  escribirTexto(outPath, contenido)
  return outPath
}

function datosDe(outPath: string, publishedOn: string, devices = 3): DatosManifiesto {
  return {
    outPath,
    publishedOn,
    schemaVersion: 3,
    devices,
    relationshipCount: 10,
    assertionCount: 20,
    catalogCounts: { protocols: 119, standards: 101, media: 31, manufacturers: 39, categories: 26 },
    topologiasCount: 3,
  }
}

function manifiestoDe(outPath: string): Record<string, unknown> {
  return JSON.parse(leerTexto(rutaManifiesto(outPath))) as Record<string, unknown>
}

describe('manifiesto del dataset', () => {
  it('la primera publicación estrena fecha, revisión 1 y su entrada de changelog', () => {
    const outPath = datasetFalso('nuevo')
    expect(escribirManifiesto(datosDe(outPath, '2026-01-02'))).toBe(true)
    const manifiesto = manifiestoDe(outPath)
    expect(manifiesto.publishedOn).toBe('2026-01-02')
    expect(manifiesto.version).toBe('netatlas-seed-2026-01-02-r1')
    expect(manifiesto.sha256).toBe(createHash('sha256').update(leerTexto(outPath)).digest('hex'))
    expect(manifiesto.changelog).toEqual(['dataset:build regenerado (2026-01-02)'])
  })

  it('reconstruir el mismo dataset no reescribe el manifiesto', () => {
    const outPath = datasetFalso('sin-cambios')
    escribirManifiesto(datosDe(outPath, '2026-01-02'))
    const antes = leerTexto(rutaManifiesto(outPath))
    expect(escribirManifiesto(datosDe(outPath, '2026-01-02'))).toBe(false)
    expect(leerTexto(rutaManifiesto(outPath))).toBe(antes)
  })

  it('un cambio real sube la revisión y acumula el changelog sin pisarlo', () => {
    const outPath = datasetFalso('cambia')
    escribirManifiesto(datosDe(outPath, '2026-01-02'))
    escribirTexto(outPath, 'dispositivos=4')
    expect(escribirManifiesto(datosDe(outPath, '2026-01-02', 4))).toBe(true)
    const manifiesto = manifiestoDe(outPath)
    expect(manifiesto.version).toBe('netatlas-seed-2026-01-02-r2')
    expect(manifiesto.publishedOn).toBe('2026-01-02')
    expect(manifiesto.changelog).toEqual([
      'dataset:build regenerado (2026-01-02)',
      'dataset:build regenerado (2026-01-02, r2)',
    ])
  })

  it('una fecha de publicación nueva vuelve a la revisión 1', () => {
    const outPath = datasetFalso('republica')
    escribirManifiesto(datosDe(outPath, '2026-01-02'))
    escribirTexto(outPath, 'dispositivos=4')
    expect(escribirManifiesto(datosDe(outPath, '2026-02-01', 4))).toBe(true)
    const manifiesto = manifiestoDe(outPath)
    expect(manifiesto.publishedOn).toBe('2026-02-01')
    expect(manifiesto.version).toBe('netatlas-seed-2026-02-01-r1')
  })

  it('la fecha de publicación la manda el entorno, si no el manifiesto previo, si no hoy', () => {
    const outPath = datasetFalso('fecha')
    expect(fechaDePublicacion(outPath, '2026-03-03')).toBe('2026-03-03')
    escribirManifiesto(datosDe(outPath, '2026-01-02'))
    expect(fechaDePublicacion(outPath, '2026-03-03')).toBe('2026-01-02')
    process.env.NETATLAS_SEED_PUBLISHED_ON = '2026-05-05'
    expect(fechaDePublicacion(outPath, '2026-03-03')).toBe('2026-05-05')
  })

  it('una fecha impuesta que no es una fecha real rompe en vez de publicarse', () => {
    const outPath = datasetFalso('fecha-invalida')
    process.env.NETATLAS_SEED_PUBLISHED_ON = '05/05/2026' // formato ajeno
    expect(() => fechaDePublicacion(outPath)).toThrow(/AAAA-MM-DD/)
    process.env.NETATLAS_SEED_PUBLISHED_ON = '2026-02-31' // formato correcto, día inexistente
    expect(() => fechaDePublicacion(outPath)).toThrow(/AAAA-MM-DD/)
  })

  it('una fecha inválida pasada por opciones tampoco llega al manifiesto', () => {
    const outPath = datasetFalso('opcion-invalida')
    expect(() => escribirManifiesto(datosDe(outPath, '2026-13-45'))).toThrow(/AAAA-MM-DD/)
  })
})
