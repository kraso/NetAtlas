import React from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { Dashboard } from './ui/dashboard.js'
import { Explore } from './ui/explore.js'
import { DeviceSheet } from './ui/device-sheet.js'
import { ProtocolSheet } from './ui/protocol-sheet.js'
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
          <span className="guia-tecnica">Enciclopedia técnica de hardware de redes</span>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/device/:slug" element={<DeviceSheet />} />
          <Route path="/protocolo/:code" element={<ProtocolSheet />} />
        </Routes>
      </main>
    </div>
  )
}