-- =============================================================================
-- NetAtlas — Migración 0001: esquema canónico inicial (Fase 0)
-- Fuente normativa: PLAN MAESTRO §9.3 / §9.7 / §20.2 / §13.3
-- Motor: SQLite (WASM-OPFS / nativo). SQL portable a PostgreSQL salvo FTS5.
-- Inmutable: una vez aplicada, no se edita; los cambios van en 0002_nnn.sql.
-- Nota: la tabla schema_version la crea y gestiona el migrator (packages/data/src/migrator.ts);
--       las PRAGMAs de conexión (WAL, foreign_keys, synchronous) las aplica el driver.

-- ── Catálogos cerrados ───────────────────────────────────────────────────────

-- Nivel de autoridad de una fuente (1 oficial … 4 comunitario) — §20.2
CREATE TABLE source (
  id              INTEGER PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  kind            TEXT NOT NULL CHECK (kind IN
                  ('datasheet','manual','rfc','ieee','web-oficial','libro','terceros','editorial')),
  publisher       TEXT,
  title           TEXT NOT NULL,
  url             TEXT,
  published_on    TEXT,                    -- ISO-8601
  retrieved_on    TEXT,                    -- ISO-8601
  authority_level INTEGER NOT NULL DEFAULT 3 CHECK (authority_level BETWEEN 1 AND 4),
  redistribution  INTEGER NOT NULL DEFAULT 0  -- ¿permite el fabricante redistribuir el PDF?
);

-- Estándar (IEEE, IETF/RFC, ISO/IEC, ITU-T, MSA…) — §15
CREATE TABLE standard (
  id            INTEGER PRIMARY KEY,
  org           TEXT NOT NULL,             -- 'ieee','ietf','iso-iec','itu-t','msa',…
  identifier    TEXT NOT NULL,             -- '2328' (RFC) / '802.3bt' / 'SFF-8402'
  title         TEXT NOT NULL,
  version       TEXT,
  published_on  TEXT,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','superseded','withdrawn')),
  supersedes_id INTEGER REFERENCES standard(id),
  url           TEXT,
  UNIQUE (org, identifier)
);

-- Protocolo — §14
CREATE TABLE protocol (
  id           INTEGER PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,       -- 'ospf','vxlan','802.1q'
  name         TEXT NOT NULL,
  family       TEXT NOT NULL,              -- link|internet|routing|transport|application|…
  osi_layer    INTEGER NOT NULL CHECK (osi_layer BETWEEN 1 AND 7),
  description  TEXT,
  standard_id  INTEGER REFERENCES standard(id),
  aliases_json TEXT NOT NULL DEFAULT '[]',
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','legacy'))
);

-- Medio de transmisión — §16
CREATE TABLE medium (
  id             INTEGER PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,     -- 'utp-cat6a','smf-os2','wifi-6','mmf-om4'
  kind           TEXT NOT NULL CHECK (kind IN ('cobre','fibra','inalambrico','coaxial')),
  name           TEXT NOT NULL,
  specs_json     TEXT NOT NULL DEFAULT '{}',
  max_distance_m REAL,
  max_speed_mbps INTEGER,
  wavelength_nm  INTEGER,
  standard_id    INTEGER REFERENCES standard(id)
);

-- Capas OSI (catálogo cerrado 1..7) y TCP/IP (1..4) — §8.4
CREATE TABLE osi_layer (
  number INTEGER PRIMARY KEY CHECK (number BETWEEN 1 AND 7),
  name_es TEXT NOT NULL,
  name_en TEXT NOT NULL
);

CREATE TABLE tcpip_layer (
  number INTEGER PRIMARY KEY CHECK (number BETWEEN 1 AND 4),
  name_es TEXT NOT NULL,
  name_en TEXT NOT NULL
);

-- Tecnología transversal (PoE, stacking, VXLAN-EVPN, TSN…) — §8.1
CREATE TABLE technology (
  id           INTEGER PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','legacy'))
);

-- Velocidad para escaleras de capacidad (10M→800G) — §8.5
CREATE TABLE speed_grade (
  id           INTEGER PRIMARY KEY,
  mbps         INTEGER NOT NULL UNIQUE,
  label        TEXT NOT NULL,              -- '1 Gbps'
  standard_id  INTEGER REFERENCES standard(id)
);

