import { Assertion, Source } from '@netatlas/domain'
import type { Confidence, Device } from '@netatlas/domain'

// ── Fuentes y assertions del dataset de demostración (trazabilidad de la ficha) ─

export type CreadorAssertion = (
  slug: string,
  predicate: string,
  value: unknown,
  sourceSlug: string,
  confidence: Confidence,
) => Assertion

export function demoSources(): Source[] {
  return [
    // Datasheet de demostración: la assertion de arquitectura del 200F cita la
    // doc oficial de Fortinet (misma fuente que el seed SQLite).
    Source.create({ slug: 'demo-datasheet', kind: 'datasheet', publisher: 'Fortinet', title: 'FortiGate 200F Series Data Sheet + Hardware acceleration (FortiOS 7.6.2)', url: 'https://docs.fortinet.com/document/fortigate/7.6.2/hardware-acceleration/336140/fortigate-200f-and-201f-fast-path-architecture', authorityLevel: 1 }),
    Source.create({ slug: 'demo-editorial', kind: 'editorial', publisher: 'NetAtlas demo', title: 'Criterio de demostración', authorityLevel: 4 }),
  ]
}

/** Fábrica de assertions: resuelve el subjectId (índice+1) y la fuente por slug. */
export function creadorAssertions(devices: readonly Device[], sources: readonly Source[]): CreadorAssertion {
  const index = new Map(devices.map((d, i) => [d.slug.value, i]))
  return (slug, predicate, value, sourceSlug, confidence) => {
    const pos = index.get(slug)
    if (pos === undefined) throw new Error(`Assertion de demo sin dispositivo: ${slug}`)
    const source = sources.find((s) => s.slug === sourceSlug)
    if (!source) throw new Error(`Assertion de demo sin fuente: ${sourceSlug}`)
    return Assertion.create({
      subjectType: 'device',
      subjectId: pos + 1, // 1-based (indexOf del repositorio)
      predicate,
      valueJson: JSON.stringify(value),
      source,
      confidence,
      verifiedOn: '2025-02-10',
      author: 'curator-demo',
      reviewedBy: 'reviewer-demo',
    })
  }
}

/** Cifras básicas de la ficha (throughput y consumo). */
function assertionsBasicas(crear: CreadorAssertion): Assertion[] {
  return [
    crear('cisco-c9300-48p', 'throughput_gbps', 256, 'demo-datasheet', 'official'),
    crear('cisco-c9300-48p', 'power_consumption_w', 220, 'demo-datasheet', 'official'),
    crear('aruba-2930f-48g', 'throughput_gbps', 176, 'demo-datasheet', 'official'),
    crear('mikrotik-ccr1036', 'routing_throughput_mbps', 10000, 'demo-editorial', 'third-party'),
    crear('fortinet-200f', 'firewall_throughput_gbps', 18, 'demo-editorial', 'third-party'),
  ]
}

function arquitecturaFortiGate(crear: CreadorAssertion): Assertion {
  return crear(
    'fortinet-200f',
    'internal-architecture',
    {
      cpu: 'Intel Xeon D-1627 (8 núcleos @ 2.90 GHz)',
      soc: { family: 'SoC4', note: 'SoC4 integra CPU propia y CP9XLite que no se usan en este modelo' },
      contentProcessors: ['CP9', 'CP9'],
      networkProcessors: ['NP6XLite'],
      storage: { type: 'SSD', capacityGB: 480 },
      summary:
        'CPU x86 separada + dos procesadores de contenido CP9 + un procesador de red NP6XLite (SoC4); todo el tráfico entre interfaces de datos puede ser descargado por el NP6XLite.',
    },
    'demo-datasheet',
    'official',
  )
}

function arquitecturaC9300(crear: CreadorAssertion): Assertion {
  return crear(
    'cisco-c9300-48p',
    'internal-architecture',
    {
      cpu: 'CPU multi-núcleo del plano de control Catalyst 9000',
      soc: { family: 'ASIC UADP 2.0', note: 'Plano de datos a wire-rate en el ASIC UADP 2.0 + StackWise' },
      networkProcessors: ['UADP 2.0 ASIC'],
      summary: 'Arquitectura Catalyst 9000: ASIC UADP 2.0 para el reenvío a wire-rate y CPU multinúcleo para el plano de control y gestión.',
    },
    'demo-datasheet',
    'official',
  )
}

function arquitectura2930F(crear: CreadorAssertion): Assertion {
  return crear(
    'aruba-2930f-48g',
    'internal-architecture',
    {
      cpu: 'CPU de gestión de la plataforma ArubaOS-Switch',
      soc: { family: 'SoC de conmutación Aruba 2930F', note: 'Plano de datos a wire-rate en el switch SoC' },
      summary: 'Switch de acceso ArubaOS-Switch: plano de datos a wire-rate en el SoC de conmutación y CPU de gestión para el plano de control L2/L3-Lite.',
    },
    'demo-datasheet',
    'official',
  )
}

function arquitectura6300M(crear: CreadorAssertion): Assertion {
  return crear(
    'aruba-6300m-48g',
    'internal-architecture',
    {
      cpu: 'CPU de gestión de la plataforma ArubaOS-CX',
      soc: { family: 'SoC de conmutación Aruba 6300 (ASIC + CPU)', note: 'Uplinks SFP56 50G y stacking VSF' },
      summary: 'Switch de acceso/apilado ArubaOS-CX: plano de datos a wire-rate en el ASIC con uplinks 50G y CPU de gestión para el plano de control L2/L3.',
    },
    'demo-datasheet',
    'official',
  )
}

function arquitecturaMikrotik(crear: CreadorAssertion): Assertion {
  return crear(
    'mikrotik-ccr1036',
    'internal-architecture',
    {
      cpu: '36 núcleos (Tillera/TILE-Gx) @ 1.2 GHz',
      ram: '8 GB',
      storage: { type: 'Flash', capacityGB: 0.512 },
      soc: { family: 'Tile-Gx (36 núcleos)', note: 'CCR1036 usa el procesador many-core TILE-Gx36' },
      summary: 'Router many-core: el TILE-Gx36 con 36 núcleos reparte el procesamiento de paquetes (RouterOS) a alta velocidad; 8 GB de RAM y flash de 512 MB.',
    },
    'demo-editorial',
    'third-party',
  )
}

function arquitecturaC9120(crear: CreadorAssertion): Assertion {
  return crear(
    'cisco-9120axi',
    'internal-architecture',
    {
      cpu: 'CPU de plataforma Wi-Fi 6 (ARM)',
      soc: { family: 'SoC Wi-Fi 6 (802.11ax) 4x4:4', note: 'AP Catalyst 9120 con radio Wi-Fi 6 4x4:4 y 8 radios de escaneo' },
      summary: 'Punto de acceso Wi-Fi 6 4x4:4: el SoC integra las radios 802.11ax (2.4/5 GHz) y los servicios (RLDP, CleanAir); la electrónica concreta no se publica.',
    },
    'demo-datasheet',
    'official',
  )
}

/** Assertions del demo, en el orden en que las consume la ficha. */
export function demoAssertions(devices: readonly Device[], sources: readonly Source[]): Assertion[] {
  const crear = creadorAssertions(devices, sources)
  return [
    ...assertionsBasicas(crear),
    arquitecturaFortiGate(crear),
    arquitecturaC9300(crear),
    arquitectura2930F(crear),
    arquitectura6300M(crear),
    arquitecturaMikrotik(crear),
    arquitecturaC9120(crear),
  ]
}
