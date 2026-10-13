import { existsSync } from 'node:fs'

/**
 * Invariante 12 de data:lint — los recursos locales (datasheets y fotos) deben
 * vivir dentro del bundle de la app.
 *
 * Regresión real: 32 datasheets declaraban `docs/…`, el directorio fuente del
 * repositorio, que la app no publica (Vite solo copia `apps/app/public/`). La
 * ficha no fallaba: la pestaña Documentación renderizaba el título como texto
 * plano y el PDF quedaba inaccesible sin que ningún chequeo lo notara.
 */

export interface RecursoLocal {
  readonly deviceSlug: string
  readonly clase: 'datasheet' | 'imagen'
  readonly ruta: string
}

export interface IssueRecurso {
  readonly rule: string
  readonly message: string
}

/** Prefijo, relativo a `public/`, desde el que la app sirve los recursos. */
const PREFIJO_BUNDLE = 'assets/'

/** Recolecta los `localPath` declarados por los dispositivos, con su dueño. */
export function recursosLocalesDe(
  devices: readonly {
    slug: string
    datasheets?: { localPath?: string }[]
    images?: { localPath?: string }[]
  }[],
): readonly RecursoLocal[] {
  const recursos: RecursoLocal[] = []
  for (const device of devices) {
    for (const ficha of device.datasheets ?? []) {
      if (ficha.localPath !== undefined) {
        recursos.push({ deviceSlug: device.slug, clase: 'datasheet', ruta: ficha.localPath })
      }
    }
    for (const imagen of device.images ?? []) {
      if (imagen.localPath !== undefined) {
        recursos.push({ deviceSlug: device.slug, clase: 'imagen', ruta: imagen.localPath })
      }
    }
  }
  return recursos
}

/**
 * Valida cada ruta contra el bundle. La comprobación de existencia necesita el
 * directorio `public/` real (`publicDir`); sin él solo se juzga la convención.
 */
export function validarRecursosLocales(
  recursos: readonly RecursoLocal[],
  publicDir?: string,
): readonly IssueRecurso[] {
  const issues: IssueRecurso[] = []
  for (const recurso of recursos) {
    const donde = `${recurso.clase} de "${recurso.deviceSlug}"`
    if (!recurso.ruta.startsWith(PREFIJO_BUNDLE)) {
      issues.push({
        rule: 'local-path-fuera-bundle',
        message: `${donde} apunta a "${recurso.ruta}", fuera del bundle (debe empezar por "${PREFIJO_BUNDLE}").`,
      })
      continue
    }
    if (publicDir !== undefined && !existsSync(`${publicDir}/${recurso.ruta}`)) {
      issues.push({
        rule: 'local-path-inexistente',
        message: `${donde} apunta a "${recurso.ruta}", que no existe en el bundle.`,
      })
    }
  }
  return issues
}