-- ── Catálogo y clasificación ──────────────────────────────────────────────────

CREATE TABLE manufacturer (
  id            INTEGER PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  country       TEXT,
  founded_year  INTEGER,
  website       TEXT,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','inactive','acquired','defunct'))
);

CREATE TABLE product_family (
  id              INTEGER PRIMARY KEY,
  manufacturer_id INTEGER NOT NULL REFERENCES manufacturer(id),
  slug            TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  UNIQUE (manufacturer_id, slug)
);

CREATE TABLE category (
  id            INTEGER PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,          -- 'CAT-SWT-L2'
  parent_id     INTEGER REFERENCES category(id),
  name_es       TEXT NOT NULL,
  name_en       TEXT,
  aliases_json  TEXT NOT NULL DEFAULT '[]',
  definition    TEXT,
  osi_profile_json TEXT,                        -- perfil típico heredable: {"terminate":[...],"transparent":[...],"primary":N}
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE device (
  id              INTEGER PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,               -- nombre técnico
  commercial_name TEXT,
  manufacturer_id INTEGER NOT NULL REFERENCES manufacturer(id),
  family_id       INTEGER REFERENCES product_family(id),
  category_id     INTEGER NOT NULL REFERENCES category(id),
  model           TEXT,
  sku             TEXT,
  generation      TEXT,
  announced_on    TEXT,                        -- ISO-8601
  released_on     TEXT,
  eol_on          TEXT,
  eos_on          TEXT,
  lifecycle_status TEXT NOT NULL DEFAULT 'current'
    CHECK (lifecycle_status IN
      ('announced','current','mature','eol','eos','legacy','discontinued')),
  osi_profile_json  TEXT,                      -- {"terminate":[...],"transparent":[...],"primary":N}
  summary           TEXT,
  msrp_amount       REAL,
  msrp_currency     TEXT,
  msrp_as_of        TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  valid_from        TEXT NOT NULL DEFAULT '1970-01-01',
  valid_to          TEXT                       -- NULL = vigente
);
CREATE INDEX idx_device_category ON device(category_id);
CREATE INDEX idx_device_mfr      ON device(manufacturer_id);
CREATE INDEX idx_device_family   ON device(family_id);
CREATE INDEX idx_device_lifecycle ON device(lifecycle_status);

-- Clasificación múltiple controlada: roles secundarios — §7.1
CREATE TABLE device_category_role (
  device_id   INTEGER NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES category(id),
  PRIMARY KEY (device_id, category_id)
);

-- ── Inventario físico ─────────────────────────────────────────────────────────

CREATE TABLE interface (
  id            INTEGER PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,          -- 'rj45-10gbase-t','sfp28'
  kind          TEXT NOT NULL,                 -- ethernet|fibra|consola|usb|serial|wifi|coaxial
  connector     TEXT,                          -- 'RJ45','LC','MPO'
  medium_id     INTEGER REFERENCES medium(id),
  max_speed_mbps INTEGER,
  standard_id   INTEGER REFERENCES standard(id)
);

CREATE TABLE port (
  id            INTEGER PRIMARY KEY,
  device_id     INTEGER NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  interface_id  INTEGER NOT NULL REFERENCES interface(id),
  label         TEXT NOT NULL,                 -- 'Gi1/0/1..48','SFP+ uplink'
  quantity      INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  speeds_json   TEXT NOT NULL DEFAULT '[]',    -- [1000,10000]
  poe_standard  TEXT CHECK (poe_standard IN ('802.3af','802.3at','802.3bt')),
  role          TEXT CHECK (role IN ('access','uplink','mgmt','console','stack')),
  notes         TEXT
);
CREATE INDEX idx_port_device ON port(device_id);
CREATE INDEX idx_port_iface  ON port(interface_id);

-- ── Atributos por categoría (EAV acotado) ─────────────────────────────────────

CREATE TABLE attribute_definition (
  id            INTEGER PRIMARY KEY,
  category_id   INTEGER NOT NULL REFERENCES category(id),
  key           TEXT NOT NULL,                 -- 'switching_capacity_gbps'
  label_es      TEXT NOT NULL,
  value_type    TEXT NOT NULL CHECK (value_type IN ('number','text','enum','bool','range')),
  unit          TEXT,                          -- 'Gbps','W','mm'
  enum_json     TEXT,                          -- valores si value_type='enum'
  is_facet      INTEGER NOT NULL DEFAULT 0,    -- usable en filtros
  is_comparable INTEGER NOT NULL DEFAULT 1,    -- aparece en comparador
  compare_rule  TEXT NOT NULL DEFAULT 'none'
                CHECK (compare_rule IN ('higher-better','lower-better','set-compare','none')),
  required      INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (category_id, key)
);

CREATE TABLE device_attribute (
  device_id    INTEGER NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  attribute_id INTEGER NOT NULL REFERENCES attribute_definition(id),
  value_number REAL,
  value_text   TEXT,
  value_bool   INTEGER,
  assertion_id INTEGER REFERENCES assertion(id),   -- trazabilidad §20
  PRIMARY KEY (device_id, attribute_id)
);
CREATE INDEX idx_attr_facet ON device_attribute(attribute_id, value_number);

-- ── Grafo de conocimiento ─────────────────────────────────────────────────────

CREATE TABLE predicate (
  code         TEXT PRIMARY KEY,               -- 'supports-protocol'
  domain_types TEXT NOT NULL,                  -- JSON ['device','category']
  range_types  TEXT NOT NULL,                  -- JSON ['protocol']
  cardinality  TEXT NOT NULL DEFAULT 'many' CHECK (cardinality IN ('one','many')),
  symmetric    INTEGER NOT NULL DEFAULT 0,
  acyclic      INTEGER NOT NULL DEFAULT 0,
  inverse_code TEXT                            -- 'succeeds'↔'precedes'
);

CREATE TABLE relationship (
  id           INTEGER PRIMARY KEY,
  subject_type TEXT NOT NULL,                  -- 'device','category','protocol',…
  subject_id   INTEGER NOT NULL,
  predicate    TEXT NOT NULL REFERENCES predicate(code),
  object_type  TEXT NOT NULL,
  object_id    INTEGER NOT NULL,
  weight       REAL CHECK (weight BETWEEN 0 AND 1),
  assertion_id INTEGER REFERENCES assertion(id),
  valid_from   TEXT NOT NULL DEFAULT '1970-01-01',
  valid_to     TEXT,
  created_at   TEXT NOT NULL,
  UNIQUE (subject_type, subject_id, predicate, object_type, object_id, valid_from)
);
CREATE INDEX idx_rel_s ON relationship(subject_type, subject_id, predicate);
CREATE INDEX idx_rel_o ON relationship(object_type, object_id, predicate);
CREATE INDEX idx_rel_predicate ON relationship(predicate);

-- Cardinalidad 'one' vigente: índice parcial (una arista vigente por sujeto+predicado).
-- La lista de predicados 'one' es fija en la v1 (manufactured-by, belongs-to-family, has-category):
-- SQLite no permite subconsultas en la cláusula WHERE de un índice parcial.
CREATE UNIQUE INDEX idx_rel_one_current
  ON relationship(subject_type, subject_id, predicate)
  WHERE valid_to IS NULL
    AND predicate IN ('manufactured-by', 'belongs-to-family', 'has-category');

-- ── Afirmaciones y trazabilidad ───────────────────────────────────────────────

CREATE TABLE assertion (
  id           INTEGER PRIMARY KEY,
  subject_type TEXT NOT NULL,
  subject_id   INTEGER NOT NULL,
  predicate    TEXT NOT NULL,                  -- 'throughput_gbps','supports-protocol',…
  value_json   TEXT NOT NULL,
  source_id    INTEGER NOT NULL REFERENCES source(id),
  confidence   TEXT NOT NULL CHECK (confidence IN
    ('official','derived','third-party','experimental','historical')),
  verified_on  TEXT NOT NULL,                  -- ISO-8601
  author       TEXT NOT NULL,
  reviewed_by  TEXT,                           -- NULL = pendiente de revisión (§20.4)
  note         TEXT
);
CREATE INDEX idx_assertion_subject ON assertion(subject_type, subject_id);
CREATE INDEX idx_assertion_source ON assertion(source_id);

-- ── Componentes internos (arquitectura del dispositivo) ───────────────────────

CREATE TABLE component (
  id            INTEGER PRIMARY KEY,
  manufacturer_id INTEGER REFERENCES manufacturer(id),
  model         TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('cpu','asic','npu','fpga','dsp','memory','accelerator','pse')),
  name          TEXT,
  specs_json    TEXT NOT NULL DEFAULT '{}',
  UNIQUE (manufacturer_id, model, kind)
);

