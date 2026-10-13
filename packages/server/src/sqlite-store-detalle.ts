import type {
  AfirmacionRow,
  CapaRow,
  DefinicionRow,
  DispositivoRow,
  EstandarRow,
  FabricanteRow,
  FichaRow,
  FuenteRow,
  ImagenRow,
  MedioRow,
  ProtocoloRow,
  PuertoRow,
  RelacionRow,
  ValorRow,
} from './sqlite-snapshot-tipos.js'
import {
  SQL_AFIRMACIONES,
  SQL_CAPAS,
  SQL_DEFINICIONES,
  SQL_DISPOSITIVOS,
  SQL_ESTANDARES,
  SQL_FABRICANTES,
  SQL_FICHAS,
  SQL_FUENTES,
  SQL_IMAGENES,
  SQL_MEDIOS,
  SQL_PROTOCOLOS,
  SQL_PUERTOS,
  SQL_RELACIONES,
  SQL_VALORES,
} from './sqlite-snapshot-sql.js'
import { construirSnapshotDetail } from './sqlite-snapshot-mapeo.js'
import type { SqlExecutor, SnapshotDetail } from './store.js'
import { EMPTY_SNAPSHOT_DETAIL } from './store.js'

/**
 * Detalle por dispositivo para la ficha UI sin N+1 (F8B-detalle): ejecuta las
 * consultas del snapshot y arma el `SnapshotDetail` con el mapeo puro.
 */
export async function consultarDetalle(executor: SqlExecutor, since: number, version: number): Promise<SnapshotDetail> {
  if (since >= version) return EMPTY_SNAPSHOT_DETAIL

  const [dispositivos, puertos, relaciones, valores, definiciones, afirmaciones, fuentes, fichas, imagenes, protocolos, estandares, medios, capas, fabricantes] =
    await Promise.all([
      executor.query<DispositivoRow>(SQL_DISPOSITIVOS),
      executor.query<PuertoRow>(SQL_PUERTOS),
      executor.query<RelacionRow>(SQL_RELACIONES),
      executor.query<ValorRow>(SQL_VALORES),
      executor.query<DefinicionRow>(SQL_DEFINICIONES),
      executor.query<AfirmacionRow>(SQL_AFIRMACIONES),
      executor.query<FuenteRow>(SQL_FUENTES),
      executor.query<FichaRow>(SQL_FICHAS),
      executor.query<ImagenRow>(SQL_IMAGENES),
      executor.query<ProtocoloRow>(SQL_PROTOCOLOS),
      executor.query<EstandarRow>(SQL_ESTANDARES),
      executor.query<MedioRow>(SQL_MEDIOS),
      executor.query<CapaRow>(SQL_CAPAS),
      executor.query<FabricanteRow>(SQL_FABRICANTES),
    ])

  return construirSnapshotDetail({
    dispositivos, puertos, relaciones, valores, definiciones, afirmaciones,
    fuentes, fichas, imagenes, protocolos, estandares, medios, capas, fabricantes,
  })
}
