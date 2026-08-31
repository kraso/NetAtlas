import { describe, expect, it, beforeAll } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { NodeSqliteDriver, CatalogDao, applyMigrations, loadMigrations, SqliteSourcingRepository, SqliteGraphRepository } from '../src/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = resolve(here, '..', 'migrations')

describe('SqliteSourcingRepository / GraphRepository integrados', () => {
  let repo: SqliteSourcingRepository
  let graph: SqliteGraphRepository
  let deviceId: number

  beforeAll(() => {
    const driver = new NodeSqliteDriver(':memory:')
    applyMigrations(driver, loadMigrations(migrationsDir))
    const dao = new CatalogDao(driver)
    dao.upsertManufacturer({ slug: 'acme', name: 'Acme' })
    dao.upsertCategory({ code: 'CAT-SWT', nameEs: 'Sw', aliases: ['sw'] })
    dao.upsertCategory({ code: 'CAT-SWT-L2', parentCode: 'CAT-SWT', nameEs: 'L2', aliases: [] })
    dao.upsertSource({ slug: 'ds-1', kind: 'datasheet', publisher: 'Acme', title: 'Datasheet A', authorityLevel: 1 })
    dao.upsertSource({ slug: 'ed-1', kind: 'editorial', publisher: 'NetAtlas', title: 'Criterio', authorityLevel: 4 })
    dao.upsertDevice({ slug: 'sw-a', name: 'Switch A', manufacturerSlug: 'acme', categoryCode: 'CAT-SWT-L2', lifecycleStatus: 'current' })
    deviceId = dao.deviceId('sw-a')!
    dao.addAssertion({
      subjectType: 'device',
      subjectId: deviceId,
      predicate: 'throughput_gbps',
      valueJson: '{"gbps": 176}',
      sourceSlug: 'ds-1',
      confidence: 'official',
      verifiedOn: '2025-02-10',
      author: 'curator',
      reviewedBy: 'reviewer',
    })
    dao.addAssertion({
      subjectType: 'device',
      subjectId: deviceId,
      predicate: 'similar-to',
      valueJson: '{"slug":"sw-b"}',
      sourceSlug: 'ed-1',
      confidence: 'third-party',
      verifiedOn: '2025-02-10',
      author: 'curator',
    })
    dao.protocolId('ospf')
    dao.seedPredicates([{ code: 'supports-protocol', domain: ['device'], range: ['protocol'] }] as never)
    dao.addRelationship({
      subjectType: 'device',
      subjectId: deviceId,
      predicate: 'supports-protocol',
      objectType: 'protocol',
      objectId: dao.protocolId('ospf'),
    })

    repo = new SqliteSourcingRepository(driver)
    graph = new SqliteGraphRepository(driver)
  })

  it('devuelve assertions trazables con su fuente completa', async () => {
    const assertions = await repo.assertionsFor('device', deviceId)
    expect(assertions.length).toBe(2)
    const tput = assertions.find((a) => a.predicate === 'throughput_gbps')
    expect(tput).toBeDefined()
    expect(tput!.confidence).toBe('official')
    expect(tput!.source.title).toBe('Datasheet A')
    expect(tput!.source.authorityLevel).toBe(1)
    expect(tput!.reviewedBy).toBe('reviewer')
    // Sin revisor → pendiente de revisión
    const similar = assertions.find((a) => a.predicate === 'similar-to')
    expect(similar!.pendingReview).toBe(true)
  })

  it('resuelve soportes de protocolo por el grafo', async () => {
    const edges = await graph.edgesOf({ type: 'device', slug: 'sw-a' })
    expect(edges.some((e) => e.predicate === 'supports-protocol' && e.object.slug === 'ospf')).toBe(true)
  })

  it('busca fuente por slug', async () => {
    const src = await repo.sourceBySlug('ds-1')
    expect(src?.publisher).toBe('Acme')
  })
})