import type { Assertion, Datasheet, DeviceImage, Source } from '@netatlas/domain'
import type { SourcingRepository } from '@netatlas/domain'
import type { InMemoryDataset } from './in-memory-tipos.js'

export class InMemorySourcingRepository implements SourcingRepository {
  constructor(private readonly data: InMemoryDataset) {}

  /** Afirmaciones de un dispositivo por slug. */
  async assertionsForDevice(slug: string): Promise<readonly Assertion[]> {
    const i = this.data.devices.findIndex((d) => d.slug.value === slug)
    if (i === -1) return []
    return this.assertionsFor('device', i + 1)
  }

  /** Slug del dispositivo dueno de una assertion (subjectId = índice+1). */
  private slugDeAssertion(a: Assertion): string | undefined {
    if (a.subjectType !== 'device') return undefined
    return this.data.devices[a.subjectId - 1]?.slug.value
  }

  async assertionsFor(subjectType: string, subjectId: number): Promise<readonly Assertion[]> {
    return this.data.assertions.filter(
      (a) => a.subjectType === subjectType && a.subjectId === subjectId,
    )
  }

  async sourceBySlug(slug: string): Promise<Source | undefined> {
    return this.data.sources.find((s) => s.slug === slug)
  }

  /** Datasheets de un dispositivo por slug (pestaña Documentación, F2). */
  async datasheetsForDevice(deviceSlug: string): Promise<readonly Datasheet[]> {
    return (this.data.datasheets ?? []).filter((f) => f.deviceSlug === deviceSlug)
  }

  /** Imágenes del dispositivo (foto en Resumen, F2-Fotos). */
  async imagesForDevice(deviceSlug: string): Promise<readonly DeviceImage[]> {
    return (this.data.images ?? []).filter((g) => g.deviceSlug === deviceSlug)
  }
}
