import type { loadSeed } from './lint.js'

/** Dataset seed ya parseado y validado por `loadSeed`. */
export type Seed = ReturnType<typeof loadSeed>
