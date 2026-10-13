/**
 * Apoyo común de los tests de UI: reexporta lo que casi todos los ficheros
 * necesitan (React, Vitest, Testing Library, el router de memoria y la
 * composition root). Cada test declara así dos o tres imports en vez de siete
 * (convención de imports, AGENTS.md).
 */
export { default as React } from 'react'
export { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
export { render, screen, fireEvent, within, waitFor, act, cleanup } from '@testing-library/react'
export { MemoryRouter } from 'react-router-dom'
export { App } from '../src/App.js'
export { setServices, buildServices, useServices } from '../src/composition-root.js'
