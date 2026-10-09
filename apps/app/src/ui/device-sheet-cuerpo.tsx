import React from 'react'
import { TablistFicha } from './device-sheet-partes.js'
import { PestanaContent } from './device-sheet-pestanas.js'
import { PanelContextual } from './device-sheet-panel.js'

interface PropsCuerpo {
  readonly device: import('@netatlas/domain').Device
  readonly pestaña: string
  readonly setPestaña: (id: string) => void
}

/** Cuerpo de la ficha: tablist, panel de la pestaña activa y panel contextual. */
export function CuerpoFicha({ device, pestaña, setPestaña }: PropsCuerpo): React.JSX.Element {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 24 }}>
      <div>
        <TablistFicha pestaña={pestaña} setPestaña={setPestaña} />
        <div id={`panel-${pestaña}`} role="tabpanel" aria-labelledby={`tab-${pestaña}`}>
          <PestanaContent device={device} pestaña={pestaña} />
        </div>
      </div>
      <PanelContextual device={device} />
    </div>
  )
}
