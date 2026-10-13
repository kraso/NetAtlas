import type { Core } from 'cytoscape'
import { Topology, type TopologiaAgregada } from '@netatlas/domain'
import { elementosDeTopologia, type TopologyElement } from './topology-model.js'
import { proyectarArista, proyectarNodo } from './topology-proyecciones.js'

/**
 * Modelo del visor (NET-HW-033/035/037): elementos de Cytoscape según el
 * modo de escala y exportación del canvas. Sin React, testeable puro.
 */

/** Modo de render derivado del número de nodos (ADR-03). */
export type ModoRender = 'svg' | 'agregado' | 'canvas'

/** Vista agregada: supernodos por categoría con conteo (modo escala). */
function elementosAgregados(agregada: TopologiaAgregada): TopologyElement[] {
  const nodos = agregada.nodos.map((n, i) => ({
    data: {
      id: n.id,
      label: n.tipo === 'grupo' ? `${n.categoria ?? 'grupo'} (${n.cantidad})` : n.id,
      tipo: n.tipo === 'grupo' ? 'category' : 'device',
      layer: n.capa,
      // El primer supernodo agrupa actúa como ancla (origen 0,0) del layout inicial.
      pos: i === 0 ? { x: 0, y: 0 } : undefined,
    },
  }))
  const aristas = agregada.aristas.map((e) => ({
    data: { id: `${e.from}→${e.to}`, source: e.from, target: e.to, label: String(e.cantidad) },
  }))
  return [...nodos, ...aristas]
}

/** Topología filtrada por capas con la ruta del flujo marcada (`enRuta`). */
function elementosFiltrados(topologia: Topology, activas: readonly number[], ruta: readonly string[]): TopologyElement[] {
  // El usuario puede pedir ver la topología completa incluso si es enorme;
  // por defecto usamos la vista agregada en los modos de escala.
  const filtrados =
    activas.length > 0 ? topologia.nodes.filter((n) => n.layerHint === undefined || activas.includes(n.layerHint)) : topologia.nodes
  const conEnRuta = new Set(ruta)
  const filtrada = Topology.create({
    slug: topologia.slug.value,
    name: topologia.name,
    kind: topologia.kind,
    nodes: filtrados.map(proyectarNodo),
    edges: topologia.edges.filter((e) => filtrados.some((n) => n.id === e.from) && filtrados.some((n) => n.id === e.to)).map(proyectarArista),
  })
  return elementosDeTopologia(filtrada).map((el) => ({
    data: { ...el.data, enRuta: conEnRuta.has(String(el.data.id)) },
  }))
}

/**
 * Elementos del visor: en escala, la vista agregada colapsa dispositivos en
 * supernodos por categoría; si no, la topología filtrada por capas con la
 * ruta del flujo de paquetes marcada (`enRuta`).
 */
export function construirElementosVisor(arg: {
  readonly topologia: Topology
  readonly activas: readonly number[]
  readonly ruta: readonly string[]
  readonly modo: ModoRender
  readonly agregada: TopologiaAgregada | undefined
  readonly modoAgregado: boolean
}): TopologyElement[] {
  const { topologia, activas, ruta, modo, agregada, modoAgregado } = arg
  if (modoAgregado && modo !== 'svg' && agregada) return elementosAgregados(agregada)
  return elementosFiltrados(topologia, activas, ruta)
}

function descargarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

/** Resultado de una exportación: si falla, lleva el motivo para la vista. */
export type ResultadoExportacion = { readonly ok: true } | { readonly ok: false; readonly motivo: string }

/** Exporta el canvas listo a SVG/PNG con nombre fechado (NET-HW-037). */
export function exportarDiagrama(cy: Core | undefined, slug: string, formato: 'svg' | 'png'): ResultadoExportacion {
  if (!cy) return { ok: false, motivo: 'el lienzo todavía no está listo' }
  try {
    const nombre = `${slug}-${new Date().toISOString().slice(0, 10)}.${formato}`
    if (formato === 'png') {
      const blob = cy.png({ output: 'blob', bg: '#0d1117', full: true }) as Blob
      descargarBlob(blob, nombre)
    } else {
      const svg = cy.svg({ scale: 1, full: true })
      descargarBlob(new Blob([svg], { type: 'image/svg+xml' }), nombre)
    }
    return { ok: true }
  } catch (err) {
    // Sin soporte del navegador (p. ej. jsdom): se registra Y se devuelve el
    // motivo, que la vista muestra al usuario (estándar de errores explícitos).
    console.error(`exportarDiagrama: no se pudo exportar ${formato} de ${slug}:`, err)
    return { ok: false, motivo: err instanceof Error ? err.message : String(err) }
  }
}

/** Etiqueta del botón cuando la vista agregada está activa (acción = volver a completa). */
export function resumenVistaAgregada(a: { nodosOriginales: number; nodos: readonly { tipo: string }[] }): string {
  const grupos = a.nodos.filter((n) => n.tipo === 'grupo').length
  const sueltos = a.nodos.length - grupos
  return `Vista completa (${a.nodosOriginales.toLocaleString('es')} nodos → ${grupos} grupo${grupos === 1 ? '' : 's'}${sueltos > 0 ? ` + ${sueltos} sueltos` : ''})`
}
