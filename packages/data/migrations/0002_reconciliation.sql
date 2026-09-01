-- =============================================================================
-- NetAtlas — Migración 0002: reconciliación, calidad y delta/versionado (F6)
-- Fuente normativa: PLAN MAESTRO §19.2-4 (dedup/colon), §19.4 (manifiesto/delta),
--                   NET-HW-045/048. Inmutable; cambios van en 0003_nnn.sql.
-- =============================================================================

-- Cola de reconciliación con diff (§19.2-4, NET-HW-045): candidatos a revisión
-- humana cuando el dedup score está en [0.7, 0.98). El diff lado a lado se
-- guarda como JSON [{campo, entrante, existente}].
CREATE TABLE reconciliation (
  id             INTEGER PRIMARY KEY,
  entrada_slug   TEXT NOT NULL,        -- slug del registro entrante (candidato)
  existente_slug TEXT NOT NULL,        -- slug del dispositivo existente en BD
  score          REAL NOT NULL,        -- dedup score del candidato
  diff_json      TEXT NOT NULL,        -- diff lado a lado
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','accepted','rejected')),
  author         TEXT,                 -- curador/revisor (flujo NET-HW-049)
  created_at     TEXT NOT NULL,
  resolved_at    TEXT
);
CREATE INDEX idx_reconciliation_status ON reconciliation(status);

-- Firma del manifiesto del dataset (par privado de curador; §19.4): guarda la
-- clave pública usada para verificar builds históricos.
CREATE TABLE dataset_signature (
  id            INTEGER PRIMARY KEY,
  public_key_hex TEXT NOT NULL,        -- Ed25519 pública del curador
  label         TEXT,
  created_at    TEXT NOT NULL
);