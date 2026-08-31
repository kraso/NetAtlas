import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@netatlas/ui/tokens.css'
import { App } from './App.js'
import './styles.css'

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