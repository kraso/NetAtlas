import { describe, expect, it, afterEach } from 'vitest'
import { BARREL_APLICACION, importsDeValor, revisarBarrels } from '../src/barrels.js'
import { RAIZ_REPO, crearRepo, limpiarRepos } from './soporte-repo-falso.js'

afterEach(limpiarRepos)

const MODULO = 'apps/app/src/ui/x.ts'

/** Líneas que la regla reporta en una fuente dada. */
function lineasReportadas(fuente: string): readonly number[] {
  return importsDeValor(fuente, MODULO).map((v) => v.linea)
}

describe('importsDeValor', () => {
  it('reporta todas las formas que emiten código', () => {
    const fuente = [
      `import { searchDevices } from '${BARREL_APLICACION}'`,
      `import * as app from '${BARREL_APLICACION}'`,
      `import porDefecto from '${BARREL_APLICACION}'`,
      `import '${BARREL_APLICACION}'`,
      `import {} from '${BARREL_APLICACION}'`,
      `export * from '${BARREL_APLICACION}'`,
      `export * as ns from '${BARREL_APLICACION}'`,
      `export { searchDevices } from '${BARREL_APLICACION}'`,
      `import { type SearchPort, dslTerminos } from '${BARREL_APLICACION}'`,
      `export { type SearchPort, searchDevices } from '${BARREL_APLICACION}'`,
      `const m = await import('${BARREL_APLICACION}')`,
    ].join('\n')
    expect(lineasReportadas(fuente)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('deja pasar los imports de tipo, que el compilado borra enteros', () => {
    const fuente = [
      `import type { SearchPort } from '${BARREL_APLICACION}'`,
      `import { type SearchPort, type CatalogPort } from '${BARREL_APLICACION}'`,
      `import type * as app from '${BARREL_APLICACION}'`,
      `export type { Favorito } from '${BARREL_APLICACION}'`,
      `export { type SearchPort } from '${BARREL_APLICACION}'`,
      `export type * from '${BARREL_APLICACION}'`,
      `export type * as ns from '${BARREL_APLICACION}'`,
    ].join('\n')
    expect(importsDeValor(fuente, MODULO)).toEqual([])
  })

  it('no cuenta el import dinámico que está dentro de un tipo', () => {
    const fuente = [
      `type Puerto = import('${BARREL_APLICACION}').SearchPort`,
      `const puerto: typeof import('${BARREL_APLICACION}') = algo`,
      `function f(x: import('${BARREL_APLICACION}').CatalogPort): void {}`,
      `const v = await import('${BARREL_APLICACION}')`,
    ].join('\n')
    expect(lineasReportadas(fuente)).toEqual([4])
  })

  it('no confunde el barrel con una subruta, otro paquete, un comentario ni una cadena', () => {
    const fuente = [
      `import { compareDevicesUseCase } from '${BARREL_APLICACION}/casos/compare-devices'`,
      `import type { SearchPort } from '${BARREL_APLICACION}/index.js'`,
      `import { Device } from '@netatlas/domain'`,
      `import { x } from '@netatlas/application-otra'`,
      `// import { y } from '${BARREL_APLICACION}'`,
      `const texto = "import { z } from '${BARREL_APLICACION}'"`,
    ].join('\n')
    expect(importsDeValor(fuente, MODULO)).toEqual([])
  })

  it('informa de la línea del inicio y de la sentencia en una sola línea', () => {
    const fuente = ['const x = 1', '', 'import {', '  compareDevicesUseCase,', `} from '${BARREL_APLICACION}'`].join('\n')
    expect(importsDeValor(fuente, MODULO)).toEqual([
      {
        linea: 3,
        sentencia: `import { compareDevicesUseCase, } from '${BARREL_APLICACION}'`,
      },
    ])
  })
})

describe('revisarBarrels', () => {
  it('solo mira los módulos de src de la app, no el resto del workspace ni sus tests', () => {
    const raiz = crearRepo({
      [`apps/app/src/ui/roto.ts`]: `import { compareDevicesUseCase } from '${BARREL_APLICACION}'\n`,
      [`apps/app/src/ui/roto.test.ts`]: `import { x } from '${BARREL_APLICACION}'\n`,
      [`apps/app/test/roto.test.tsx`]: `import { x } from '${BARREL_APLICACION}'\n`,
      [`apps/app/dist/assets/index.js`]: `import"${BARREL_APLICACION}";\n`,
      [`packages/otro/src/modulo.ts`]: `import { x } from '${BARREL_APLICACION}'\n`,
    })
    const informe = revisarBarrels(raiz)
    expect(informe.revisados).toBe(1)
    expect(informe.violaciones.map((v) => v.ruta)).toEqual(['apps/app/src/ui/roto.ts'])
  })

  it('señala el import que dejaría la app en blanco sin necesidad de compilar', () => {
    const raiz = crearRepo({
      'apps/app/src/ui/comparar-piezas.ts': [
        '// Piezas del comparador',
        `export { compareDevicesUseCase } from '${BARREL_APLICACION}'`,
        '',
      ].join('\n'),
      'apps/app/src/viewmodels/search-store.ts': [
        `import { searchDevices } from '${BARREL_APLICACION}/casos/search-devices'`,
        `import type { SearchPort } from '${BARREL_APLICACION}'`,
        '',
      ].join('\n'),
    })
    expect(revisarBarrels(raiz).violaciones).toEqual([
      {
        ruta: 'apps/app/src/ui/comparar-piezas.ts',
        linea: 2,
        sentencia: `export { compareDevicesUseCase } from '${BARREL_APLICACION}'`,
      },
    ])
  })

  it('ordena las violaciones por fichero y línea, y analiza también los .tsx', () => {
    const raiz = crearRepo({
      'apps/app/src/ui/b.tsx': `import { a } from '${BARREL_APLICACION}'\nexport const B = () => <div />\n`,
      'apps/app/src/ui/a.ts': `import type { A } from '${BARREL_APLICACION}'\nimport { b } from '${BARREL_APLICACION}'\n`,
    })
    const informe = revisarBarrels(raiz)
    expect(informe.revisados).toBe(2)
    expect(informe.violaciones).toEqual([
      { ruta: 'apps/app/src/ui/a.ts', linea: 2, sentencia: `import { b } from '${BARREL_APLICACION}'` },
      { ruta: 'apps/app/src/ui/b.tsx', linea: 1, sentencia: `import { a } from '${BARREL_APLICACION}'` },
    ])
  })

  it('el repositorio real está limpio: los tipos del barrel no llegan al bundle', () => {
    const informe = revisarBarrels(RAIZ_REPO)
    expect(informe.violaciones).toEqual([])
    expect(informe.revisados).toBeGreaterThan(20)
  })
})
