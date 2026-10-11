import { calcularCoberturaCritica, claveArista, esFuenteSintetica, PASIVAS } from '@netatlas/domain'
import type { Assertion, CoberturaCriticaResultado, Relationship } from '@netatlas/domain'
import type { InMemoryDataset } from './in-memory-tipos.js'
import { storageGet, storageSet } from './in-memory-almacenamiento.js'

// ── Calidad del dataset y cola de reconciliación (F6 §19.3, NET-HW-045/047/049) ─

export interface UiCoberturaCategoria {
  readonly categoria: string
  readonly dispositivos: number
  readonly conAssertions: number
  readonly cobertura: number
}

export interface UiQualityReport {
  readonly dispositivos: number
  readonly conAssertions: number
  readonly coberturaFuentes: number
  readonly coberturaCritica: CoberturaCriticaResultado
  readonly distribucionConfianza: readonly { confianza: string; n: number }[]
  readonly atributosEAV: number
  readonly dispositivosSinEAV: number
  readonly relaciones: number
  readonly reconciliacionesPendientes: number
  readonly porCategoria: readonly UiCoberturaCategoria[]
}

export interface UiReconciliationRow {
  readonly id: number
  readonly entradaSlug: string
  readonly existenteSlug: string
  readonly score: number
  readonly diff: readonly { campo: string; entrante: string; existente: string }[]
  readonly status: 'pending' | 'accepted' | 'rejected'
  readonly author?: string | undefined
  readonly createdAt: string
  readonly resolvedAt?: string | undefined
}

export interface UiQualityRepo {
  report(): Promise<UiQualityReport>
  reconciliacionesPendientes(): Promise<readonly UiReconciliationRow[]>
  resolverReconciliacion(id: number, decision: 'accepted' | 'rejected', autor: string): Promise<void>
  /** Manifiesto del dataset (solo disponible en el modo SQLite real). */
  manifiesto(): Promise<Record<string, unknown> | undefined>
}

const K_RECONCILIACION = 'netatlas.reconciliation.v1'

/** Adaptador de calidad para la UI demo (cola persistida en localStorage). */
export class InMemoryQualityRepository implements UiQualityRepo {
  constructor(private readonly data: InMemoryDataset) {}

  async report(): Promise<UiQualityReport> {
    const dispositivos = this.data.devices.length
    const conAssertions = this.data.devices.filter((d) => this.tieneAssertion(d.slug.value)).length
    return {
      dispositivos,
      conAssertions,
      coberturaFuentes: dispositivos > 0 ? Math.round((conAssertions / dispositivos) * 100) : 0,
      coberturaCritica: this.coberturaCritica(),
      distribucionConfianza: this.distribucionConfianza(),
      atributosEAV: (this.data.deviceAttributeValues ?? []).length,
      dispositivosSinEAV: this.dispositivosSinEAV(),
      relaciones: this.data.relationships.length,
      reconciliacionesPendientes: (await this.reconciliacionesPendientes()).length,
      porCategoria: this.porCategoria(),
    }
  }

  /**
   * Cobertura de datos críticos (F2): assertions y relaciones del demo con la
   * misma métrica pura del dominio que el SQLite real. Igual que allí, las
   * fuentes sintéticas quedan fuera —tanto assertions como aristas (el pull
   * HTTP marca en `relacionesSinteticas` las que solo constan por herramienta).
   */
  private coberturaCritica(): CoberturaCriticaResultado {
    const slugDeAssertion = (a: Assertion): string | undefined =>
      a.subjectType === 'device' ? this.data.devices[a.subjectId - 1]?.slug.value : undefined
    return calcularCoberturaCritica(
      this.data.devices
        .filter((d) => !PASIVAS.includes(d.categoryCode))
        .map((d) => ({
          slug: d.slug.value,
          categoryCode: d.categoryCode,
          assertionPredicates: this.data.assertions
            .filter((a) => slugDeAssertion(a) === d.slug.value && !esFuenteSintetica(a.source.slug))
            .map((a) => a.predicate),
          relationshipPredicates: this.data.relationships
            .filter((r) => !this.esAristaSintetica(r))
            .filter((r) => r.subject.slug === d.slug.value || r.object.slug === d.slug.value)
            .map((r) => r.predicate),
        })),
    )
  }

