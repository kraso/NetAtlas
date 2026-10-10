import type { CatalogDao } from '@netatlas/data'
import type { Seed } from './build-tipos.js'

/**
 * EAV (§9.4): puebla attribute_definition + device_attribute a partir de datos
 * ya curados del seed. Cada assertion numérica de un dispositivo se copia como
 * valor de atributo de su categoría (faceta numérica). 'stackable' (enum) solo
 * en familias de switching, derivado del inventario curado (rol stack o resumen).
 *
 * Extraído a `build-atributos-logica.ts` para mantener este módulo por debajo
 * del límite de 200 líneas (§Convenciones).
 */
import {
  META_ATRIBUTO,
  seedNumericAttributes,
  seedStackableFacet,
  seedInventarioFacts,
} from './build-atributos-logica.js'

/**
 * Puebla attribute_definition + device_attribute para todo el seed.
 */
export function seedAttributes(dao: CatalogDao, seed: Seed): void {
  for (const dev of seed.devices) {
    seedNumericAttributes(dao, dev, META_ATRIBUTO)
    seedStackableFacet(dao, dev)
    seedInventarioFacts(dao, dev)
  }
}
