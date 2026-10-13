import { existsSync } from 'node:fs'
import { join, sep } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ENTRADA_APP, PUERTAS_NODE, revisarFrontera } from '../src/frontera.js'
import { RAIZ_REPO, crearRepo, limpiarRepos, paquete, workspace } from './soporte-repo-falso.js'

const WORKSPACE = workspace(['packages/*', 'apps/*'])

/** Clave de la entrada del bundle, con separadores POSIX como los usa `crearRepo`. */
const MAIN = ENTRADA_APP.split(sep).join('/')

/** Manifiesto del servidor con la forma del de verdad: barrel y subruta de fetch. */
const SERVER = `${JSON.stringify(
  {
    name: '@netatlas/server',
    version: '0.0.0',
    private: true,
    exports: { '.': './src/index.ts', './sync-http': './src/sync-http.ts' },
  },
  null,
  2,
)}\n`

/** La puerta de Node que el repositorio declara hoy. */
const PUERTA_SQLITE = 'apps/app/src/composition-root-sqlite.ts'

afterEach(limpiarRepos)

describe('revisarFrontera', () => {
  it('señala el builtin de Node que la app alcanza por el barrel del servidor', () => {
    const raiz = crearRepo({
      'pnpm-workspace.yaml': WORKSPACE,
      [MAIN]: "import { crearServidor } from '@netatlas/server'\n",
      'packages/server/package.json': SERVER,
      'packages/server/src/index.ts': "export { SqliteStore } from './sqlite-store.js'\n",
      'packages/server/src/sqlite-store.ts': "import { DatabaseSync } from 'node:sqlite'\n",
    })
    const informe = revisarFrontera(raiz)
    expect(informe.ausente).toBe(false)
    expect(informe.violaciones).toEqual([
      {
        ruta: 'packages/server/src/sqlite-store.ts',
        specifier: 'node:sqlite',
        cadena: [
          'apps/app/src/main.tsx',
          'packages/server/src/index.ts',
          'packages/server/src/sqlite-store.ts',
        ],
      },
    ])
  })

  it('deja cruzar la subruta de fetch, y por ella el barrel no entra', () => {
    const raiz = crearRepo({
      'pnpm-workspace.yaml': WORKSPACE,
      [MAIN]: "import { HttpSyncServer } from '@netatlas/server/sync-http'\n",
      'packages/server/package.json': SERVER,
      'packages/server/src/index.ts': "export { SqliteStore } from './sqlite-store.js'\n",
      'packages/server/src/sqlite-store.ts': "import { DatabaseSync } from 'node:sqlite'\n",
      'packages/server/src/sync-http.ts': "import type { SyncServer } from '@netatlas/domain'\n",
    })
    const informe = revisarFrontera(raiz)
    expect(informe.violaciones).toEqual([])
    // Solo `sync-http.ts`: el barrel del servidor —y con él `node:sqlite`— no entra.
    expect(informe.alcanzados).toBe(1)
  })

  it('no cruza con un import de tipo, que el compilado borra entero', () => {
    const raiz = crearRepo({
      'pnpm-workspace.yaml': WORKSPACE,
      [MAIN]: "import type { Dispositivo } from '@netatlas/data'\n",
      'packages/data/package.json': paquete('@netatlas/data'),
      'packages/data/src/index.ts': "export { SqliteStore } from './sqlite.js'\n",
      'packages/data/src/sqlite.ts': "import { DatabaseSync } from 'node:sqlite'\n",
    })
    const informe = revisarFrontera(raiz)
    expect(informe.violaciones).toEqual([])
    expect(informe.alcanzados).toBe(0)
  })

  it('no juzga una puerta de Node declarada, pero la cuenta', () => {
    const raiz = crearRepo({
      'pnpm-workspace.yaml': WORKSPACE,
      [MAIN]: "void import('./composition-root-sqlite.js')\n",
      [PUERTA_SQLITE]: "import { join } from 'node:path'\n",
    })
    expect(PUERTAS_NODE.has(PUERTA_SQLITE)).toBe(true)
    const informe = revisarFrontera(raiz)
    expect(informe.violaciones).toEqual([])
    expect(informe.puertas).toEqual([PUERTA_SQLITE])
  })

  it('resuelve también los proyectos que no viven en packages/', () => {
    const raiz = crearRepo({
      'pnpm-workspace.yaml': workspace(['packages/*', 'apps/*', 'tools/*']),
      [MAIN]: "import { ayudante } from '@netatlas/ayudante'\n",
      'tools/ayudante/package.json': paquete('@netatlas/ayudante'),
      'tools/ayudante/src/index.ts': "import { readFileSync } from 'node:fs'\n",
    })
    const informe = revisarFrontera(raiz)
    expect(informe.violaciones).toEqual([
      {
        ruta: 'tools/ayudante/src/index.ts',
        specifier: 'node:fs',
        cadena: ['apps/app/src/main.tsx', 'tools/ayudante/src/index.ts'],
      },
    ])
  })

  it('ve el builtin también en un import dinámico escrito con plantilla', () => {
    const raiz = crearRepo({
      'pnpm-workspace.yaml': WORKSPACE,
      [MAIN]: 'void import(`node:sqlite`)\n',
    })
    const informe = revisarFrontera(raiz)
    expect(informe.violaciones).toEqual([
      {
        ruta: 'apps/app/src/main.tsx',
        specifier: 'node:sqlite',
        cadena: ['apps/app/src/main.tsx'],
      },
    ])
  })

  it('avisa cuando el bundle no tiene entrada que seguir', () => {
    const raiz = crearRepo({
      'pnpm-workspace.yaml': WORKSPACE,
      'packages/server/package.json': paquete('@netatlas/server'),
    })
    const informe = revisarFrontera(raiz)
    expect(informe.ausente).toBe(true)
    expect(informe.alcanzados).toBe(0)
  })

  it('cada puerta declarada existe en el repositorio y lleva motivo', () => {
    for (const [puerta, motivo] of PUERTAS_NODE) {
      expect(existsSync(join(RAIZ_REPO, puerta))).toBe(true)
      expect(motivo.length).toBeGreaterThan(0)
    }
  })

  it('el repositorio real no cruza la frontera', () => {
    const informe = revisarFrontera(RAIZ_REPO)
    expect(informe.ausente).toBe(false)
    expect(informe.violaciones).toEqual([])
    expect(informe.alcanzados).toBeGreaterThan(10)
    expect(informe.puertas.length).toBeGreaterThan(0)
  })
})
