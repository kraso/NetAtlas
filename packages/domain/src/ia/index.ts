/**
 * Módulo IA del dominio (sección 21, F7).
 * Puerto AssistantPort + herramientas + comprensión determinista + RAG con
 * citas + embeddings locales + generación de topologías + evaluador de oro.
 */
export type { AssistantPort, PreguntaIA, RespuestaIA, CitaIA, HerramientaIA, LlamadaHerramienta, ResultadoHerramienta } from './assistant.js'
export { HERRAMIENTAS, herramientaPorNombre, esLlamadaValida } from './tools.js'
export type { ToolContext } from './tools.js'
export { comprender, normalizar, detectarSlug, extraerVelocidadMbps, textoSinRuido } from './comprender.js'
export type { EscenarioIA, PlanIA } from './comprender.js'
export { contextoVacio, citaDeHecho, fraseDeHecho, responderConContexto, verificarAlucinaciones, slugsCitados } from './rag.js'
export type { HechoIA, ContextoRecuperado } from './rag.js'
export { IndiceVectorialTFIDF, tokenizar, rankingHibrido } from './embeddings.js'
export type { EntidadVectorizable, VectorTFIDF, HitLexico, HitHibrido } from './embeddings.js'
export { extraerRoles, parsearSpec, validarSpecJSON, generarTopologia, capaDeRol, ROLES_CONOCIDOS } from './topologia.js'
export type { RolRequerido, TopologiaSpec, GeneradorContexto, TopologiaGenerada } from './topologia.js'
export { evaluarConjuntoOro, hechosDeRespuesta, cubreHechosEsperados, umbralDepliegue } from './evaluador.js'
export type { HechoEsperado, PreguntaOro, OracleHechos, HechoAfirmado, EvalResultado } from './evaluador.js'
export { crearClienteIA, ejecutarPlan, contextoDesdeResultados } from './cliente.js'
export type { ClienteIAOptions } from './cliente.js'
export { crearComprenderLLM } from './comprender-llm.js'
export type { ComprenderLLMOptions } from './comprender-llm.js'