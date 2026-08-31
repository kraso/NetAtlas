import React from 'react'
import { Link, useParams } from 'react-router-dom'

/**
 * Glosario técnico (NET-HW-024 / §10.6).
 * Términos canónicos con definición; cada término tiene slug para enlaces
 * inline desde las fichas (`/glosario/:slug`).
 * Base curada inicial (F2); el catálogo completo llega con la curación F2/F6.
 */

export interface TerminoGlosario {
  readonly slug: string
  readonly term: string
  readonly definition: string
}

const TERMINOS: readonly TerminoGlosario[] = [
  { slug: 'conmutador', term: 'Conmutador (switch)', definition: 'Dispositivo de capa 2 (y opcionalmente 3) que reenvía tramas según la dirección MAC de destino, segmentando los dominios de colisión del Ethernet conmutado.' },
  { slug: 'dominio-de-colision', term: 'Dominio de colisión', definition: 'Segmento de red donde las colisiones de tramas pueden ocurrir; los switches lo segmentan por puerto (a diferencia de los hubs, que lo comparten).' },
  { slug: 'vlan', term: 'VLAN (802.1Q)', definition: 'Segmentación lógica de una red de capa 2 mediante etiquetas de la norma IEEE 802.1Q, independiente de la topología física.' },
  { slug: 'poe', term: 'Power over Ethernet', definition: 'Entrega de energía eléctrica junto con datos sobre el cable de red; clasificado en IEEE 802.3af (15,4 W), 802.3at (30 W) y 802.3bt (60–90 W).' },
  { slug: 'transceiver', term: 'Transceptor óptico', definition: 'Módulo que convierte señales eléctricas en ópticas y viceversa (SFP, SFP+, QSFP…), con longitud de onda y alcance especificados por norma MSA.' },
  { slug: 'enlace-troncal', term: 'Enlace troncal (uplink)', definition: 'Enlace entre conmutadores o hacia la red de distribución; suele concentrar el tráfico de varios puertos de acceso.' },
]

export function Glossary(): React.JSX.Element {
  const [filtro, setFiltro] = React.useState('')
  const q = filtro.trim().toLowerCase()
  const visibles = q ? TERMINOS.filter((t) => t.term.toLowerCase().includes(q) || t.definition.toLowerCase().includes(q)) : TERMINOS

  return (
    <section aria-labelledby="titulo-glosario">
      <h1 id="titulo-glosario">Glosario técnico</h1>
      <label htmlFor="glosario-filtro" className="sr-only">Filtrar términos</label>
      <input
        id="glosario-filtro"
        className="search-input"
        type="search"
        placeholder="Filtrar términos…"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        style={{ maxWidth: 320 }}
      />
      <dl style={{ marginTop: 16 }}>
        {visibles.map((t) => (
          <div key={t.slug} style={{ marginBottom: 14 }}>
            <dt style={{ fontWeight: 600 }}>
              <Link to={`/glosario/${t.slug}`} id={`term-${t.slug}`}>{t.term}</Link>
            </dt>
            <dd style={{ margin: '2px 0 0', color: 'var(--text-secondary)' }}>{t.definition}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** Detalle de un término con enlace de retorno a las fichas que lo usan. */
export function GlossaryTermSheet(): React.JSX.Element {
  const { slug = '' } = useParams<{ slug: string }>()
  const termino = TERMINOS.find((t) => t.slug === slug)
  if (!termino) {
    return (
      <section>
        <h1>Término no encontrado</h1>
        <p>
          <Link to="/glosario">Volver al glosario</Link>.
        </p>
      </section>
    )
  }
  return (
    <section aria-labelledby={`titulo-${termino.slug}`}>
      <h1 id={`titulo-${termino.slug}`}>{termino.term}</h1>
      <p>{termino.definition}</p>
      <p className="guia-tecnica">
        <Link to="/glosario">Glosario</Link> · enlace inline desde las fichas (appears in: VLAN, PoE, Transceptor en las pestañas de dispositivos).
      </p>
    </section>
  )
}

export { TERMINOS }