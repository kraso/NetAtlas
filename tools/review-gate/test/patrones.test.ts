import { describe, expect, it } from 'vitest'
import { coincidePatron, filtrarFicheros, partirPatrones } from '../src/patrones.js'
import { leerRepoPropio } from './soporte.js'

describe('coincidePatron', () => {
  it('un patrón que empieza por * se compara como sufijo literal de la ruta completa', () => {
    expect(coincidePatron('packages/data/src/daos/catalog-dao.ts', '*.ts')).toBe(true)
    expect(coincidePatron('packages/data/src/daos/catalog-dao.ts', '*.tsx')).toBe(false)
    // El caso que documenta el .gga: `*fixtures*` se lee como sufijo literal
    // `fixtures*`, así que no excluye un directorio intermedio.
    expect(coincidePatron('packages/data/fixtures/demo.ts', '*fixtures*')).toBe(false)
    expect(coincidePatron('packages/data/fixtures/demo.ts', '?*fixtures/*')).toBe(true)
  })

  it('el resto de patrones se comparan como glob contra la ruta o contra el nombre', () => {
    expect(coincidePatron('tsconfig.json', 'tsconfig*.json')).toBe(true)
    expect(coincidePatron('packages/data/tsconfig.json', 'tsconfig*.json')).toBe(true)
    expect(coincidePatron('packages/data/.npmrc', '.npmrc')).toBe(true)
    expect(coincidePatron('apps/app/src/App.tsx', 'package.json')).toBe(false)
  })

  it('* incluye todo y una cadena vacía no incluye nada', () => {
    expect(coincidePatron('lo/que/sea.md', '*')).toBe(true)
    expect(coincidePatron('lo/que/sea.md', '  ')).toBe(false)
  })

  it('las comas del .gga se separan y se limpian', () => {
    expect(partirPatrones('*.ts, *.tsx ,')).toEqual(['*.ts', '*.tsx'])
  })
})

describe('filtrarFicheros', () => {
  it('deja los que casan una inclusión y ninguna exclusión', () => {
    const cambios = ['src/a.ts', 'src/a.test.ts', 'README.md', 'pnpm-lock.yaml']
    const incluidos = filtrarFicheros(cambios, '*.ts,*.md', '*.test.ts,*pnpm-lock.yaml')
    expect(incluidos).toEqual(['src/a.ts', 'README.md'])
  })
})

describe('el .gga versionado', () => {
  it('incluye el código de test y excluye fixtures, snapshots y el lockfile', () => {
    const { filePatterns, excludePatterns } = leerRepoPropio().config
    const cambios = [
      'apps/app/src/App.tsx',
      'apps/app/test/app.test.tsx',
      'apps/app/e2e/critical-flow.spec.ts',
      'packages/data/src/x-fixtures.ts',
      'packages/data/fixtures/demo.ts',
      'packages/data/src/__snapshots__/x.snap',
      'packages/data/src/tipos.d.ts',
      'pnpm-lock.yaml',
      '.github/workflows/review.yml',
      'tools/repo-lint/package.json',
    ]
    expect(filtrarFicheros(cambios, filePatterns, excludePatterns)).toEqual([
      'apps/app/src/App.tsx',
      'apps/app/test/app.test.tsx',
      'apps/app/e2e/critical-flow.spec.ts',
      '.github/workflows/review.yml',
      'tools/repo-lint/package.json',
    ])
  })
})
