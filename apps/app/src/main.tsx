import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import '@netatlas/ui/tokens.css'
import { App } from './App.js'
import './styles.css'

// Service Worker de la PWA (NET-HW-051): registro + auto-update.
// offline-first: tras la primera carga, la app funciona 100% sin red.
registerSW({ immediate: true })

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('No se encontró #root')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)