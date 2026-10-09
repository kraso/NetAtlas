import React from 'react'
import { Link } from 'react-router-dom'
import { ConfidenceBadge } from '@netatlas/ui'
import { Empty, datoGbps, esFichaEstructural, urlDeBundle } from './device-sheet-piezas.js'
import type { DatosPestana } from './device-sheet-hooks.js'

type Imagen = import('@netatlas/domain').DeviceImage
type Puerto = import('@netatlas/domain').Device['ports'][number]

/** Foto principal (primera imagen frontal) del dispositivo. */
function FotoProducto({ imagen, nombre }: { imagen: Imagen; nombre: string }): React.JSX.Element {
  return (
    <figure className="foto-producto">
      <img src={imagen.url ?? urlDeBundle(imagen.localPath ?? '')} alt={`Foto de ${nombre}`} loading="lazy" />
      <figcaption className="guia-tecnica">
        {imagen.caption ?? nombre} — {imagen.source.title}
      </figcaption>
    </figure>
  )
}

/** Fila SNMP sysObjectID: solo si la assertion existe y su JSON es legible. */
function FilaSnmpSysObjectId({ assertion }: { assertion: import('@netatlas/domain').Assertion }): React.JSX.Element | null {
  let valor = ''
  try {
    valor = String(JSON.parse(assertion.valueJson))
  } catch {
    return null
  }
  return (
    <tr>
      <th scope="row">SNMP (sysObjectID)</th>
      <td className="mono">
        {valor} <ConfidenceBadge confidence={assertion.confidence} size="sm" />{' '}
        <Link to="/glosario/sysobjectid" className="guia-tecnica">(qué es)</Link>
      </td>
    </tr>
  )
}

/** Aviso de ficha estructural (dispositivo de referencia generado, no curado). */
function AvisoEstructural(): React.JSX.Element {
  return (
    <p role="note" className="guia-tecnica" data-testid="ficha-estructural">
      Ficha estructural: dispositivo de referencia generado por importación asistida —
      especificaciones pendientes de datasheet (F2).{' '}
      <ConfidenceBadge confidence="third-party" size="sm" />
    </p>
  )
}

export function TabResumen({ datos }: { datos: DatosPestana }): React.JSX.Element {
  const { device, imagenes, assertionDe } = datos
  const frontal = imagenes.filter((g) => g.kind === 'frontal').slice(0, 1)
  const throughput = assertionDe('throughput_gbps')
  return (
    <div className="stack">
      {frontal.map((g) => (
        <FotoProducto key={g.localPath ?? g.url ?? g.caption ?? 'foto'} imagen={g} nombre={device.name} />
      ))}
      {esFichaEstructural(device.summary) ? <AvisoEstructural /> : null}
      <p>{device.summary ?? 'Sin resumen curado.'}</p>
      <p>
        Ciclo de vida: <span className="mono">{device.lifecycleStatus}</span>{' '}
        {throughput ? (
          <>
            {' '}
            · Throughput: <span className="mono">{datoGbps(throughput)} Gbps</span>{' '}
            <ConfidenceBadge confidence={throughput.confidence} size="sm" />
          </>
        ) : null}
      </p>
    </div>
  )
}

export function TabEspecificaciones({ datos }: { datos: DatosPestana }): React.JSX.Element {
  const { device, fabricante, assertionDe } = datos
  const oid = assertionDe('snmp_sysobjectid')
  return (
    <table className="tabla-specs">
      <tbody>
        <tr><th scope="row">Modelo / SKU</th><td className="mono">{device.model ?? '—'} {device.sku ? `(${device.sku})` : ''}</td></tr>
        <tr><th scope="row">Fabricante</th><td>{device.manufacturerSlug}</td></tr>
        <tr><th scope="row">Capa principal</th><td className="mono">{device.osiProfile?.profile.primary ?? '—'}</td></tr>
        <tr><th scope="row">Puertos totales</th><td className="mono">{device.portCount()}</td></tr>
        <tr><th scope="row">Presentación</th><td className="mono">{device.releasedOn ?? '—'}</td></tr>
        <tr><th scope="row">Fecha EoL / EoS</th><td className="mono">{device.eolOn ?? '—'} / {device.eosOn ?? '—'}</td></tr>
        {oid ? <FilaSnmpSysObjectId assertion={oid} /> : null}
        {fabricante?.snmpEnterprise ? (
          <tr>
            <th scope="row">SNMP (empresa)</th>
            <td className="mono">
              1.3.6.1.4.1.{fabricante.snmpEnterprise}{' '}
              <Link to="/glosario/snmp" className="guia-tecnica">(qué es)</Link>
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  )
}

/** Velocidades de un puerto en texto corto (1G / 10G / 100M). */
function velocidades(speeds: readonly number[]): string {
  return speeds.map((s) => (s >= 1000 ? `${s / 1000}G` : `${s}M`)).join(' / ')
}

function FilaPuerto({ puerto }: { puerto: Puerto }): React.JSX.Element {
  return (
    <tr>
      <td>{puerto.label}</td>
      <td className="mono">{puerto.interfaceCode}</td>
      <td className="mono">{puerto.quantity}</td>
      <td className="mono">{velocidades(puerto.speedsMbps)}</td>
      <td className="mono">{puerto.poeStandard ?? '—'}</td>
    </tr>
  )
}

export function TabInterfaces({ datos }: { datos: DatosPestana }): React.JSX.Element {
  const { device } = datos
  if (device.ports.length === 0) return <Empty message="Sin inventario de puertos curado." />
  return (
    <table className="tabla-specs">
      <thead>
        <tr>
          <th scope="col">Etiqueta</th>
          <th scope="col">Interfaz</th>
          <th scope="col">Cantidad</th>
          <th scope="col">Velocidades</th>
          <th scope="col">PoE</th>
        </tr>
      </thead>
      <tbody>
        {device.ports.map((p) => (
          <FilaPuerto key={p.label} puerto={p} />
        ))}
      </tbody>
    </table>
  )
}
