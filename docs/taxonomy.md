# Taxonomía de hardware — NetAtlas

> Fuente normativa: PLAN MAESTRO §7. Versión viva; el seed curado vive en `datasets/seed/categories.json`.

## Principios

1. **Las categorías son datos, no código**: añadir categoría = fila en `category`, cero migraciones.
2. **Jerarquía de profundidad variable** por `parent_id` (autorreferencia), 2–4 niveles en el canon.
3. **Clasificación múltiple controlada**: el dispositivo tiene una categoría primaria + roles secundarios
   (`device_category_role`).
4. **Código estable e inmutable** `CAT-XXX[-YYY]` usado en URLs, DSL y datasets externos.
5. **El estado temporal NO es categoría**: es `lifecycle_status` del dispositivo.

## Árbol canónico (15 macrocategorías)

| Código | Macrocategoría | Niveles 2–3 (seed) |
|---|---|---|
| CAT-IFC | Interfaces de red | (F2) |
| CAT-SWT | Interconexión y switching | CAT-SWT-HUB, CAT-SWT-L2, CAT-SWT-L3 |
| CAT-RTR | Routing | CAT-RTR-SOHO, CAT-RTR-ENT |
| CAT-WLS | Inalámbricos | CAT-WLS-AP |
| CAT-ACC | Módems y acceso | CAT-ACC-DIAL, CAT-ACC-CABLE, CAT-ACC-ONT |
| CAT-SEC | Seguridad | CAT-SEC-FW, CAT-SEC-NGFW |
| CAT-TEL | Telecom y transporte | (F2) |
| CAT-OPT | Fibra y óptica | (F2) |
| CAT-IND | Industrial / OT | (F2) |
| CAT-IOT | IoT y LPWAN | (F2) |
| CAT-DCN | Centros de datos | (F2) |
| CAT-PAS | Cableado e infraestructura pasiva | (F2) |
| CAT-PWR | Alimentación y PoE | (F2) |
| CAT-VIR | Virtualización y NFV | (F2) |
| CAT-TST | Medición y prueba | (F2) |

## Reglas de calidad

1. Ninguna categoría huérfana (validado por `data:lint`).
2. Ningún dispositivo sin categoría primaria existente.
3. Nombres en español + `aliases` en inglés y términos de fabricante ("switch", "conmutador", "sw").
4. Perfil OSI típico por categoría (heredable por dispositivo).
5. Documentación por categoría: definición, función, ejemplos, afinidades, errores frecuentes (F2).