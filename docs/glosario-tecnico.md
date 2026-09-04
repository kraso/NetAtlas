# Glosario Técnico de Hardware de Redes

Términos canónicos del **dominio del producto** (hardware de redes), navegables en la aplicación en la ruta **`/glosario`** (PWA y escritorio Tauri, `apps/app/src/ui/glossary.tsx`) y enlazados inline desde las pestañas de las fichas de dispositivo.

> **Relación con el glosario del equipo**: este documento cubre la terminología *del producto*.
> La jerga de *ingeniería de software* del equipo (arquitectura, testing, DevOps…) está en
> [**glosario-desarrollo.md**](./glosario-desarrollo.md).

## Términos (fuente canónica: seed / `glossary.tsx`)

> Origen: 6 base + 23 de la sección «Redes y Protocolos» de
> [glosario-desarrollo.md](./glosario-desarrollo.md) (se omiten `Port` —colisiona
> con puerto físico— y entradas solo-dev).

| Slug | Término | Definición |
|---|---|---|
| `conmutador` | Conmutador (switch) | Dispositivo de capa 2 (y opcionalmente 3) que reenvía tramas según la dirección MAC de destino, segmentando los dominios de colisión del Ethernet conmutado. |
| `dominio-de-colision` | Dominio de colisión | Segmento de red donde las colisiones de tramas pueden ocurrir; los switches lo segmentan por puerto (a diferencia de los hubs, que lo comparten). |
| `vlan` | VLAN (802.1Q) | Segmentación lógica de una red de capa 2 mediante etiquetas de la norma IEEE 802.1Q, independiente de la topología física. |
| `poe` | Power over Ethernet | Entrega de energía eléctrica junto con datos sobre el cable de red; clasificado en IEEE 802.3af (15,4 W), 802.3at (30 W) y 802.3bt (60–90 W). |
| `transceiver` | Transceptor óptico | Módulo que convierte señales eléctricas en ópticas y viceversa (SFP, SFP+, QSFP…), con longitud de onda y alcance especificados por norma MSA. |
| `enlace-troncal` | Enlace troncal (uplink) | Enlace entre conmutadores o hacia la red de distribución; suele concentrar el tráfico de varios puertos de acceso. |
| `dns` | DNS | Domain Name System. Sistema jerárquico que traduce nombres de dominio en direcciones IP. |
| `dhcp` | DHCP | Dynamic Host Configuration Protocol. Asigna automáticamente dirección IP, máscara, puerta de enlace y DNS a los dispositivos de la red. |
| `nat` | NAT | Network Address Translation. Traduce direcciones entre una red privada y una pública, permitiendo compartir una IP de salida. |
| `ddos` | DoS / DDoS | Denegación de servicio (distribuida). Ataques que saturan un servicio o enlace para dejarlo inaccesible; los firewalls y scrubbing-centers los mitigan. |
| `firewall` | Cortafuegos (firewall) | Dispositivo o función que filtra el tráfico según reglas de seguridad (origen, destino, puertos, aplicación, estado de conexión). |
| `router` | Enrutador (router) | Dispositivo de capa 3 que encamina paquetes entre redes distintas eligiendo la mejor ruta disponible. |
| `tcp-udp` | TCP / UDP | Protocolos de transporte: TCP orientado a conexión y fiable (retransmisiones, control de flujo); UDP sin conexión y de mínima latencia. |
| `ipv4-ipv6` | IPv4 / IPv6 | Versiones del protocolo Internet: direcciones de 32 bits (4 300 millones aprox.) frente a 128 bits con autoconfiguración y sin NAT obligatorio. |
| `icmp` | ICMP | Internet Control Message Protocol. Mensajería de diagnóstico y error de la capa 3 (ping, traceroute, destino inalcanzable). |
| `mtu` | MTU | Maximum Transmission Unit. Tamaño máximo de trama/paquete en un enlace (1500 bytes en Ethernet clásico); lo mayor se fragmenta. |
| `latencia` | Latencia | Tiempo que tarda un dato en viajar del origen al destino; suma propagación, serialización, cola y procesado. |
| `qos` | QoS | Quality of Service. Priorización y reserva de recursos para tráficos sensibles a latencia o pérdida (voz, vídeo, control industrial). |
| `topologia-de-red` | Topología de red | Disposición física o lógica de nodos y enlaces: estrella, malla, bus, anillo, spine-leaf (Clos) en centros de datos. |
| `mqtt` | MQTT | Protocolo ligero de mensajería publicación/suscripción sobre TCP, habitual en IoT y telemetría industrial. |
| `cidr` | CIDR | Classless Inter-Domain Routing. Notación compacta de red y prefijo, p. ej. 192.168.1.0/24 (256 direcciones). |
| `subred` | Subred | Partición lógica de una red IP mediante máscara o prefijo; cada subred es un dominio de difusión propio. |
| `direccion-mac` | Dirección MAC | Identificador físico único de 48 bits de una interfaz de red; la usan los switches para reenviar tramas en capa 2. |
| `ssh` | SSH | Secure Shell. Protocolo de administración remota cifrada y túneles seguros sobre TCP/22. |
| `tls-ssl` | TLS / SSL | Protocolos de cifrado del transporte (TLS sucesor de SSL); protegen HTTP, correo, VPN y gestión de dispositivos. |
| `vpn` | VPN | Virtual Private Network. Extiende una red privada sobre infraestructura pública mediante túneles cifrados (IPsec, SSL/TLS, WireGuard). |
| `balanceador-de-carga` | Balanceador de carga | Reparte sesiones o peticiones entre varios servidores o enlaces según salud, peso o algoritmo, para capacidad y disponibilidad. |
| `proxy-inverso` | Proxy inverso | Intermediario delante de los servidores: oculta su topología, termina TLS, cachea y distribuye carga. |
| `ttl` | TTL | Time To Live. Límite de saltos o tiempo de validez de un paquete o registro; evita bucles y caduca cachés. |
| `snmp` | SNMP | Simple Network Management Protocol. Gestión y supervisión de dispositivos mediante agentes, estaciones gestoras y OIDs (v1/v2c/v3). |
| `sysobjectid` | sysObjectID | Identificador SNMP del tipo exacto de un dispositivo: 1.3.6.1.4.1.{empresa}.{producto}. Base de la identificación automática en inventarios NMS. |

## Navegación

- En la app: `/glosario` (lista + filtro) y `/glosario/:slug` (ficha del término).
- En este repo la fuente canónica es el array `TERMINOS` de `apps/app/src/ui/glossary.tsx`;
  la relación con el dominio (entidades de capas, medios, protocolos) vive en `packages/domain`.