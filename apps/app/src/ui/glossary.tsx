import React from 'react'
import { Link, useParams } from 'react-router-dom'

/**
 * Glosario técnico (NET-HW-024 / §10.6).
 * Términos canónicos con definición; cada término tiene slug para enlaces
 * inline desde las fichas (`/glosario/:slug`).
 * Base curada inicial (F2) + sección «Redes y Protocolos» de
 * docs/glosario-desarrollo.md (23 términos); mantener sincronizado con
 * docs/glosario-tecnico.md (tabla canónica).
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
  { slug: 'dns', term: 'DNS', definition: 'Domain Name System. Sistema jerárquico que traduce nombres de dominio en direcciones IP.' },
  { slug: 'dhcp', term: 'DHCP', definition: 'Dynamic Host Configuration Protocol. Asigna automáticamente dirección IP, máscara, puerta de enlace y DNS a los dispositivos de la red.' },
  { slug: 'nat', term: 'NAT', definition: 'Network Address Translation. Traduce direcciones entre una red privada y una pública, permitiendo compartir una IP de salida.' },
  { slug: 'ddos', term: 'DoS / DDoS', definition: 'Denegación de servicio (distribuida). Ataques que saturan un servicio o enlace para dejarlo inaccesible; los firewalls y scrubbing-centers los mitigan.' },
  { slug: 'firewall', term: 'Cortafuegos (firewall)', definition: 'Dispositivo o función que filtra el tráfico según reglas de seguridad (origen, destino, puertos, aplicación, estado de conexión).' },
  { slug: 'router', term: 'Enrutador (router)', definition: 'Dispositivo de capa 3 que encamina paquetes entre redes distintas eligiendo la mejor ruta disponible.' },
  { slug: 'tcp-udp', term: 'TCP / UDP', definition: 'Protocolos de transporte: TCP orientado a conexión y fiable (retransmisiones, control de flujo); UDP sin conexión y de mínima latencia.' },
  { slug: 'ipv4-ipv6', term: 'IPv4 / IPv6', definition: 'Versiones del protocolo Internet: direcciones de 32 bits (4 300 millones aprox.) frente a 128 bits con autoconfiguración y sin NAT obligatorio.' },
  { slug: 'icmp', term: 'ICMP', definition: 'Internet Control Message Protocol. Mensajería de diagnóstico y error de la capa 3 (ping, traceroute, destino inalcanzable).' },
  { slug: 'mtu', term: 'MTU', definition: 'Maximum Transmission Unit. Tamaño máximo de trama/paquete en un enlace (1500 bytes en Ethernet clásico); lo mayor se fragmenta.' },
  { slug: 'latencia', term: 'Latencia', definition: 'Tiempo que tarda un dato en viajar del origen al destino; suma propagación, serialización, cola y procesado.' },
  { slug: 'qos', term: 'QoS', definition: 'Quality of Service. Priorización y reserva de recursos para tráficos sensibles a latencia o pérdida (voz, vídeo, control industrial).' },
  { slug: 'topologia-de-red', term: 'Topología de red', definition: 'Disposición física o lógica de nodos y enlaces: estrella, malla, bus, anillo, spine-leaf (Clos) en centros de datos.' },
  { slug: 'mqtt', term: 'MQTT', definition: 'Protocolo ligero de mensajería publicación/suscripción sobre TCP, habitual en IoT y telemetría industrial.' },
  { slug: 'cidr', term: 'CIDR', definition: 'Classless Inter-Domain Routing. Notación compacta de red y prefijo, p. ej. 192.168.1.0/24 (256 direcciones).' },
  { slug: 'subred', term: 'Subred', definition: 'Partición lógica de una red IP mediante máscara o prefijo; cada subred es un dominio de difusión propio.' },
  { slug: 'direccion-mac', term: 'Dirección MAC', definition: 'Identificador físico único de 48 bits de una interfaz de red; la usan los switches para reenviar tramas en capa 2.' },
  { slug: 'ssh', term: 'SSH', definition: 'Secure Shell. Protocolo de administración remota cifrada y túneles seguros sobre TCP/22.' },
  { slug: 'tls-ssl', term: 'TLS / SSL', definition: 'Protocolos de cifrado del transporte (TLS sucesor de SSL); protegen HTTP, correo, VPN y gestión de dispositivos.' },
  { slug: 'vpn', term: 'VPN', definition: 'Virtual Private Network. Extiende una red privada sobre infraestructura pública mediante túneles cifrados (IPsec, SSL/TLS, WireGuard).' },
  { slug: 'balanceador-de-carga', term: 'Balanceador de carga', definition: 'Reparte sesiones o peticiones entre varios servidores o enlaces según salud, peso o algoritmo, para capacidad y disponibilidad.' },
  { slug: 'proxy-inverso', term: 'Proxy inverso', definition: 'Intermediario delante de los servidores: oculta su topología, termina TLS, cachea y distribuye carga.' },
  { slug: 'ttl', term: 'TTL', definition: 'Time To Live. Límite de saltos o tiempo de validez de un paquete o registro; evita bucles y caduca cachés.' },
  { slug: 'snmp', term: 'SNMP', definition: 'Simple Network Management Protocol. Gestión y supervisión de dispositivos mediante agentes, estaciones gestoras y OIDs (v1/v2c/v3).' },
  { slug: 'sysobjectid', term: 'sysObjectID', definition: 'Identificador SNMP del tipo exacto de un dispositivo: 1.3.6.1.4.1.{empresa}.{producto}. Base de la identificación automática en inventarios NMS.' },
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