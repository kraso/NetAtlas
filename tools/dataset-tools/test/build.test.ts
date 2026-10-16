import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ManifestRepository, NodeSqliteDriver } from '@netatlas/data'
import { buildSeedDatabase } from '../src/build.js'
import { SEED_DIR, carpetaTemporal, leerTexto, limpiar, rutaEn } from './soporte-dataset.js'

const tmpDir = carpetaTemporal('netatlas-build-')
const outPath = rutaEn(tmpDir, 'seed.sqlite')

describe('dataset:build', () => {
  let result: ReturnType<typeof buildSeedDatabase>
  let driver: NodeSqliteDriver

  beforeAll(() => {
    result = buildSeedDatabase(SEED_DIR, outPath)
    driver = new NodeSqliteDriver(outPath)
  })

  afterAll(() => {
    driver?.close()
    limpiar(tmpDir)
  })

  it('construye el SQLite con dispositivos, aristas y assertions', () => {
    expect(result.deviceCount).toBeGreaterThanOrEqual(300) // seed hacia 300–500
    expect(result.assertionCount).toBeGreaterThan(0)
    expect(result.relationshipCount).toBeGreaterThan(0)
    expect(result.schemaVersion).toBe(3) // 0003_manufacturer_snmp (empresa SNMP)
  })

  it('persiste predicados, capas y FTS sincronizado', () => {
    const predicates = driver.prepare('SELECT COUNT(*) AS c FROM predicate').get()
    expect(Number(predicates?.c)).toBe(16)
    const layers = driver.prepare('SELECT COUNT(*) AS c FROM osi_layer').get()
    expect(Number(layers?.c)).toBe(7)
    const indiceFts = driver.prepare('SELECT COUNT(*) AS c FROM fts_device').get()
    expect(Number(indiceFts?.c)).toBeGreaterThanOrEqual(300)
  })

  // El build es reproducible: todas las marcas de tiempo del archivo salen del
  // reloj fijo anclado a la fecha de publicación. Sin esto, el `sha256` del
  // manifiesto cambiaba en cada build y el fichero versionado se ensuciaba sin
  // que nadie hubiera tocado el contenido.
  it('dos construcciones de las mismas fuentes dan bytes idénticos', () => {
    const primerBuild = rutaEn(tmpDir, 'reproducible-a.sqlite')
    const segundoBuild = rutaEn(tmpDir, 'reproducible-b.sqlite')
    const opciones = { publishedOn: '2026-01-02' }
    buildSeedDatabase(SEED_DIR, primerBuild, opciones)
    buildSeedDatabase(SEED_DIR, segundoBuild, opciones)
    expect(ManifestRepository.hashArchivo(segundoBuild)).toBe(ManifestRepository.hashArchivo(primerBuild))
    expect(leerTexto(`${segundoBuild}.manifest.json`)).toBe(leerTexto(`${primerBuild}.manifest.json`))
  })

  it('reconstruir el mismo dataset deja el manifiesto intacto', () => {
    const out = rutaEn(tmpDir, 'estable.sqlite')
    const opciones = { publishedOn: '2026-01-02' }
    buildSeedDatabase(SEED_DIR, out, opciones)
    const manifiesto = leerTexto(`${out}.manifest.json`)
    buildSeedDatabase(SEED_DIR, out, opciones)
    expect(leerTexto(`${out}.manifest.json`)).toBe(manifiesto)
  })

  it('una fecha inválida en las opciones no borra el artefacto previo', () => {
    const out = rutaEn(tmpDir, 'previo.sqlite')
    buildSeedDatabase(SEED_DIR, out, { publishedOn: '2026-01-02' })
    const antes = ManifestRepository.hashArchivo(out)
    expect(() => buildSeedDatabase(SEED_DIR, out, { publishedOn: '2026-13-45' })).toThrow(/AAAA-MM-DD/)
    expect(ManifestRepository.hashArchivo(out)).toBe(antes)
  })

  it('los dispositivos del seed son consultables por FTS5', () => {
    const hit = driver
      .prepare("SELECT rowid FROM fts_device WHERE fts_device MATCH '2930F'")
      .get()
    expect(hit).toBeDefined()
  })
})
