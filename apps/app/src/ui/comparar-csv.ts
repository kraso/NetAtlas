import type { ComparisonReport } from '@netatlas/domain'

/** Celda CSV: se entrecomilla si trae separador, comillas o salto; comillas dobladas. */
function celdaCsv(c: string): string {
  const requiereComillas = c.includes(';') || c.includes('"') || c.includes('\n') || c.includes('\r')
  return requiereComillas ? `"${c.replace(/"/g, '""')}"` : c
}

/** Exporta el reporte a CSV descargable (NET-HW-042, separador «;», BOM UTF-8). */
export function exportarComparacionCsv(report: ComparisonReport): void {
  const filas = report.rows.flatMap((r) => r.values.map((v) => [r.labelEs, v.deviceSlug, v.display, r.unit ?? '']))
  const csv = [
    ['Atributo', 'Dispositivo', 'Valor', 'Unidad'].join(';'),
    ...filas.map((f) => f.map(celdaCsv).join(';')),
  ].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `netatlas-comparacion-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
