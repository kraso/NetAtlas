import { Datasheet } from '@netatlas/domain'
import type { Source } from '@netatlas/domain'

// ── Datasheets demo (F2-Documentación): reutilizan la fuente demo-datasheet ──

export function demoDatasheets(sources: readonly Source[]): Datasheet[] {
  const fuenteDemo = sources.find((s) => s.slug === 'demo-datasheet')
  if (!fuenteDemo) throw new Error('Falta la fuente demo-datasheet del dataset de demostración.')
  return [
    Datasheet.create({
      deviceSlug: 'fortinet-200f',
      title: 'FortiGate 200F Series Data Sheet',
      language: 'en',
      url: 'https://docs.fortinet.com/document/fortigate/7.6.2/hardware-acceleration/336140/fortigate-200f-and-201f-fast-path-architecture',
      // Copia local en el bundle (la misma que sirve la app en modo offline).
      localPath: 'assets/docs/FortiGate 200F Series Data Sheet.pdf',
      source: fuenteDemo,
    }),
    Datasheet.create({
      deviceSlug: 'cisco-c9300-48p',
      title: 'Cisco Catalyst 9300 Series — Hoja de datos',
      language: 'es',
      localPath: 'assets/docs/Catalyst 9300 Series Switches Data Sheet.pdf',
      source: fuenteDemo,
    }),
  ]
}
