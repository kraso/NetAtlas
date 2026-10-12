import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { useAutocompleteStore } from '../src/viewmodels/autocomplete-store.js'

/**
 * Persistencia del historial de búsquedas (NET-HW-014): cuando el navegador
 * rechaza la escritura, la caja no puede dar la búsqueda por guardada. El store
 * lo registra, lo publica en `error` (la UI lo muestra con `role="alert"`) y
 * conserva la lista anterior.
 */
describe('Persistencia del historial de búsquedas', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('sin escritura avisa en el estado y conserva la lista anterior', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { guardar } = useAutocompleteStore.getState()
    guardar('bgp')
    const previas = useAutocompleteStore.getState().guardadas
    expect(previas).toContain('bgp')

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    guardar('vxlan')

    expect(useAutocompleteStore.getState().guardadas).toEqual(previas)
    expect(useAutocompleteStore.getState().error).toBe('No se pudieron guardar las búsquedas.')
    expect(warn).toHaveBeenCalled()
  })
})
