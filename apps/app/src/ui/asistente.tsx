import React from 'react'
import { Link } from 'react-router-dom'
import { useAssistantStore } from '../viewmodels/assistant-store.js'
import type { MensajeChat } from '../viewmodels/assistant-store.js'

/**
 * Asistente IA (F7, §21): chat local-first con citas obligatorias.
 * Feature flag `ai.enabled` OFF por defecto (§21.4): la app es 100%
 * funcional sin IA. Cada afirmación del asistente enlaza a su entidad/fuente.
 */
export function Asistente(): React.JSX.Element {
  const { mensajes, enabled, pensando, activar, desactivar, preguntar, limpiar, sincronizar } = useAssistantStore()
  const [texto, setTexto] = React.useState('')

  React.useEffect(() => {
    sincronizar()
  }, [sincronizar])

  const onSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    void preguntar(texto)
    setTexto('')
  }

  if (!enabled) {
    return (
      <section className="asistente" aria-labelledby="asistente-titulo">
        <h1 id="asistente-titulo">Asistente IA</h1>
        <div className="asistente-apagado" role="status">
          <p>
            La IA está <strong>desactivada</strong> (feature flag <code>ai.enabled</code> off por defecto, §21.4). La
            enciclopedia funciona al 100% sin ella. Cuando la actives, el asistente responderá <em>solo</em> desde la base
            validada con citas obligatorias y nunca inventará especificaciones.
          </p>
          <button type="button" onClick={activar} className="btn">
            Activar asistente local
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="asistente" aria-labelledby="asistente-titulo">
      <div className="asistente-cab">
        <h1 id="asistente-titulo">Asistente IA</h1>
        <div className="asistente-acciones">
          <button type="button" onClick={() => void limpiar()} className="btn-link">
            Limpiar
          </button>
          <button type="button" onClick={desactivar} className="btn-link">
            Desactivar IA
          </button>
        </div>
      </div>
      <p className="asistente-nota">
        Respuestas generadas localmente desde el catálogo verificado; cada afirmación cita su entidad y fuente. Sin
        datos, el asistente lo dice explícitamente.
      </p>

      <div className="asistente-chat" aria-live="polite">
        {mensajes.length === 0 && (
          <p className="asistente-vacio">
            Pregunta en lenguaje natural, por ejemplo: «¿Qué capas cubre Cisco Catalyst 9300?», «¿Cuántos puertos tiene
            el Aruba 2930F?» o «Crea una topología con dos switches y un router».
          </p>
        )}
        {mensajes.map((m) => (
          <MensajeBurbuja key={m.id} mensaje={m} />
        ))}
        {pensando && <p className="asistente-pensando" role="status">Consultando el catálogo…</p>}
      </div>

      <form onSubmit={onSubmit} className="asistente-form">
        <label className="sr-only" htmlFor="asistente-input">Pregunta al asistente</label>
        <input
          id="asistente-input"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Pregunta sobre hardware de redes…"
          autoComplete="off"
        />
        <button type="submit" disabled={texto.trim().length === 0 || pensando} className="btn">
          Preguntar
        </button>
      </form>
    </section>
  )
}

function MensajeBurbuja({ mensaje }: { mensaje: MensajeChat }): React.JSX.Element {
  if (mensaje.rol === 'user') {
    return <div className="bur asistenta-usuario" data-testid="msg-usuario">{mensaje.texto}</div>
  }
  return (
    <div className="bur asistenta-ia" data-testid="msg-asistente">
      <p className="asistente-texto" style={{ whiteSpace: 'pre-line' }}>{mensaje.texto}</p>
      {mensaje.citas && mensaje.citas.length > 0 && (
        <ul className="asistente-citas" aria-label="Citas de la respuesta">
          {mensaje.citas.slice(0, 12).map((c, i) => (
            <li key={`${c.slug}-${i}`}>
              <Link to={`/${c.tipo === 'topology' ? 'topology' : 'device'}/${c.slug}`}>
                {c.etiqueta}
              </Link>
              {c.fuenteSlug ? ` · ${c.fuenteSlug}` : ''}
              {c.afirmacion ? <span className="cita-afirmacion"> — {c.afirmacion}</span> : null}
            </li>
          ))}
        </ul>
      )}
      {mensaje.herramientas && mensaje.herramientas.length > 0 && (
        <details className="asistente-herramientas">
          <summary>Herramientas ejecutadas ({mensaje.herramientas.length})</summary>
          <ul>
            {mensaje.herramientas.map((h, i) => (
              <li key={i}>
                <code>{h.herramienta}</code>
                {h.sinDatos ? ' (sin datos)' : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}