  /** ¿La arista solo consta por fuente sintética (importación asistida)? */
  private esAristaSintetica(r: Relationship): boolean {
    return this.data.relacionesSinteticas?.has(claveArista(r)) ?? false
  }

  private distribucionConfianza(): readonly { confianza: string; n: number }[] {
    const confianza = new Map<string, number>()
    for (const a of this.data.assertions) confianza.set(a.confidence, (confianza.get(a.confidence) ?? 0) + 1)
    return [...confianza.entries()].map(([valor, n]) => ({ confianza: valor, n })).sort((a, b) => b.n - a.n)
  }

  private dispositivosSinEAV(): number {
    return this.data.devices.filter((d) => !(this.data.deviceAttributeValues ?? []).some((v) => v.deviceSlug === d.slug.value)).length
  }

  private porCategoria(): readonly UiCoberturaCategoria[] {
    const porCat = new Map<string, { dispositivos: number; conAssertions: number }>()
    for (const d of this.data.devices) {
      const e = porCat.get(d.categoryCode) ?? { dispositivos: 0, conAssertions: 0 }
      e.dispositivos++
      if (this.tieneAssertion(d.slug.value)) e.conAssertions++
      porCat.set(d.categoryCode, e)
    }
    return [...porCat.entries()].map(([categoria, e]) => ({
      categoria,
      dispositivos: e.dispositivos,
      conAssertions: e.conAssertions,
      cobertura: e.dispositivos > 0 ? Math.round((e.conAssertions / e.dispositivos) * 100) : 0,
    }))
  }

  async reconciliacionesPendientes(): Promise<readonly UiReconciliationRow[]> {
    const raw = storageGet(K_RECONCILIACION)
    if (!raw) return []
    try {
      const lista = JSON.parse(raw) as UiReconciliationRow[]
      return lista.filter((r) => r.status === 'pending')
    } catch (error) {
      // Cola local ilegible: se registra con contexto y la vista sigue con la
      // cola vacía, en vez de tragarse el fallo sin dejar rastro.
      console.warn('[WARN] cola de reconciliación ilegible; se muestra vacía', { error })
      return []
    }
  }

  async resolverReconciliacion(id: number, decision: 'accepted' | 'rejected', autor: string): Promise<void> {
    const raw = storageGet(K_RECONCILIACION)
    const lista = raw ? (JSON.parse(raw) as UiReconciliationRow[]) : []
    const idx = lista.findIndex((r) => r.id === id)
    const actual = lista[idx]
    if (idx === -1 || actual === undefined) return
    lista[idx] = { ...actual, status: decision, author: autor, resolvedAt: new Date().toISOString() }
    storageSet(K_RECONCILIACION, JSON.stringify(lista))
  }

  /** Extensión demo (no forma parte del contrato): sembrar un candidato pendiente. */
  async crearCandidatoDemo(entradaSlug: string, existenteSlug: string, score: number, diff: UiReconciliationRow['diff']): Promise<void> {
    const raw = storageGet(K_RECONCILIACION)
    const lista = raw ? (JSON.parse(raw) as UiReconciliationRow[]) : []
    const id = lista.length > 0 ? Math.max(...lista.map((r) => r.id)) + 1 : 1
    lista.push({ id, entradaSlug, existenteSlug, score, diff, status: 'pending', createdAt: new Date().toISOString() })
    storageSet(K_RECONCILIACION, JSON.stringify(lista))
  }

  /** Las assertions del demo referencian el device por índice (subjectId). */
  private tieneAssertion(slug: string): boolean {
    const idx = this.data.devices.findIndex((d) => d.slug.value === slug) + 1
    return this.data.assertions.some((a) => a.subjectId === idx)
  }

  /** Modo demo: no hay manifiesto de dataset en disco. */
  async manifiesto(): Promise<Record<string, unknown> | undefined> {
    return undefined
  }
}
