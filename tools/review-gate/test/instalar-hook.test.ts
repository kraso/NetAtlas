import { describe, expect, it } from 'vitest'
import { decideInstalacion } from '../src/instalar-hook.js'

describe('decideInstalacion', () => {
  it('instala si no había hook', () => {
    expect(decideInstalacion(null, false).accion).toBe('instalar')
  })

  it('releva al hook de GGA conservando copia', () => {
    const hookGga = '#!/usr/bin/env bash\n\n# ======== GGA START ========\ngga run || exit 1\n# ======== GGA END ========\n'
    expect(decideInstalacion(hookGga, false).accion).toBe('reemplazar-gga')
  })

  it('no toca el hook del gate si ya estaba', () => {
    const hookGate = '#!/usr/bin/env bash\n# ... pnpm review:gate --staged\n'
    expect(decideInstalacion(hookGate, false).accion).toBe('ya-instalado')
  })

  it('rechaza un hook ajeno salvo con --force, que conserva copia igual', () => {
    expect(decideInstalacion('#!/bin/sh\necho hola\n', false).accion).toBe('rechazar')
    expect(decideInstalacion('#!/bin/sh\necho hola\n', true).accion).toBe('instalar')
  })
})
