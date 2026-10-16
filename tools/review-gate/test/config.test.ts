import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CONFIG_POR_DEFECTO, parsearConfig, resolverConfig, rutaConfigGlobal } from '../src/config.js'
import { leerRepoPropio } from './soporte.js'

describe('parsearConfig', () => {
  it('lee las claves del .gga, sin comentarios y sin comillas', () => {
    const texto = [
      '# comentario',
      'PROVIDER="opencode:modelo-gratis"',
      "FILE_PATTERNS='*.ts,*.tsx'",
      'EXCLUDE_PATTERNS=""',
      'TIMEOUT="900"',
      'PR_BASE_BRANCH="main"',
      'NO_ES_UNA_CLAVE=1',
    ].join('\n')
    expect(parsearConfig(texto)).toEqual({
      proveedor: 'opencode:modelo-gratis',
      filePatterns: '*.ts,*.tsx',
      excludePatterns: '',
      prBaseBranch: 'main',
    })
  })

  it('no se queda con el TIMEOUT del .gga: el presupuesto por pasada es del wrapper', () => {
    expect(parsearConfig('TIMEOUT="900"')).toEqual({})
  })
})

describe('resolverConfig', () => {
  it('el .gga manda sobre la config global y el entorno manda sobre todo', () => {
    const config = resolverConfig({
      global: 'PROVIDER="claude"\nTIMEOUT="300"\nFILE_PATTERNS="*.py"\n',
      proyecto: 'PROVIDER="opencode:modelo-gratis"\nTIMEOUT="600"\n',
      entorno: { GGA_PROVIDER: 'codex', GGA_TIMEOUT: '120' },
    })
    expect(config.proveedor).toBe('codex')
    expect(config.filePatterns).toBe('*.py')
  })

  it('sin fuentes queda la política por defecto', () => {
    expect(resolverConfig({ entorno: {} })).toEqual(CONFIG_POR_DEFECTO)
  })
})

describe('rutaConfigGlobal', () => {
  it('usa el directorio de cada plataforma, en el orden de GGA', () => {
    const appData = join('C:', 'Users', 'x', 'AppData', 'Roaming')
    expect(rutaConfigGlobal({ APPDATA: appData })).toBe(join(appData, 'gga', 'config'))
    expect(rutaConfigGlobal({ XDG_CONFIG_HOME: '/home/x/.config' })).toBe(join('/home/x/.config', 'gga', 'config'))
    expect(rutaConfigGlobal({ HOME: '/home/x' })).toBe(join('/home/x', '.config', 'gga', 'config'))
    expect(rutaConfigGlobal({})).toBeNull()
  })
})

describe('el .gga del repositorio', () => {
  it('declara el proveedor del gateway, las reglas y el presupuesto', () => {
    const { config } = leerRepoPropio()
    expect(config.proveedor.startsWith('opencode:')).toBe(true)
    expect(config.rulesFile).toBe('AGENTS.md')
    expect(config.filePatterns).toContain('*.ts')
    // El transporte del gate y el `.sh` que lo ejecuta entran al review.
    expect(config.filePatterns).toContain('*.sh')
  })
})
