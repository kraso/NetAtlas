import { describe, expect, it, beforeAll } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { composeRuntime, disposeRuntime, CatalogDao, NodeSqliteDriver, SqliteGraphRepository, applyMigrations, loadMigrations } from '../src/index.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RuntimeContext } from '../src/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = resolve(here, '..', 'migrations')

describe('SqliteGraphRepository', () => {
  let ctx: RuntimeContext
  let tmp: string

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'netatlas-graph-'))
    const driver = new NodeSqliteDriver(':memory:')
    applyMigrations(driver, loadMigrations(migrationsDir))
    const dao = new CatalogDao(driver)

    dao.upsertManufacturer({ slug: 'cisco', name: 'Cisco Systems' })
    dao.upsertCategory({ code: 'CAT-SWT', nameEs: 'Interconexión y switching', aliases: ['switch'] })
    dao.upsertCategory({ code: 'CAT-SWT-L2', parentCode: 'CAT-SWT', nameEs: 'Switches capa 2', aliases: ['sw-l2'] })
    dao.upsertDevice({ slug: 'cat-2960', name: 'Catalyst 2960', manufacturerSlug: 'cisco', categoryCode: 'CAT-SWT-L2', lifecycleStatus: 'eol' })
    dao.upsertDevice({ slug: 'cat-2960x', name: 'Catalyst 2960-X', manufacturerSlug: 'cisco', categoryCode: 'CAT-SWT-L2', lifecycleStatus: 'mature' })
    dao.upsertDevice({ slug: 'cat-9300', name: 'Catalyst 9300', manufacturerSlug: 'cisco', categoryCode: 'CAT-SWT-L2', lifecycleStatus: 'current' })

    dao.seedPredicates([
      { code: 'manufactured-by', domain: ['device'], range: ['manufacturer'], cardinality: 'one' },
      { code: 'has-category', domain: ['device'], range: ['category'], cardinality: 'one' },
      { code: 'succeeds', domain: ['device'], range: ['device'], acyclic: true, inverse: 'precedes' },
      { code: 'precedes', domain: ['device'], range: ['device'], acyclic: true, inverse: 'succeeds' },
      { code: 'similar-to', domain: ['device'], range: ['device'], symmetric: true },
    ] as never)

    const rel = (from: string, pred: string, to: string) =>
      dao.addRelationship({
        subjectType: 'device',
        subjectId: dao.deviceId(from)!,
        predicate: pred,
        objectType: 'device',
        objectId: dao.deviceId(to)!,
      })

    // Cadena: cat-2960 →(succeeds)→ cat-2960x →(succeeds)→ cat-9300
    rel('cat-2960', 'succeeds', 'cat-2960x')
    rel('cat-2960x', 'succeeds', 'cat-9300')
    // Simetría: 2960x similar-to 9300 (almacenada una vez)
    rel('cat-2960x', 'similar-to', 'cat-9300')

    ctx = composeRuntime({ migrationsDir, path: ':memory:', driver, applyMigrationsFirst: false })
    return () => {
      disposeRuntime(ctx)
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('edgesOf devuelve aristas de salida y simétricas', async () => {
    const edges = await ctx.repositories.graph.edgesOf({ type: 'device', slug: 'cat-2960x' })
    const preds = edges.map((e) => e.predicate).sort()
    expect(preds).toContain('succeeds') // → cat-9300
    expect(preds).toContain('precedes') // ← cat-2960 (inverso, por simetría de consulta)
    expect(preds).toContain('similar-to') // → cat-9300 (simétrica)
  })

  it('neighbors con profundidad 1 y 2', async () => {
    const n1 = await ctx.repositories.graph.neighbors({ node: { type: 'device', slug: 'cat-2960' }, maxDepth: 1 })
    expect(n1.length).toBeGreaterThanOrEqual(1)
    const slugs = new Set<string>()
    for (const e of n1) {
      slugs.add(e.subject.slug)
      slugs.add(e.object.slug)
    }
    expect(slugs).toContain('cat-2960x')
  })

  it('paths encuentra la cadena de sucesión', async () => {
    const paths = await ctx.repositories.graph.paths(
      { type: 'device', slug: 'cat-2960' },
      { type: 'device', slug: 'cat-9300' },
      2,
    )
    expect(paths.length).toBeGreaterThan(0)
    const via2960x = paths.find((p) => p.nodes.some((n) => n.slug === 'cat-2960x'))
    expect(via2960x).toBeDefined()
    expect(paths[0]!.edges[0]!.predicate).toBe('succeeds')
  })

  it('paths respeta maxDepth (sin camino a 0 saltos)', async () => {
    const paths = await ctx.repositories.graph.paths(
      { type: 'device', slug: 'cat-2960' },
      { type: 'device', slug: 'cat-9300' },
      0,
    )
    expect(paths).toHaveLength(0)
  })

  it('vecindadCte alcanza a profundidad 2 (NET-HW-029)', async () => {
    // cat-2960 →(succeeds)→ cat-2960x →(succeeds)→ cat-9300
    const graph = ctx.repositories.graph as SqliteGraphRepository
    const ids = await graph.vecindadCte({ type: 'device', slug: 'cat-2960' }, 2)
    const slugs = ids.map((id) => graph['slugById']('device', id))
    expect(slugs).toContain('cat-2960')
    expect(slugs).toContain('cat-2960x')
    expect(slugs).toContain('cat-9300')
  })

  it('vecindadCte respeta la profundidad máxima', async () => {
    const graph = ctx.repositories.graph as SqliteGraphRepository
    const ids1 = await graph.vecindadCte({ type: 'device', slug: 'cat-2960' }, 1)
    const slugs1 = ids1.map((id) => graph['slugById']('device', id))
    expect(slugs1).toContain('cat-2960x')
    // cat-9300 solo es alcanzable en el segundo salto
    expect(slugs1).not.toContain('cat-9300')
    const ids2 = await graph.vecindadCte({ type: 'device', slug: 'cat-2960' }, 2)
    const slugs2 = ids2.map((id) => graph['slugById']('device', id))
    expect(slugs2).toContain('cat-9300')
  })

  it('vecindadCte filtra por predicado', async () => {
    const graph = ctx.repositories.graph as SqliteGraphRepository
    const ids = await graph.vecindadCte({ type: 'device', slug: 'cat-2960' }, 2, ['succeeds'])
    const slugs = ids.map((id) => graph['slugById']('device', id))
    expect(slugs).toContain('cat-2960x')
    expect(slugs).toContain('cat-9300')
  })
})