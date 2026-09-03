import React from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { useCatalogStore } from './viewmodels/catalog-store.js'
import { warmezaHttpSiDisponible, useServices } from './composition-root.js'
import { Dashboard } from './ui/dashboard.js'
import { Explore } from './ui/explore.js'
import { DeviceSheet } from './ui/device-sheet.js'
import { ProtocolSheet } from './ui/protocol-sheet.js'
import { StandardSheet } from './ui/standard-sheet.js'
import { MediumSheet } from './ui/medium-sheet.js'
import { CatalogExplorer } from './ui/catalog-explorer.js'
import { ManufacturerSheet } from './ui/manufacturer-sheet.js'
import { Glossary, GlossaryTermSheet } from './ui/glossary.js'
import { Comparar } from './ui/comparar.js'
import { Topologias } from './ui/topologies.js'
import { Calidad } from './ui/calidad.js'
import { Asistente } from './ui/asistente.js'
import { Sincronizar } from './ui/sincronizar.js'

// Las vistas con Cytoscape se cargan bajo demanda (solo-diferencias de la
// fase): cytoscape + cytoscape-svg quedan fuera del chunk inicial de la app.
const TopologySheet = React.lazy(() => import('./ui/topology-sheet.js').then((m) => ({ default: m.TopologySheet })))
const MapaGlobal = React.lazy(() => import('./ui/mapa-global.js').then((m) => ({ default: m.MapaGlobal })))

const Suspense = React.Suspense

export function App(): React.JSX.Element {
  const load = useCatalogStore((s) => s.load)
  const revision = useServices((s) => s.revision)
  React.useEffect(() => {
    void load()
  }, [])
  // Cuando el warmezo HTTP reemplaza services (demo→330), refresca el catálogo.
  React.useEffect(() => {
    if (revision > 0) void load(true)
  }, [revision])
  React.useEffect(() => {
    void warmezaHttpSiDisponible()
  }, [])

  return (
    <div className="app-shell">
      <header>
        <nav className="app-nav" aria-label="Navegación principal" data-testid="app-nav">
          <NavLink to="/">NetAtlas</NavLink>
          <NavLink to="/explore">Explorar</NavLink>
          <NavLink to="/catalogos">Catálogos</NavLink>
          <NavLink to="/topologies">Topologías</NavLink>
          <NavLink to="/asistente">Asistente</NavLink>
          <NavLink to="/sincronizar">Sync</NavLink>
          <NavLink to="/calidad">Calidad</NavLink>
          <span className="guia-tecnica">Enciclopedia técnica de hardware de redes</span>
        </nav>
      </header>
      <main>
        <Suspense fallback={<p role="status">Cargando vista…</p>}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/catalogos" element={<CatalogExplorer />} />
            <Route path="/device/:slug" element={<DeviceSheet />} />
            <Route path="/protocolo/:code" element={<ProtocolSheet />} />
            <Route path="/estandar/:org/:identifier" element={<StandardSheet />} />
            <Route path="/medio/:code" element={<MediumSheet />} />
            <Route path="/fabricante/:slug" element={<ManufacturerSheet />} />
            <Route path="/glosario" element={<Glossary />} />
            <Route path="/glosario/:slug" element={<GlossaryTermSheet />} />
            <Route path="/comparar" element={<Comparar />} />
            <Route path="/topologies" element={<Topologias />} />
            <Route path="/calidad" element={<Calidad />} />
            <Route path="/asistente" element={<Asistente />} />
            <Route path="/sincronizar" element={<Sincronizar />} />
            <Route path="/topology/:slug" element={<TopologySheet />} />
            <Route path="/mapa-global" element={<MapaGlobal />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  )
}