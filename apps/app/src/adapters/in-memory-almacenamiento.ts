/**
 * Acceso tolerante a localStorage compartido por los adaptadores in-memory:
 * en SSR/tests sin jsdom no hay almacenamiento y el dato se pierde sin romper.
 */

export function storageGet(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
  } catch {
    return null
  }
}

export function storageSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value)
  } catch {
    // Sin almacenamiento (SSR/tests sin jsdom): el layout se pierde, no falla.
  }
}

export function storageRemove(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key)
  } catch {
    // idem
  }
}
