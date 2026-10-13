import { validarCatalogos } from './lint-catalogos.js'
import { validarDispositivos } from './lint-dispositivos.js'
import { validarGenealogia } from './lint-grafo.js'
import { recursosLocalesDe, validarRecursosLocales } from './lint-recursos.js'
import type { LintIssue, LintReport, Push, SeedCatalogs } from './lint-tipos.js'

/**
 * data:lint — valida los invariantes del dataset seed (PLAN MAESTRO §7.5, §8.6, §19.5):
 * 1. Ninguna categoría huérfana (todas cuelgan del árbol).
 * 2. Ningún dispositivo sin categoría primaria existente.
 * 3. Fabricantes referenciados existen.
 * 4. Slugs únicos entre dispositivos.
 * 5. Estados de ciclo de vida canónicos.
 * 6. Fuentes referenciadas por assertions existen.
 * 7. Confianza de assertions canónica.
 * 8. Relaciones: predicado conocido y extremos referenciados.
 * 9. `replaced-by` ⇒ estado EoL+ en el sujeto.
 * 10. `evolves-into`/`succeeds` acíclicos.
 * 11. La fuente de una assertion es propia o compartida: ningún dispositivo
 *     cita el documento declarado por otro dispositivo (bug real: 42
 *     assertions de 18 dispositivos citaban el criterio editorial del hub 3Com
 *     para justificar protocolos que ese documento no cubre).
 * 12. Todo `localPath` vive dentro del bundle de la app y existe: la app solo
 *     sirve lo que hay en `apps/app/public/`.
 *
 * Cada grupo de reglas vive en su módulo: `lint-catalogos` (1),
 * `lint-dispositivos` (2-7, 11), `lint-grafo` (8-10) y `lint-recursos` (12).
 * Aquí solo se componen, en el orden histórico de los avisos.
 */

export { loadSeed } from './lint-seed.js'
export type { LintIssue, LintReport, SeedDevice } from './lint-tipos.js'

export function lintSeed(input: SeedCatalogs, publicDir?: string): LintReport {
  const issues: LintIssue[] = []
  const push: Push = (severity, rule, message) => {
    issues.push({ severity, rule, message })
  }

  validarCatalogos(input, push)
  validarDispositivos(input, push)

  // 12. Recursos locales: solo se sirven si están dentro del bundle de la app.
  for (const issue of validarRecursosLocales(recursosLocalesDe(input.devices), publicDir)) {
    push('error', issue.rule, issue.message)
  }

  // 10. Aciclicidad de genealogía (evolves-into, succeeds, replaced-by)
  validarGenealogia(input.devices, push)

  return { issues, ok: issues.every((i) => i.severity === 'warning') }
}
