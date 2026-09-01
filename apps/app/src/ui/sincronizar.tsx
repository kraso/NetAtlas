import React from 'react'
import { Link } from 'react-router-dom'
import { useSyncStore } from '../viewmodels/sync-store.js'
import { Breadcrumbs } from './breadcrumbs.js'

/**
 * Sincronización (F8A, §23.4[3]): cola outbox local + réplica + ciclo de sync
 * contra el servidor. Sin red, la cola permanece y se sincroniza al recuperar
 * la red (criterio F8A). La PWA demo usa adaptadores in-memory (localStorage)
 * con el mismo contrato del dominio que el modo SQLite real.
 */
export function Sincronizar(): React.JSX.Element {
  const { serverUrl, token, outbox, replicaCount, ultimoResultado, error, pensando, setServerUrl, setToken, encolar, sincronizarAhora, refrescar } = useSyncStore()
  const [entidad, setEntidad] = React.useState('device:cisco-c9300-48p')

  React.useEffect(() => {
    refrescar()
  }, [refrescar])

  return (
    <section aria-labelledby="titulo-sincronizar">
      <Breadcrumbs items={[{ label: 'Dashboard', to: '/' }, { label: 'Sincronización' }]} />
      <h1 id="titulo-sincronizar">Sincronización</h1>
      <p className="guia-tecnica">
        La app funciona offline: las contribuciones se encolan localmente y se sincronizan cuando hay red
        (outbox + réplica, §23.4[3]).
      </p>

      <fieldset className="card" aria-label="Servidor" style={{ margin: 0 }}>
        <legend style={{ fontSize: 'var(--font-size-xs)', padding: '0 4px' }}>Servidor</legend>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <label className="sr-only" htmlFor="server-url">URL del servidor</label>
          <input
            id="server-url"
            className="search-input"
            style={{ flex: 1, minWidth: 260 }}
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="http://127.0.0.1:8787"
            data-testid="server-url"
          />
          <label className="sr-only" htmlFor="server-token">Token (opcional)</label>
          <input
            id="server-token"
            className="search-input"
            style={{ flex: 1, minWidth: 220 }}
            value={token ?? ''}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Token de sincronización (opcional)"
            data-testid="server-token"
            type="password"
          />
          <button type="button" onClick={() => void sincronizarAhora()} disabled={pensando} data-testid="sync-ahora">
            {pensando ? 'Sincronizando…' : 'Sincronizar ahora'}
          </button>
        </div>
        {ultimoResultado ? (
          <p className="guia-tecnica" role="status" data-testid="sync-resultado">
            Replicados: {ultimoResultado.replicados} · versión réplica {ultimoResultado.versionReplica} ·
            enviadas {ultimoResultado.contribucionesEnviadas} · pendientes {ultimoResultado.contribucionesPendientes}
          </p>
        ) : null}
        {error ? (
          <p className="empty-state" role="alert" data-testid="sync-error">
            {error} — la cola local queda intacta para el siguiente intento.
          </p>
        ) : null}
      </fieldset>

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <fieldset className="card" aria-label="Cola local (outbox)" style={{ margin: 0, flex: 1 }}>
          <legend style={{ fontSize: 'var(--font-size-xs)', padding: '0 4px' }}>
            Cola local — {outbox.length} pendiente{outbox.length === 1 ? '' : 's'}
          </legend>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <label className="sr-only" htmlFor="entidad-nota">Entidad</label>
            <input
              id="entidad-nota"
              className="search-input"
              style={{ flex: 1, minWidth: 220 }}
              value={entidad}
              onChange={(e) => setEntidad(e.target.value)}
              placeholder="device:cisco-c9300-48p"
              data-testid="entidad-nota"
            />
            <button
              type="button"
              onClick={() => void encolar('nota', entidad.trim(), { nota: 'Revisar alimentación PoE' })}
              data-testid="encolar-nota"
            >
              Encolar nota de revisión
            </button>
          </div>
          {outbox.length === 0 ? (
            <p className="guia-tecnica" data-testid="cola-vacia" role="status">Sin contribuciones pendientes.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
              {outbox.map((e) => (
                <li key={e.id} className="mono guia-tecnica" data-testid="cola-item" style={{ padding: '2px 0' }}>
                  {e.tipo} · {e.entidad} · rev {e.revision}
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        <fieldset className="card" aria-label="Réplica local" style={{ margin: 0 }}>
          <legend style={{ fontSize: 'var(--font-size-xs)', padding: '0 4px' }}>Réplica local</legend>
          <p className="guia-tecnica" data-testid="replica-count" role="status">
            {replicaCount} dispositivos replicados del servidor
          </p>
          {replicaCount > 0 ? (
            <p className="guia-tecnica">
              El catálogo consultable ya incluye la réplica (misma interfaz que v1 local, §6.7).
            </p>
          ) : (
            <p className="guia-tecnica">Aún sin réplica: sincroniza para descargar el snapshot.</p>
          )}
        </fieldset>
      </div>

      <p className="guia-tecnica">
        Ver el flujo del lado servidor en <Link to="/calidad">Calidad</Link>.
      </p>
    </section>
  )
}