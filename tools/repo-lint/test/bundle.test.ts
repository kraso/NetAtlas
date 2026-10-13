import { describe, expect, it, afterEach } from 'vitest'
import { importsDesnudos, resolublePorElNavegador, revisarBundle } from '../src/bundle.js'
import { crearRepo, limpiarRepos } from './soporte-repo-falso.js'

afterEach(limpiarRepos)

/** Trozo de chunk como el que dejó el bug real (import solo por efecto). */
const CHUNK_ROTO = 'import{r as Pt}from"./react-vendor-0P2os538.js";import"@netatlas/data";(function(){const e=document})();\n'

describe('importsDesnudos', () => {
  it('caza las tres formas que deja Rollup con el specifier desnudo', () => {
    const chunk =
      'import{r as e}from"./react-vendor.js";import"@netatlas/data";export{t}from"node:sqlite";const f=()=>import("pg");\n'
    expect(importsDesnudos(chunk)).toEqual(['@netatlas/data', 'node:sqlite', 'pg'])
  })

  it('acepta rutas y URLs, que el navegador sí resuelve', () => {
    const chunk =
      'import{a}from"./x.js";import{b}from"../y.js";import{c}from"/assets/z.js";const d=()=>import("https://cdn.example/m.js");const e=()=>import("data:text/javascript,1");\n'
    expect(importsDesnudos(chunk)).toEqual([])
  })

  it('no confunde el token con texto dentro de una cadena', () => {
    const chunk = 'const s="copiar from \\"a\\" to \\"b\\"";const t="import(\\"x\\")";\n'
    expect(importsDesnudos(chunk)).toEqual([])
  })

  it('no inventa violaciones en un chunk real de la app (deps, CSS e imágenes)', () => {
    const chunk = [
      'const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/mapa-local-B_kOXM_2.js"])))=>i.map(i=>d[i]);',
      'import{r as Pt}from"./react-vendor-0P2os538.js";',
      'import"./index-DfUBth_g.css";',
      'const url="assets/img/foto.png";',
      'import{o as I}from"./docs/pdf-worker.js";',
      '',
    ].join('\n')
    expect(importsDesnudos(chunk)).toEqual([])
  })

  it('no cuenta un identificador que termina en import', () => {
    expect(importsDesnudos('const a=cargarImport("react");\n')).toEqual([])
  })

  it('no repite el mismo specifier aunque salga en varias formas', () => {
    expect(importsDesnudos('import"@netatlas/data";const f=()=>import("@netatlas/data");\n')).toEqual(['@netatlas/data'])
  })
})

describe('resolublePorElNavegador', () => {
  it('solo da por buenas las rutas y las URLs', () => {
    expect(resolublePorElNavegador('./x.js')).toBe(true)
    expect(resolublePorElNavegador('../y.js')).toBe(true)
    expect(resolublePorElNavegador('/assets/x.js')).toBe(true)
    expect(resolublePorElNavegador('HTTPS://cdn.example/x.js')).toBe(true)
    expect(resolublePorElNavegador('@netatlas/data')).toBe(false)
    expect(resolublePorElNavegador('node:sqlite')).toBe(false)
    expect(resolublePorElNavegador('pg')).toBe(false)
  })
})

describe('revisarBundle', () => {
  it('informa del chunk roto y cuenta los .js revisados (el CSS no cuenta)', () => {
    const raiz = crearRepo({
      'apps/app/dist/assets/index-abc.js': CHUNK_ROTO,
      'apps/app/dist/assets/otro-def.js': 'export const ok = 1\n',
      'apps/app/dist/sw.js': 'const cache = "v1"\n',
      'apps/app/dist/assets/estilos.css': '@import "x.css";\n',
      'apps/app/dist/manifest.webmanifest': '{}\n',
    })
    const informe = revisarBundle(raiz)
    expect(informe.ausente).toBe(false)
    expect(informe.revisados).toBe(3)
    expect(informe.violaciones).toEqual([{ ruta: 'apps/app/dist/assets/index-abc.js', specifier: '@netatlas/data' }])
  })

  it('recorre también los subdirectorios del build', () => {
    const raiz = crearRepo({ 'apps/app/dist/assets/docs/chunk.js': 'import"node:fs";\n' })
    expect(revisarBundle(raiz).violaciones).toEqual([
      { ruta: 'apps/app/dist/assets/docs/chunk.js', specifier: 'node:fs' },
    ])
  })

  it('no revienta cuando todavía no hay build', () => {
    const raiz = crearRepo({ 'apps/app/src/main.tsx': 'export const a = 1\n' })
    expect(revisarBundle(raiz)).toEqual({ revisados: 0, ausente: true, violaciones: [] })
  })

  it('un build limpio no tiene violaciones', () => {
    const raiz = crearRepo({
      'apps/app/dist/assets/index-abc.js': 'import{a}from"./x.js";\n',
      'apps/app/dist/assets/x.js': 'export const a = 1\n',
    })
    const informe = revisarBundle(raiz)
    expect(informe.violaciones).toEqual([])
    expect(informe.revisados).toBe(2)
  })
})
