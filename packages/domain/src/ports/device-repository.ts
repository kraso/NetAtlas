import { Device } from '../catalog/device.js'
import type { Manufacturer } from '../catalog/manufacturer.js'
import type { Category } from '../catalog/category.js'

/** Resultado de una consulta de catálogo paginada por cursor (sección 23.1). */
export interface Page<T> {
  readonly items: readonly T[]
  readonly nextCursor?: string | undefined
}

export interface DeviceQuery {
  readonly categoryCode?: string
  readonly manufacturerSlug?: string
  readonly lifecycleStatus?: string
  readonly limit: number
  readonly cursor?: string | undefined
}

/**
 * Puerto DeviceRepository (sección 6.6).
 * El dominio depende de esta interfaz; la infraestructura la implementa.
 */
export interface DeviceRepository {
  findBySlug(slug: string): Promise<Device | undefined>
  findByIds(ids: readonly number[]): Promise<readonly Device[]>
  listByCategory(categoryCode: string, query: DeviceQuery): Promise<Page<Device>>
  findByManufacturer(manufacturerSlug: string, query: DeviceQuery): Promise<Page<Device>>
  count(): Promise<number>
  save(device: Device): Promise<void>
}

/** Puerto de catálogo auxiliar (fabricantes y categorías). */
export interface CatalogRepository {
  manufacturerBySlug(slug: string): Promise<Manufacturer | undefined>
  categoryByCode(code: string): Promise<Category | undefined>
  listCategories(): Promise<readonly Category[]>
}