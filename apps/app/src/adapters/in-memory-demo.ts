import type { InMemoryDataset } from './in-memory-tipos.js'
import {
  demoAttributeDefinitions,
  demoCategories,
  demoDeviceAttributeValues,
  demoManufacturers,
  demoMedia,
  demoProtocols,
  demoStandards,
} from './in-memory-demo-catalogos.js'
import { demoDatasheets, demoDevices } from './in-memory-demo-dispositivos.js'
import { demoRelaciones, demoTopologias } from './in-memory-demo-relaciones.js'
import { demoAssertions, demoSources } from './in-memory-demo-assertions.js'

/**
 * Fábrica de dataset de demostración (determinista para tests/UI).
 * Solo ensambla: cada trozo de dato vive en su `in-memory-demo-*.ts`.
 */
export function buildDemoDataset(): InMemoryDataset {
  const manufacturers = demoManufacturers()
  const categories = demoCategories()
  const devices = demoDevices()
  const sources = demoSources()
  return {
    devices,
    manufacturers,
    categories,
    relationships: demoRelaciones(devices),
    assertions: demoAssertions(devices, sources),
    sources,
    protocols: demoProtocols(),
    standards: demoStandards(),
    media: demoMedia(),
    attributeDefinitions: demoAttributeDefinitions(),
    deviceAttributeValues: demoDeviceAttributeValues(),
    topologies: demoTopologias(),
    datasheets: demoDatasheets(sources),
  }
}
