import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAutocompleteStore, rutaDeSugerencia } from '../viewmodels/autocomplete-store.js'
import { useSearchStore } from '../viewmodels/search-store.js'
import type { Sugerencia } from '../viewmodels/autocomplete-store.js'

/**
 * Caja de búsqueda con autocompletado agrupado (NET-HW-014):
 * sugerencias por tipo (dispositivos, protocolos, estándares, medios,
 * categorías) + búsquedas guardadas persistentes.
 */
export function SearchBox(): React.JSX.Element {
  const navigate = useNavigate()
  const { query, setQuery } = useSearchStore()
  const { sugerencias, guardadas, buscar, guardar, eliminarGuardada } = useAutocompleteStore()
  const [abierto, setAbierto] = React.useState(false)
  const boxRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    void buscar(query)
  }, [query, buscar])

  React.useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    guardar(q)
    setAbierto(false)
    navigate(`/explore?q=${encodeURIComponent(q)}`)
  }

  const irASugerencia = (tipo: string, slug: string): void => {
    setAbierto(false)
    navigate(rutaDeSugerencia(tipo, slug))
  }

  const agrupadas = React.useMemo(() => {
    const map = new Map<string, Sugerencia[]>()
    for (const s of sugerencias) {
      const lista = map.get(s.tipo) ?? []
      lista.push(s)
      map.set(s.tipo, lista)
    }
    return [...map.entries()]
  }, [sugerencias])

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <form role="search" onSubmit={submit} aria-label="Buscar hardware de redes">
        <label htmlFor="busqueda" className="sr-only">
          Buscar dispositivos, protocolos, estándares, medios o fabricantes
        </label>
        <input
          id="busqueda"
          className="search-input"
          type="search"
          placeholder="Ej. +protocolo:bgp +protocolo:ospf · switch 48 puertos · cat:sw"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setAbierto(true)
          }}
          onFocus={() => setAbierto(true)}
          data-testid="busqueda-dashboard"
          aria-expanded={abierto}
          aria-controls="sugerencias"
          aria-autocomplete="list"
        />
        <button type="submit" style={{ marginTop: 8 }}>
          Buscar
        </button>
      </form>

      {abierto && (
        <div
          id="sugerencias"
          role="listbox"
          aria-label="Sugerencias"
          style={{
            position: 'absolute',
            zIndex: 20,
            top: '100%',
            left: 0,
            right: 0,
            maxHeight: 320,
            overflowY: 'auto',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-md)',
            marginTop: 4,
            padding: 8,
          }}
        >
          {agrupadas.length === 0 && guardadas.length === 0 ? (
            <p className="guia-tecnica" style={{ margin: 8 }}>
              Escribe al menos 2 caracteres para sugerencias.
            </p>
          ) : null}

          {agrupadas.map(([tipo, items]) => (
            <div key={tipo} role="group" aria-label={tipo}>
              <p className="guia-tecnica" style={{ margin: '6px 8px 2px', fontWeight: 600 }}>
                {tipo}
              </p>
              {items.map((s) => (
                <button
                  key={`${tipo}:${s.slug}`}
                  type="button"
                  role="option"
                  onClick={() => irASugerencia(tipo, s.slug)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    padding: '6px 8px',
                    cursor: 'pointer',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <span className="mono" style={{ color: 'var(--accent)' }}>{s.slug}</span>
                  <span style={{ marginLeft: 8 }}>{s.label}</span>
                </button>
              ))}
            </div>
          ))}

          {guardadas.length > 0 ? (
            <div role="group" aria-label="Búsquedas guardadas">
              <p className="guia-tecnica" style={{ margin: '6px 8px 2px', fontWeight: 600 }}>
                Búsquedas guardadas
              </p>
              {guardadas.slice(0, 5).map((q) => (
                <div key={q} className="row" style={{ gap: 4 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery(q)
                      setAbierto(false)
                      navigate(`/explore?q=${encodeURIComponent(q)}`)
                    }}
                    style={{
                      flex: 1,
                      textAlign: 'left',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-primary)',
                      padding: '6px 8px',
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <span className="mono">{q}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Eliminar búsqueda guardada ${q}`}
                    onClick={() => eliminarGuardada(q)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}