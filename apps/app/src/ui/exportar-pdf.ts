/**
 * Exportación PDF del reporte de comparación (F5, NET-HW-042 — deuda resuelta).
 *
 * `construirContenidoPdf` es PURO (fila de líneas con sangría y estilo) y se
 * prueba sin jsPDF; `generarPdfComparacion` lo renderiza con jsPDF y descarga
 * el archivo `netatlas-comparacion-YYYY-MM-DD.pdf`.
 *
 * jsPDF se importa dinámicamente dentro del render: el chunk de jsPDF solo se
 * descarga al exportar (no infla el arranque de la PWA).
 */
import type { ComparisonReport } from '@netatlas/domain'

export interface LineaPdf {
  readonly texto: string
  readonly sangria: number
  readonly negrita: boolean
  readonly tamano: number
}

/** Construye el contenido del PDF como líneas planas (puro y testeable). */
export function construirContenidoPdf(report: ComparisonReport, fecha: string): readonly LineaPdf[] {
  const lineas: LineaPdf[] = []
  const push = (texto: string, sangria = 0, negrita = false, tamano = 10): void => {
    lineas.push({ texto, sangria, negrita, tamano })
  }

  push('NetAtlas — Comparación de dispositivos', 0, true, 16)
  push(`Generado el ${fecha}`, 0, false, 9)
  push('')
  push(
    `Dispositivos: ${report.devices.map((d) => `${d.name} (${d.slug})`).join(' · ')}`,
    0,
    false,
    9,
  )
  if (report.transversal) {
    push('')
    push(
      `Comparación transversal entre categorías: solo filas comunes comparadas; ${report.atributosEspecificos} atributo(s) específico(s) fuera de la tabla.`,
      0,
      false,
      8,
    )
  }
  push('')

  // Tabla de atributos (todas las filas; el PDF no filtra por "solo diferencias").
  for (const fila of report.rows) {
    const titulo = `${fila.labelEs}${fila.unit ? ` (${fila.unit})` : ''}${fila.common ? '' : ' *'}`.trim()
    push(titulo, 0, true, 10)
    for (const v of fila.values) {
      const mejor = v.isBest ? ' ▲' : ''
      const perdida = v.lossReason ? ' ▼' : ''
      push(`  ${v.deviceSlug}: ${v.display}${mejor}${perdida}`, 1, false, 9)
    }
  }

  if (report.compatibilidades.length > 0) {
    push('')
    push('Compatibilidad entre candidatos', 0, true, 11)
    for (const c of report.compatibilidades) {
      push(`  ${c.a} ↔ ${c.b}: ${c.note ?? (c.compatible ? 'compatibles' : 'incompatibles')}`, 1, false, 9)
    }
  }

  push('')
  push('Veredicto', 0, true, 11)
  for (const v of report.veredicto) {
    push(`  • ${v}`, 1, false, 9)
  }
  push('')
  push('Síntesis determinista por plantilla (sin IA ni puntuación global): la ponderación la decide el usuario.', 0, false, 8)

  return lineas
}

export interface OpcionesPdf {
  readonly nombreArchivo?: string
  readonly fecha?: string
}

/** Render con jsPDF (import dinámico) y descarga del archivo. */
export async function generarPdfComparacion(
  report: ComparisonReport,
  opts?: OpcionesPdf,
): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const fecha = opts?.fecha ?? new Date().toISOString().slice(0, 10)
  const lineas = construirContenidoPdf(report, fecha)

  // A4 portrait en mm.
  const ancho = 210
  const margen = 14
  const anchoUtil = ancho - margen * 2
  const altoPagina = 297
  const pie = 20
  let y = 18

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  for (const l of lineas) {
    // Salto de página: reserva 4 mm de respiro + pie.
    if (y > altoPagina - pie) {
      doc.addPage()
      y = 18
    }
    if (l.texto === '') {
      y += 4
      continue
    }
    const fuente = l.negrita ? 'helvetica' : 'helvetica'
    const estilo = l.negrita ? 'bold' : 'normal'
    doc.setFont(fuente, estilo)
    doc.setFontSize(l.tamano)
    const x = margen + l.sangria * 3
    const restante = anchoUtil - l.sangria * 3
    const trozos = doc.splitTextToSize(l.texto, restante) as string[]
    for (const trozo of trozos) {
      if (y > altoPagina - pie) {
        doc.addPage()
        y = 18
      }
      doc.text(trozo, x, y)
      y += Math.max(l.tamano / 2.85, 4.2)
    }
  }

  const nombre = opts?.nombreArchivo ?? `netatlas-comparacion-${fecha}.pdf`
  doc.save(nombre)
}