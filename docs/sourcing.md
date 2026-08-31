# Sourcing — fuentes, confianza y trazabilidad

> Fuente normativa: PLAN MAESTRO §20. Estado F0.

## Principio

> **Ningún dato técnico crítico se presenta como certeza sin respaldo.**
> La unidad de verdad es la **afirmación** (`assertion`): `(sujeto, predicado, valor) + fuente + confianza + fecha + autor + revisor`.

## Implementación F0

- Entidades de dominio: `Source`, `Assertion` (`packages/domain/src/sourcing/assertion.ts`).
- Tablas: `source`, `assertion` (migración 0001) con FK a `device_attribute.assertion_id` y `relationship.assertion_id`.
- Seed: `datasets/seed/sources.json` (9 fuentes: datasheets oficiales, IEEE, RFCs, editorial) +
  assertions en cada ficha con `sourceSlug`, `confidence` y notas.

## Los cinco tipos de confianza

| Tipo | Insignia UI (F1+) | Regla operativa |
|---|---|---|
| `official` | verde | datasheet/manual/comunicación oficial |
| `derived` | azul | calculada de datos oficiales (+tooltip de derivación) |
| `third-party` | ámbar | prensa técnica, laboratorios, comunidad curada |
| `experimental` | violeta | medida propia (lab) con contexto |
| `historical` | gris | fue válida; se conserva con fecha de corte |

## Flujo de revisión

```text
borrador → verificado (2ª persona en datos críticos) → publicado
assertion.reviewed_by IS NULL  ⇒  UI marca "pendiente de revisión"
```

En F0 monopuesto, `author/reviewed_by` son roles del mismo curador; el modelo ya separa
las acciones para la colaboración futura (F8+).

## Métricas de calidad (dashboard `/sources`, F6+)

- % datos críticos con assertion oficial.
- Frescura: `verified_on` envejecido → rojo.
- Contradicciones oficial/terceros → mostrar ambas con aviso, nunca promedio.