CREATE TABLE device_component (
  device_id    INTEGER NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  component_id INTEGER NOT NULL REFERENCES component(id),
  role         TEXT NOT NULL,                  -- 'cpu','asic',…
  qty          INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (device_id, component_id)
);

-- ── Firmware, alimentación, documentación ─────────────────────────────────────

CREATE TABLE firmware (
  id            INTEGER PRIMARY KEY,
  device_id     INTEGER NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  version       TEXT NOT NULL,
  released_on   TEXT,
  recommendation INTEGER NOT NULL DEFAULT 0,   -- ¿versión recomendada?
  notes         TEXT,
  UNIQUE (device_id, version)
);

CREATE TABLE power_spec (
  id            INTEGER PRIMARY KEY,
  device_id     INTEGER NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('psu','poe-budget','consumption')),
  value_w       REAL NOT NULL,
  standard      TEXT,
  notes         TEXT
);

CREATE TABLE image (
  id            INTEGER PRIMARY KEY,
  content_hash  TEXT NOT NULL UNIQUE,          -- hash de contenido (deduplicación §9.8)
  device_id     INTEGER REFERENCES device(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('frontal','trasera','lateral','interior','panel')),
  caption       TEXT,
  source_id     INTEGER REFERENCES source(id),
  attribution   TEXT,
  local_path    TEXT,                          -- activos fuera de la BD: OPFS/FS (§9.8)
  url           TEXT
);

