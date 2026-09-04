-- =============================================================================
-- NetAtlas — Migración 0003: empresa SNMP del fabricante (sysObjectID base)
-- F2 curación: número de empresa SMI (1.3.6.1.4.1.N) por fabricante para la
-- pestaña Especificaciones. Nullable: solo vendors verificados lo declaran.
-- =============================================================================

ALTER TABLE manufacturer ADD COLUMN snmp_enterprise INTEGER;
