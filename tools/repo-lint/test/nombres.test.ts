import { describe, expect, it, afterEach } from 'vitest'
import { leerGlobsWorkspace, listarManifiestos, revisarNombres } from '../src/nombres.js'
import { RAIZ_REPO, crearRepo, limpiarRepos, paquete, relativas, workspace } from './soporte-repo-falso.js'

const WORKSPACE = workspace(['packages/*', 'apps/*', 'tools/*'])
const DOS_GLOBS = ['packages/*', 'apps/*', 'tools/*']

afterEach(limpiarRepos)

describe('leerGlobsWorkspace', () => {
  it('lee los globs del pnpm-workspace.yaml', () => {
    const raiz = crearRepo({ 'pnpm-workspace.yaml': `${WORKSPACE}# comentario\n` })
    expect(leerGlobsWorkspace(raiz)).toEqual(DOS_GLOBS)
  })

  it('rompe fuerte si no hay workspace que leer', () => {
    const raiz = crearRepo({ 'package.json': paquete('raiz') })
    expect(() => leerGlobsWorkspace(raiz)).toThrow(/pnpm-workspace\.yaml/)
  })
})

describe('listarManifiestos', () => {
  it('lista los manifiestos de los globs más la raíz, y omite lo que no es proyecto', () => {
    const raiz = crearRepo({
      'pnpm-workspace.yaml': WORKSPACE,
      'package.json': paquete('netatlas'),
      'packages/a/package.json': paquete('@netatlas/a'),
      'packages/sin-manifiesto/README.md': 'no es un paquete\n',
      'apps/b/package.json': paquete('@netatlas/b'),
      'tools/c/package.json': paquete('@netatlas/c'),
      'packages/node_modules/x/package.json': paquete('dependencia'),
      'packages/.oculto/package.json': paquete('oculto'),
      'datasets/seed/package.json': paquete('fuera-del-workspace'),
    })
    expect(relativas(raiz, listarManifiestos(raiz))).toEqual([
      'apps/b/package.json',
      'package.json',
      'packages/a/package.json',
      'tools/c/package.json',
    ])
  })

  it('rompe fuerte con un patrón que no sabe enumerar, en vez de mirar de menos', () => {
    const raiz = crearRepo({ 'pnpm-workspace.yaml': workspace(['packages/**']) })
    expect(() => listarManifiestos(raiz)).toThrow(/packages\/\*\*/)
  })
})

describe('revisarNombres', () => {
  it('señala el nombre que declaran dos proyectos, con las dos rutas', () => {
    const raiz = crearRepo({
      'pnpm-workspace.yaml': WORKSPACE,
      'package.json': paquete('netatlas'),
      'packages/app/package.json': paquete('@netatlas/app'),
      'apps/app/package.json': paquete('@netatlas/app'),
      'packages/domain/package.json': paquete('@netatlas/domain'),
    })
    const informe = revisarNombres(raiz)
    expect(informe.revisados).toBe(4)
    expect(informe.duplicados).toEqual([
      { nombre: '@netatlas/app', rutas: ['apps/app/package.json', 'packages/app/package.json'] },
    ])
  })

  it('señala también el nombre repetido tres veces y ordena por nombre', () => {
    const raiz = crearRepo({
      'pnpm-workspace.yaml': WORKSPACE,
      'packages/z/package.json': paquete('@netatlas/repetido'),
      'packages/y/package.json': paquete('@netatlas/repetido'),
      'apps/x/package.json': paquete('@netatlas/repetido'),
      'apps/w/package.json': paquete('@netatlas/otro'),
      'tools/v/package.json': paquete('@netatlas/otro'),
    })
    const { duplicados } = revisarNombres(raiz)
    expect(duplicados.map((d) => d.nombre)).toEqual(['@netatlas/otro', '@netatlas/repetido'])
    expect(duplicados[1]!.rutas).toHaveLength(3)
  })

  it('no señala nada cuando cada proyecto tiene su nombre', () => {
    const raiz = crearRepo({
      'pnpm-workspace.yaml': WORKSPACE,
      'package.json': paquete('netatlas'),
      'packages/a/package.json': paquete('@netatlas/a'),
      'apps/b/package.json': paquete('@netatlas/b'),
    })
    expect(revisarNombres(raiz).duplicados).toEqual([])
  })

  it('rompe fuerte con un proyecto sin nombre', () => {
    const raiz = crearRepo({
      'pnpm-workspace.yaml': WORKSPACE,
      'packages/a/package.json': '{"version":"0.0.0"}\n',
      'packages/b/package.json': paquete('@netatlas/b'),
    })
    expect(() => revisarNombres(raiz)).toThrow(/no declara "name"/)
  })

  it('el repositorio real no tiene dos proyectos con el mismo nombre', () => {
    const informe = revisarNombres(RAIZ_REPO)
    expect(informe.duplicados).toEqual([])
    expect(informe.revisados).toBeGreaterThan(10)
  })
})
