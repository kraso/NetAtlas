import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { generarClaveApi } from '../src/api-keys.js'
import { levantarServidorPrueba, type ServidorPrueba } from './servidor-prueba.js'

describe('F8B futuro — conjuntos de datos descargables firmados (§31.3)', () => {
  let url: string
  let servidor: ServidorPrueba
  let clave: string

  beforeAll(async () => {
    // El dataset firmado se sirve desde el fichero, así que el store necesita
    // la ruta real del SQLite temporal.
    servidor = await levantarServidorPrueba({
      prefijo: 'server-f8b-ds',
      version: '0.2.0-ds',
      apiPublica: true,
      limitePorMinuto: 200,
      conRutaDbEnStore: true,
    })
    url = servidor.url
    clave = generarClaveApi()
    await servidor.publicStore.registrarClave('key-ds-1', clave)
  })

  afterAll(() => servidor.cerrar())

  it('lista el conjunto firmado con sha256', async () => {
    const r = await fetch(`${url}/v1/datasets`, { headers: { authorization: `Bearer ${clave}` } })
    expect(r.status).toBe(200)
    const cuerpo = (await r.json()) as { datasets: { nombre: string; sha256: string }[] }
    const seed = cuerpo.datasets.find((d) => d.nombre === 'netatlas-seed')
    expect(seed).toBeDefined()
    expect(seed?.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('descarga el SQLite con sha256 en la cabecera', async () => {
    const r = await fetch(`${url}/v1/datasets/netatlas-seed`, { headers: { authorization: `Bearer ${clave}` } })
    expect(r.status).toBe(200)
    expect(r.headers.get('content-disposition')).toContain('netatlas-seed.sqlite')
    const sha = r.headers.get('x-content-sha256')
    expect(sha).toMatch(/^[0-9a-f]{64}$/)
    const blob = await r.arrayBuffer()
    const cabecera = new Uint8Array(blob.slice(0, 16))
    expect(Array.from(cabecera)).toEqual([0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00])
  })

  it('dataset inexistente → 404', async () => {
    const r = await fetch(`${url}/v1/datasets/no-existe`, { headers: { authorization: `Bearer ${clave}` } })
    expect(r.status).toBe(404)
  })
})
