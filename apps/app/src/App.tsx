import React from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
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
import { TopologySheet } from './ui/topology-sheet.js'
import { MapaGlobal } from './ui/mapa-global.js'
import { useCatalogStore } from './viewmodels/catalog-store.js'

export function App(): React.JSX.Element {
  const load = useCatalogStore((s) => s.load)
  React.useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="app-shell">
      <header>
        <nav className="app-nav" aria-label="Navegación principal" data-testid="app-nav">
          <NavLink to="/">NetAtlas</NavLink>
          <NavLink to="/explore">Explorar</NavLink>
          <NavLink to="/catalogos">Catálogos</NavLink>
          <NavLink to="/topologies">Topologías</NavLink>
          <span className="guia-tecnica">Enciclopedia técnica de hardware de redes</span>
        </nav>
      </header>
      <main>
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
          <Route path="/topology/:slug" element={<TopologySheet />} />
          <Route path="/mapa-global" element={<MapaGlobal />} />
        </Routes>
      </main>
    </div>
  )
}