CREATE TABLE datasheet (
  id            INTEGER PRIMARY KEY,
  device_id     INTEGER NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  language      TEXT NOT NULL DEFAULT 'en',
  source_id     INTEGER NOT NULL REFERENCES source(id),
  local_path    TEXT,
  url           TEXT
);

-- ── Glosario ──────────────────────────────────────────────────────────────────

CREATE TABLE glossary_term (
  id         INTEGER PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  term       TEXT NOT NULL,                    -- 'Conmutador (switch)'
  definition TEXT NOT NULL,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  osi_layer  INTEGER REFERENCES osi_layer(number)
);

-- ── Topologías (existen desde el MVP, se pueblan en F4) ───────────────────────

CREATE TABLE topology (
  id         INTEGER PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'reference' CHECK (kind IN ('reference','user')),
  metadata   TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE topology_node (
  id          INTEGER PRIMARY KEY,
  topology_id INTEGER NOT NULL REFERENCES topology(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,                   -- 'device'|'category'
  entity_id   INTEGER NOT NULL,
  x           REAL,
  y           REAL,
  layer_hint  INTEGER
);

CREATE TABLE topology_edge (
  id            INTEGER PRIMARY KEY,
  topology_id   INTEGER NOT NULL REFERENCES topology(id) ON DELETE CASCADE,
  from_node     INTEGER NOT NULL REFERENCES topology_node(id),
  to_node       INTEGER NOT NULL REFERENCES topology_node(id),
  link_kind     TEXT NOT NULL DEFAULT 'link',
  medium_id     INTEGER REFERENCES medium(id),
  label         TEXT
);

-- ── Versionado del conocimiento: bitemporalidad simplificada ──────────────────

CREATE TABLE entity_history (
  id           INTEGER PRIMARY KEY,
  entity_type  TEXT NOT NULL,                  -- 'device','category',…
  entity_id    INTEGER NOT NULL,
  changed_at   TEXT NOT NULL,                  -- ISO-8601
  change_type  TEXT NOT NULL CHECK (change_type IN ('create','update','deprecate','restore')),
  snapshot_json TEXT NOT NULL,
  author       TEXT NOT NULL,
  source_id    INTEGER REFERENCES source(id),
  rationale    TEXT
);
CREATE INDEX idx_history_entity ON entity_history(entity_type, entity_id);

-- Referencias documentales sueltas (enlaces oficiales, notas de fin de venta)
CREATE TABLE reference (
  id         INTEGER PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id  INTEGER NOT NULL,
  source_id  INTEGER NOT NULL REFERENCES source(id),
  label      TEXT,
  url        TEXT,
  added_on   TEXT NOT NULL
);

-- ── Registro de importaciones (lotes) ─────────────────────────────────────────

CREATE TABLE import_batch (
  id            INTEGER PRIMARY KEY,
  imported_at   TEXT NOT NULL,
  filename      TEXT NOT NULL,
  report_json   TEXT NOT NULL,                 -- altas/conflictos/rechazos + razones (§19.3)
  curator       TEXT NOT NULL,
  published     INTEGER NOT NULL DEFAULT 0
);

-- =============================================================================
-- FTS5 — índice textual de dispositivos (§9.6 / §12)
-- Contentless ('') con triggers de sincronización en la misma transacción.
-- =============================================================================

CREATE VIRTUAL TABLE fts_device USING fts5(
  name, commercial_name, model, sku, summary, aliases,
  content='',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER fts_device_ai AFTER INSERT ON device BEGIN
  INSERT INTO fts_device(rowid, name, commercial_name, model, sku, summary, aliases)
  VALUES (
    new.id, new.name, COALESCE(new.commercial_name,''), COALESCE(new.model,''),
    COALESCE(new.sku,''), COALESCE(new.summary,''),
    (SELECT group_concat(name_es, ' ') FROM category WHERE id = new.category_id)
  );
END;

CREATE TRIGGER fts_device_ad AFTER DELETE ON device BEGIN
  INSERT INTO fts_device(fts_device, rowid, name, commercial_name, model, sku, summary, aliases)
  VALUES ('delete', old.id, old.name, old.commercial_name, old.model, old.sku, old.summary, '');
END;

CREATE TRIGGER fts_device_au AFTER UPDATE ON device BEGIN
  INSERT INTO fts_device(fts_device, rowid, name, commercial_name, model, sku, summary, aliases)
  VALUES ('delete', old.id, old.name, old.commercial_name, old.model, old.sku, old.summary, '');
  INSERT INTO fts_device(rowid, name, commercial_name, model, sku, summary, aliases)
  VALUES (
    new.id, new.name, COALESCE(new.commercial_name,''), COALESCE(new.model,''),
    COALESCE(new.sku,''), COALESCE(new.summary,''),
    (SELECT group_concat(name_es, ' ') FROM category WHERE id = new.category_id)
  );
END;

-- =============================================================================
-- Vistas de proyección del grafo (§9.5) — exposiciones limpias al dominio
-- =============================================================================

CREATE VIEW v_device AS
SELECT d.id, d.slug, d.name, d.commercial_name, d.model, d.sku,
       m.slug AS manufacturer_slug, m.name AS manufacturer_name,
       c.code AS category_code, c.name_es AS category_name,
       d.lifecycle_status, d.osi_profile_json, d.summary,
       d.released_on, d.eol_on, d.eos_on
FROM device d
JOIN manufacturer m ON m.id = d.manufacturer_id
JOIN category c      ON c.id = d.category_id;

CREATE VIEW v_device_protocols AS
SELECT d.slug AS device_slug, p.code AS protocol_code, p.name AS protocol_name,
       p.osi_layer, r.valid_from, r.valid_to, r.assertion_id
FROM relationship r
JOIN device d   ON r.subject_type = 'device' AND r.subject_id = d.id
JOIN protocol p ON r.object_type = 'protocol' AND r.object_id = p.id
WHERE r.predicate = 'supports-protocol';

CREATE VIEW v_device_standards AS
SELECT d.slug AS device_slug, s.org, s.identifier, s.title,
       r.valid_from, r.valid_to, r.assertion_id
FROM relationship r
JOIN device d   ON r.subject_type = 'device' AND r.subject_id = d.id
JOIN standard s ON r.object_type = 'standard' AND r.object_id = s.id
WHERE r.predicate = 'implements-standard';

CREATE VIEW v_genealogy AS
SELECT r.predicate, r.valid_from,
       ss.slug AS subject_slug, ss.name AS subject_name, ss.lifecycle_status AS subject_status,
       os.slug AS object_slug, os.name AS object_name, os.lifecycle_status AS object_status
FROM relationship r
JOIN device ss ON r.subject_type = 'device' AND r.subject_id = ss.id
JOIN device os ON r.object_type = 'device' AND r.object_id = os.id
WHERE r.predicate IN ('succeeds','precedes','replaced-by','similar-to','variant-of');

-- =============================================================================
-- Registro de la migración: lo gestiona el migrator (packages/data/src/migrator.ts)
-- =============================================================================