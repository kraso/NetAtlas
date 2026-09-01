/**
 * Estado compartido del mock de Cytoscape (NET-HW-030).
 * Vive en su propio módulo porque vi.mock() hoistea la factory y necesita una
 * referencia estable; el archivo de setup importa ambos en el orden correcto.
 */
export const cyMockState = {
  calls: [] as unknown[][],
  reset(): void {
    cyMockState.calls.length = 0
  },
}

export default cyMockState