# Glosario Técnico de Hardware de Redes

Términos canónicos del **dominio del producto** (hardware de redes), navegables en la aplicación en la ruta **`/glosario`** (PWA y escritorio Tauri, `apps/app/src/ui/glossary.tsx`) y enlazados inline desde las pestañas de las fichas de dispositivo.

> **Relación con el glosario del equipo**: este documento cubre la terminología *del producto*.
> La jerga de *ingeniería de software* del equipo (arquitectura, testing, DevOps…) está en
> [**glosario-desarrollo.md**](./glosario-desarrollo.md).

## Términos (fuente canónica: seed / `glossary.tsx`)

| Slug | Término | Definición |
|---|---|---|
| `conmutador` | Conmutador (switch) | Dispositivo de capa 2 (y opcionalmente 3) que reenvía tramas según la dirección MAC de destino, segmentando los dominios de colisión del Ethernet conmutado. |
| `dominio-de-colision` | Dominio de colisión | Segmento de red donde las colisiones de tramas pueden ocurrir; los switches lo segmentan por puerto (a diferencia de los hubs, que lo comparten). |
| `vlan` | VLAN (802.1Q) | Segmentación lógica de una red de capa 2 mediante etiquetas de la norma IEEE 802.1Q, independiente de la topología física. |
| `poe` | Power over Ethernet | Entrega de energía eléctrica junto con datos sobre el cable de red; clasificado en IEEE 802.3af (15,4 W), 802.3at (30 W) y 802.3bt (60–90 W). |
| `transceiver` | Transceptor óptico | Módulo que convierte señales eléctricas en ópticas y viceversa (SFP, SFP+, QSFP…), con longitud de onda y alcance especificados por norma MSA. |
| `enlace-troncal` | Enlace troncal (uplink) | Enlace entre conmutadores o hacia la red de distribución; suele concentrar el tráfico de varios puertos de acceso. |

## Navegación

- En la app: `/glosario` (lista + filtro) y `/glosario/:slug` (ficha del término).
- En este repo la fuente canónica es el array `TERMINOS` de `apps/app/src/ui/glossary.tsx`;
  la relación con el dominio (entidades de capas, medios, protocolos) vive en `packages/domain`.