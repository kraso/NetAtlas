import { describe, expect, it } from 'vitest'
import { contarLineasCambiadas, leerHunks, señalaElCambio, unirHunks } from '../src/hunks.js'

const DIFF = [
  'diff --git a/src/a.ts b/src/a.ts',
  'index 1111111..2222222 100644',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -12,0 +13,2 @@',
  '+nueva1',
  '+nueva2',
  '@@ -40,3 +42,0 @@',
  '-vieja1',
  '-vieja2',
  '-vieja3',
  'diff --git a/src/nuevo.ts b/src/nuevo.ts',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/src/nuevo.ts',
  '@@ -0,0 +1,5 @@',
  '+linea',
].join('\n')

describe('leerHunks', () => {
  it('traduce los rangos a líneas de la versión nueva y marca los borrados puros', () => {
    const hunks = leerHunks(DIFF)
    expect(hunks.get('src/a.ts')).toEqual([
      { desde: 13, hasta: 14, borradas: 0 },
      { desde: 43, hasta: 42, borradas: 3 },
    ])
    expect(hunks.get('src/nuevo.ts')).toEqual([{ desde: 1, hasta: 5, borradas: 0 }])
  })

  it('ignora ficheros borrados y hunks sin cabecera de fichero', () => {
    const diff = ['--- a/x.ts', '+++ /dev/null', '@@ -1,2 +0,0 @@', '-a', '-b'].join('\n')
    expect(leerHunks(diff).size).toBe(0)
  })

  it('los hunks sin recuento explícito cuentan una línea', () => {
    const diff = ['--- a/x.ts', '+++ b/x.ts', '@@ -3 +4 @@', '+nueva'].join('\n')
    expect(leerHunks(diff).get('x.ts')).toEqual([{ desde: 4, hasta: 4, borradas: 1 }])
  })
})

describe('unirHunks', () => {
  it('absorbe huecos pequeños, que no aportan nada al revisor', () => {
    expect(unirHunks([{ desde: 10, hasta: 10, borradas: 0 }, { desde: 14, hasta: 16, borradas: 1 }])).toEqual([
      { desde: 10, hasta: 16, borradas: 1 },
    ])
  })

  it('deja separados los bloques que están lejos', () => {
    expect(unirHunks([{ desde: 10, hasta: 10, borradas: 0 }, { desde: 40, hasta: 41, borradas: 0 }]).length).toBe(2)
  })
})

describe('contarLineasCambiadas y señalaElCambio', () => {
  it('cuenta solo las líneas nuevas y tolera el desvío de la cita', () => {
    const hunks = [{ desde: 10, hasta: 12, borradas: 4 }]
    expect(contarLineasCambiadas(hunks)).toBe(3)
    expect(señalaElCambio(hunks, 12)).toBe(true)
    expect(señalaElCambio(hunks, 15)).toBe(true)
    expect(señalaElCambio(hunks, 16)).toBe(false)
    expect(señalaElCambio(hunks, null)).toBe(false)
  })
})
