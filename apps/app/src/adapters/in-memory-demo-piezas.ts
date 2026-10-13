/**
 * Piezas del dataset de demostración: `in-memory-demo.ts` importa desde aquí en
 * vez de encadenar cinco declaraciones `import`. Cada trozo de dato sigue
 * viviendo en su `in-memory-demo-*.ts`; este barrel solo reúne la superficie.
 */

export {
  demoAttributeDefinitions,
  demoCategories,
  demoDeviceAttributeValues,
  demoManufacturers,
  demoMedia,
  demoProtocols,
  demoStandards,
} from './in-memory-demo-catalogos.js'
export { demoDevices } from './in-memory-demo-dispositivos.js'
export { demoDatasheets } from './in-memory-demo-fichas.js'
export { demoRelaciones, demoTopologias } from './in-memory-demo-relaciones.js'
export { demoAssertions, demoSources } from './in-memory-demo-assertions.js'
