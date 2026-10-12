import React from 'react'
import { Link } from 'react-router-dom'
import { BarraComparar, Breadcrumbs, InformeComparacion } from './comparar-piezas.js'
import { useComparador } from './comparar-hooks.js'

/**
 * Comparador de dispositivos (F5 / §18, NET-HW-040/041/042).
 *  - Selección 2–N dispositivos (querystring ids=… o a/b retrocompatibles)
 *  - Tabla por atributos EAV (comunes primero), modo "solo diferencias",
 *    insignias ▲/▼ de mejor valor/limitación, filas plegables
 *  - Compatibilidades curadas + incompatibilidades declarativas (041)
 *  - Veredicto por plantilla determinista del dominio (sin IA)
 *  - Aviso de comparación transversal (§18.4)
 *  - Exportación CSV (real) y PDF vía imprimir del navegador (042)
 *
 * La orquestación vive en el caso de uso compartido `compareDevicesUseCase`
 * (packages/application) y el estado en `useComparador`; esta vista solo proyecta.
 */

export function Comparar(): React.JSX.Element {
  const c = useComparador()

  return (
    <section aria-labelledby="titulo-comparar">
      <Breadcrumbs items={[{ label: 'Dashboard', to: '/' }, { label: 'Explorar', to: '/explore' }, { label: 'Comparación' }]} />
      <h1 id="titulo-comparar">Comparación de dispositivos</h1>

      <BarraComparar
        busqueda={c.busqueda}
        onBusqueda={c.onBusqueda}
        sugerencias={c.sugerencias}
        onAñadir={c.onAñadir}
        onExportarCsv={c.onExportarCsv}
        onExportarPdf={c.onExportarPdf}
        onCopiarEnlace={c.onCopiarEnlace}
        enlaceCopiado={c.enlaceCopiado}
        reporteListo={c.report !== null}
        etiquetaUrl={c.etiquetaUrl}
        enlaceVerificado={c.enlaceVerificado}
      />

      {c.fallo ? (
        <p role="alert">No se pudo calcular la comparación. Vuelve a intentarlo desde el explorador.</p>
      ) : c.cargando ? (
        <p role="status">Cargando comparación…</p>
      ) : c.report === null ? (
        <p className="empty-state">
          El comparador necesita al menos dos dispositivos. Selecciónalos desde el{' '}
          <Link to="/explore">explorador</Link> (casillas + «Comparar seleccionados») o desde una ficha
          («Comparar desde aquí»).
        </p>
      ) : (
        <InformeComparacion
          report={c.report}
          soloDiferencias={c.soloDiferencias}
          onSoloDiferencias={c.onToggleSoloDiferencias}
          expandidas={c.expandidas}
          onToggleFila={c.onToggleFila}
          onQuitar={c.onQuitar}
        />
      )}
    </section>
  )
}