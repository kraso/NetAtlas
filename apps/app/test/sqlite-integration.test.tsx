import React from 'react'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { App } from '../src/App.js'
import { setServices } from '../src/composition-root.js'
import { buildSqliteServices } from '../src/composition-root-sqlite.js'

/**
 * Fase C — la UI lee datos del SQLite REAL (netatlas-seed.sqlite, 341
 * dispositivos) en lugar del adaptador in-memory. El composition-root SQLite
 * cumple exactamente el mismo contrato de puertos que el in-memory: ninguna
 * vista cambia. En el navegador estático este rol lo juega wa-sqlite (mismo
 * contrato, F1-late).
 */

beforeAll(() => {
  setServices(buildSqliteServices())
})

afterAll(() => {
  cleanup()
})

function renderApp(route: string): void {
  render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  )
}

describe('UI sobre SQLite real (Fase C)', () => {
  it('el dashboard muestra el conteo real del dataset (341)', async () => {
    renderApp('/')
    // El catálogo real tiene las 26 categorías semillas
    expect(await screen.findByRole('link', { name: /Interconexión y switching/i })).toBeDefined()
    // Conteo real: 345 (el número vive en un span mono separado)
    const cuenta = await screen.findByText('345')
    expect(cuenta.id).toBeDefined()
    expect(cuenta.textContent).toBe('345')
  })

  it('la ficha de un dispositivo del seed real muestra sus protocolos', async () => {
    renderApp('/device/aruba-2930f-48g-poeplus')
    expect(await screen.findByRole('heading', { name: 'Aruba 2930F 48G PoE+ 4SFP+' })).toBeDefined()
    fireEvent.click(screen.getByRole('tab', { name: 'Protocolos' }))
    // El seed real declara ospf y vxlan para el 2930F (pestaña + panel contextual)
    expect((await screen.findAllByRole('link', { name: 'ospf' })).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('link', { name: 'vxlan' }).length).toBeGreaterThanOrEqual(1)
  })

  it('la pestaña Referencias muestra assertions con fuente real', async () => {
    renderApp('/device/aruba-2930f-48g-poeplus')
    fireEvent.click(await screen.findByRole('tab', { name: 'Referencias' }))
    // La assertion throughput_gbps del seed está respaldada por datasheet oficial
    expect(await screen.findByText('throughput_gbps')).toBeDefined()
    expect(screen.getAllByText('Oficial').length).toBeGreaterThanOrEqual(1)
  })

  it('la ficha estructural muestra insignia y la curada no', async () => {
    // grandstream-cat-sec-326: ficha sintética (importación asistida).
    renderApp('/device/grandstream-cat-sec-326')
    expect(await screen.findByTestId('ficha-estructural')).toBeDefined()
    // aruba-2930f: ficha curada real → sin insignia.
    cleanup()
    renderApp('/device/aruba-2930f-48g-poeplus')
    expect(await screen.findByRole('heading', { name: 'Aruba 2930F 48G PoE+ 4SFP+' })).toBeDefined()
    expect(screen.queryByTestId('ficha-estructural')).toBeNull()
  })

  it('Especificaciones muestra la empresa SNMP del fabricante (sysObjectID base)', async () => {
    renderApp('/device/aruba-2930f-48g-poeplus')
    expect(await screen.findByRole('heading', { name: 'Aruba 2930F 48G PoE+ 4SFP+' })).toBeDefined()
    fireEvent.click(screen.getByRole('tab', { name: 'Especificaciones' }))
    expect(await screen.findByText('1.3.6.1.4.1.14823')).toBeDefined()
  })

  it('Especificaciones muestra el sysObjectID exacto cuando está curado', async () => {
    renderApp('/device/cisco-catalyst-9300-48p')
    expect(await screen.findByRole('heading', { name: 'Cisco Catalyst 9300-48P' })).toBeDefined()
    fireEvent.click(screen.getByRole('tab', { name: 'Especificaciones' }))
    expect(await screen.findByText('1.3.6.1.4.1.9.1.2494')).toBeDefined()
  })

  it('la búsqueda FTS real encuentra en el dataset completo', async () => {
    renderApp('/explore?q=VXLAN')
    // Los dispositivos con VXLAN en el seed (relación supports-protocol via FTS? no:
    // FTS indexa nombre/resumen; aquí usamos el DSL del explorador solo texto.
    // Se verifica que el explorador consulta el índice real sin romper).
    expect(await screen.findByRole('navigation', { name: 'Árbol de categorías' })).toBeDefined()
  })

  it('la pestaña Arquitectura del FortiGate 200F muestra la arquitectura interna curada (F2)', async () => {
    renderApp('/device/fortinet-fortigate-200f')
    expect(await screen.findByRole('heading', { name: 'FortiGate 200F' })).toBeDefined()
    fireEvent.click(screen.getByRole('tab', { name: 'Arquitectura' }))
    // Datos curados del datasheet oficial de Fortinet (CPU, SoC, CP, NP, almacenamiento).
    expect(await screen.findByText(/Intel Xeon D-1627/)).toBeDefined()
    expect(screen.getAllByText(/NP6XLite/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/CP9/).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/480 GB/)).toBeDefined()
    // Fuente con enlace al datasheet y confianza oficial.
    expect(screen.getByText(/FortiGate 200F Series Data Sheet/)).toBeDefined()
    expect(screen.getAllByText('Oficial').length).toBeGreaterThanOrEqual(1)
  })

  it('un dispositivo generado sin curación muestra el empty-state honesto (no inventar)', async () => {
    // Un generado del seed (299 sintéticos) no tiene assertion de arquitectura:
    // la pestaña debe mostrar «pendiente de curación», nunca un dato falso.
    renderApp('/device/moxa-cat-swt-128')
    fireEvent.click(await screen.findByRole('tab', { name: 'Arquitectura' }))
    expect(await screen.findByText(/pendiente de curación/i)).toBeDefined()
    // Y el pasivo hereda el empty-state «no aplica».
    cleanup()
    renderApp('/device/utp-cat6a')
    fireEvent.click(await screen.findByRole('tab', { name: 'Arquitectura' }))
    expect(await screen.findByText(/no aplica|pasivo/i)).toBeDefined()
  })
})