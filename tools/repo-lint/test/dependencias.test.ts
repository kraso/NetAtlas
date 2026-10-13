import { describe, expect, it, afterEach } from 'vitest'
import { ESPECIFICADOR_INTERNO, revisarDependencias } from '../src/dependencias.js'
import {
  RAIZ_REPO,
  crearRepo,
  limpiarRepos,
  paquete,
  paqueteConDeps,
  workspace,
} from './soporte-repo-falso.js'

const WORKSPACE = workspace(['packages/*', 'apps/*', 'tools/*'])

afterEach(limpiarRepos)

describe('revisarDependencias', () => {
  it('señala el rango escrito a mano en una dependencia interna', () => {
    const raiz = crearRepo({
      'pnpm-workspace.yaml': WORKSPACE,
      'apps/app/package.json': paqueteConDeps('@netatlas/app', {
        dependencies: { '@netatlas/server': 'workspace:^' },
      }),
      'packages/server/package.json': paquete('@netatlas/server'),
    })
    expect(revisarDependencias(raiz).violaciones).toEqual([
      {
        motivo: 'rango-a-mano',
        ruta: 'apps/app/package.json',
        seccion: 'dependencies',
        dependencia: '@netatlas/server',
        declarada: 'workspace:^',
        esperada: ESPECIFICADOR_INTERNO,
      },
    ])
  })

  it('señala también una versión a mano y un enlace a una ruta del disco', () => {
    const raiz = crearRepo({
      'pnpm-workspace.yaml': WORKSPACE,
      'packages/a/package.json': paqueteConDeps('@netatlas/a', {
        dependencies: { '@netatlas/b': '^0.0.0', '@netatlas/c': 'file:../c' },
        devDependencies: { '@netatlas/b': 'link:../b' },
      }),
      'packages/b/package.json': paquete('@netatlas/b'),
      'packages/c/package.json': paquete('@netatlas/c'),
    })
    // Orden de la regla: por manifiesto y luego por nombre de dependencia, así
    // que las dos de `@netatlas/b` van juntas (dependencies antes que
    // devDependencies, que es el orden en que se leen las secciones).
    const declaradas = revisarDependencias(raiz).violaciones.map((v) => v.declarada)
    expect(declaradas).toEqual(['^0.0.0', 'link:../b', 'file:../c'])
  })

  it('no señala las dependencias externas, que llevan rango por definición', () => {
    const raiz = crearRepo({
      'pnpm-workspace.yaml': WORKSPACE,
      'apps/app/package.json': paqueteConDeps('@netatlas/app', {
        dependencies: { react: '^18.3.1', '@netatlas/domain': 'workspace:*' },
        devDependencies: { '@types/node': '^22.10.2', vitest: '^2.1.8' },
      }),
      'packages/domain/package.json': paquete('@netatlas/domain'),
    })
    const informe = revisarDependencias(raiz)
    expect(informe.violaciones).toEqual([])
    expect(informe.internas).toBe(1)
    expect(informe.revisados).toBe(2)
  })

  it('revisa las cuatro secciones donde puede declararse una dependencia', () => {
    const raiz = crearRepo({
      'pnpm-workspace.yaml': WORKSPACE,
      'packages/a/package.json': paqueteConDeps('@netatlas/a', {
        dependencies: { '@netatlas/b': '^0.0.0' },
        devDependencies: { '@netatlas/b': 'workspace:^' },
        peerDependencies: { '@netatlas/b': '1.0.0' },
        optionalDependencies: { '@netatlas/b': 'file:../b' },
      }),
      'packages/b/package.json': paquete('@netatlas/b'),
    })
    const informe = revisarDependencias(raiz)
    expect(informe.violaciones.map((v) => v.seccion)).toEqual([
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ])
    expect(informe.internas).toBe(4)
  })

  it('solo mira las secciones de dependencias, no el resto del manifiesto', () => {
    const raiz = crearRepo({
      'pnpm-workspace.yaml': WORKSPACE,
      'packages/a/package.json': `${JSON.stringify(
        {
          name: '@netatlas/a',
          version: '0.0.0',
          private: true,
          scripts: { '@netatlas/b': 'echo no es una dependencia' },
        },
        null,
        2,
      )}\n`,
      'packages/b/package.json': paquete('@netatlas/b'),
    })
    const informe = revisarDependencias(raiz)
    expect(informe.violaciones).toEqual([])
    expect(informe.internas).toBe(0)
  })

  it('señala una dependencia interna que no declara una cadena, en vez de saltársela', () => {
    const raiz = crearRepo({
      'pnpm-workspace.yaml': WORKSPACE,
      'packages/a/package.json': paqueteConDeps('@netatlas/a', {
        dependencies: { '@netatlas/b': { version: '1.0.0' } },
      }),
      'packages/b/package.json': paquete('@netatlas/b'),
    })
    const informe = revisarDependencias(raiz)
    expect(informe.violaciones).toEqual([
      {
        motivo: 'especificador-invalido',
        ruta: 'packages/a/package.json',
        seccion: 'dependencies',
        dependencia: '@netatlas/b',
        declarada: '{"version":"1.0.0"}',
        esperada: ESPECIFICADOR_INTERNO,
      },
    ])
    expect(informe.internas).toBe(1)
  })

  it('el repositorio real declara todas sus dependencias internas con "workspace:*"', () => {
    const informe = revisarDependencias(RAIZ_REPO)
    expect(informe.violaciones).toEqual([])
    expect(informe.internas).toBeGreaterThan(10)
  })
})
