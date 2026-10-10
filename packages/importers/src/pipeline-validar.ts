import type { RawRecord } from './raw-record.js'
import { isLifecycleStatus, isConfidence, findPredicate } from '@netatlas/domain'
import type { ImportDeps, ValidationIssue } from './pipeline-tipos.js'

/**
 * ETAPA 3 del pipeline de importación (§19.2): validación de esquema,
 * estados, catálogos cerrados e invariantes por registro.
 */

/** Un registro con cada regla violada; el resto sigue procesándose. */
interface ValidacionRegistro {
  readonly ok: boolean
  readonly issues: readonly ValidationIssue[]
}

/** ETAPA 3 — valida: esquema, estados, catálogos cerrados, invariantes. */
export function validar(records: readonly RawRecord[], deps: ImportDeps): { validos: RawRecord[]; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = []
  const validos: RawRecord[] = []
  records.forEach((r, idx) => {
    const res = validarRegistro(r, idx, deps)
    issues.push(...res.issues)
    if (res.ok) validos.push(r)
  })
  return { validos, issues }
}

/** Todas las reglas aplicadas a un registro. */
function validarRegistro(r: RawRecord, idx: number, deps: ImportDeps): ValidacionRegistro {
  const issues: ValidationIssue[] = []
  const push = (rule: string, message: string): void => { issues.push({ recordIndex: idx, rule, message }) }
  let ok = true

  const marcar = (rule: string, message: string): void => {
    push(rule, message)
    ok = false
  }

  if (!validarIdentidad(r, marcar)) ok = false
  if (!validarLifecycle(r, marcar)) ok = false
  if (!validarRelaciones(r, deps, marcar)) ok = false
  if (!validarAssertions(r, deps, marcar)) ok = false

  return { ok, issues }
}

/** Reglas de identidad: slug presente y en formato kebab-case. */
function validarIdentidad(r: RawRecord, marcar: (rule: string, message: string) => void): boolean {
  const d = r.device
  if (!d.slug || d.slug.trim() === '') {
    marcar('slug', 'Slug vacío.')
    return false
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.slug)) {
    marcar('slug', `Slug inválido: "${d.slug}".`)
    return false
  }
  return true
}

/** Reglas de estado de ciclo de vida y código de categoría. */
function validarLifecycle(r: RawRecord, marcar: (rule: string, message: string) => void): boolean {
  const d = r.device
  let ok = true
  if (!isLifecycleStatus(d.lifecycleStatus)) {
    marcar('lifecycle', `Estado de ciclo de vida inválido: "${d.lifecycleStatus}".`)
    ok = false
  }
  if (d.categoryCode && !/^CAT-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(d.categoryCode)) {
    marcar('category', `Código de categoría inválido: "${d.categoryCode}".`)
    ok = false
  }
  return ok
}

/** Reglas de relaciones: predicado conocido y extremos en catálogos cerrados. */
function validarRelaciones(r: RawRecord, deps: ImportDeps, marcar: (rule: string, message: string) => void): boolean {
  let ok = true
  for (const rel of r.device.relationships ?? []) {
    const spec = findPredicate(rel.predicate)
    if (!spec) {
      marcar('predicate', `Predicado desconocido: "${rel.predicate}".`)
      ok = false
    } else if (rel.objectType === 'protocol' && deps.knownProtocols && !deps.knownProtocols.has(rel.objectSlug)) {
      marcar('closed-catalog', `Protocolo inexistente en catálogo: "${rel.objectSlug}".`)
      ok = false
    } else if (rel.objectType === 'medium' && deps.knownMedia && !deps.knownMedia.has(rel.objectSlug)) {
      marcar('closed-catalog', `Medio inexistente en catálogo: "${rel.objectSlug}".`)
      ok = false
    }
  }
  return ok
}

/** Reglas de assertions: confianza válida, fuente presente y catálogo cerrado. */
function validarAssertions(r: RawRecord, deps: ImportDeps, marcar: (rule: string, message: string) => void): boolean {
  let ok = true
  for (const a of r.device.assertions ?? []) {
    if (a.confidence !== undefined && !isConfidence(a.confidence)) {
      marcar('assertion-confidence', `Confianza inválida: "${a.confidence}".`)
      ok = false
    }
    if (a.sourceSlug.trim() === '') {
      marcar('assertion-source', 'Assertion sin fuente.')
      ok = false
    }
    if (a.predicate === 'supports-protocol' && typeof a.value === 'string' && deps.knownProtocols && !deps.knownProtocols.has(a.value)) {
      marcar('closed-catalog', `Protocolo de assertion inexistente: "${a.value}".`)
      ok = false
    }
  }
  return ok
}