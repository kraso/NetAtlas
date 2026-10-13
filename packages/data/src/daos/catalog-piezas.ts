/**
 * Pasadas del catálogo: `CatalogDao` delega aquí desde sus métodos.
 */
export { upsertManufacturer, manufacturerId, upsertCategory, categoryId, upsertSource, sourceId } from './catalog-maestros.js'
export { protocolId, standardId, mediumId, seedLayer, seedLayerId } from './catalog-maestros.js'
export { upsertDevice, deviceId, eliminarDeviceCompleto, bulkInsertDevices, clearPorts, addPort, addDatasheet, addImage } from './catalog-dispositivos.js'
export { seedPredicates, addAssertion, existingStandardRefs, addRelationship } from './catalog-aristas.js'
export { defineAttribute, setDeviceAttribute } from './catalog-eav.js'
