/**
 * Consultas del snapshotDetail (F8B-detalle): cada fila se resuelve por JOIN
 * (el cliente no necesita ids numéricos). Los tipos de fila viven en
 * `sqlite-snapshot-tipos.ts`; el mapeo, en `sqlite-snapshot-mapeo.ts`.
 */

export const SQL_DISPOSITIVOS = 'SELECT slug, summary, osi_profile_json FROM device ORDER BY id'

export const SQL_PUERTOS = `SELECT d.slug AS device_slug, p.label, i.code AS interface_code, p.quantity,
       p.speeds_json, p.poe_standard, p.role, p.notes
FROM port p
JOIN device d ON d.id = p.device_id
JOIN interface i ON i.id = p.interface_id
ORDER BY d.id, p.id`

export const SQL_RELACIONES = `SELECT d.slug AS device_slug, r.predicate, 'protocol' AS object_type, p.code AS object_code
FROM relationship r
JOIN device d ON d.id = r.subject_id AND r.subject_type = 'device'
JOIN protocol p ON p.id = r.object_id AND r.object_type = 'protocol'
WHERE r.predicate = 'supports-protocol'
UNION ALL
SELECT d.slug, r.predicate, 'layer', CAST(o.number AS TEXT)
FROM relationship r
JOIN device d ON d.id = r.subject_id AND r.subject_type = 'device'
JOIN osi_layer o ON o.number = r.object_id AND r.object_type = 'layer'
WHERE r.predicate = 'operates-at-layer'
UNION ALL
SELECT d.slug, r.predicate, 'standard', s.org || '/' || s.identifier
FROM relationship r
JOIN device d ON d.id = r.subject_id AND r.subject_type = 'device'
JOIN standard s ON s.id = r.object_id AND r.object_type = 'standard'
WHERE r.predicate = 'implements-standard'
UNION ALL
SELECT d.slug, r.predicate, 'medium', m.code
FROM relationship r
JOIN device d ON d.id = r.subject_id AND r.subject_type = 'device'
JOIN medium m ON m.id = r.object_id AND r.object_type = 'medium'
WHERE r.predicate = 'terminates-medium'
UNION ALL
SELECT d.slug, r.predicate, 'device', do.slug
FROM relationship r
JOIN device d ON d.id = r.subject_id AND r.subject_type = 'device'
JOIN device do ON do.id = r.object_id AND r.object_type = 'device'
WHERE r.predicate IN ('succeeds', 'precedes', 'replaced-by', 'variant-of')
  AND do.slug <> d.slug
ORDER BY device_slug, predicate, object_code`

export const SQL_VALORES = `SELECT d.slug AS device_slug, ad.key, ad.value_type,
       da.value_number, da.value_text, da.value_bool
FROM device_attribute da
JOIN device d ON d.id = da.device_id
JOIN attribute_definition ad ON ad.id = da.attribute_id
ORDER BY d.id, ad.sort_order, ad.key`

export const SQL_DEFINICIONES = `SELECT ad.key, ad.label_es, ad.value_type, ad.unit, ad.enum_json,
       ad.is_facet, ad.is_comparable, ad.compare_rule, c.code AS category_code
FROM attribute_definition ad
JOIN category c ON c.id = ad.category_id
ORDER BY ad.sort_order, ad.key`

export const SQL_AFIRMACIONES = `SELECT d.slug AS subject_slug, a.predicate, a.value_json, s.slug AS source_slug,
       a.confidence, a.verified_on, a.author, a.reviewed_by, a.note
FROM assertion a
JOIN device d ON d.id = a.subject_id AND a.subject_type = 'device'
JOIN source s ON s.id = a.source_id
ORDER BY d.id, a.predicate`

export const SQL_FUENTES = 'SELECT slug, kind, publisher, title, url, retrieved_on, authority_level FROM source ORDER BY slug'

export const SQL_FICHAS = `SELECT d.slug AS device_slug, f.title, f.language, f.url, f.local_path, s.slug AS source_slug
FROM datasheet f
JOIN device d ON d.id = f.device_id
JOIN source s ON s.id = f.source_id
ORDER BY d.id, f.title`

export const SQL_IMAGENES = `SELECT d.slug AS device_slug, g.kind, g.caption, g.local_path, g.url, s.slug AS source_slug
FROM image g
JOIN device d ON d.id = g.device_id
JOIN source s ON s.id = g.source_id
ORDER BY d.id, g.kind`

export const SQL_PROTOCOLOS = 'SELECT code, name, family, osi_layer FROM protocol ORDER BY family, code'

export const SQL_ESTANDARES = 'SELECT org, identifier, title FROM standard ORDER BY org, identifier'

export const SQL_MEDIOS = 'SELECT code, kind, name, max_speed_mbps FROM medium ORDER BY kind, code'

export const SQL_CAPAS = 'SELECT number, name_es FROM osi_layer ORDER BY number'

export const SQL_FABRICANTES = 'SELECT slug, snmp_enterprise FROM manufacturer ORDER BY slug'
