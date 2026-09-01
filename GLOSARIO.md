# Glosario de Términos de Desarrollo de Software

Glosario alfabetizado y categorizado de términos, acrónimos y jerga usados en el desarrollo de software. La organización es por área temática para facilitar la consulta.

## Índice

- [Arquitectura y Diseño](#arquitectura-y-diseño)
- [Bases de Datos y Datos](#bases-de-datos-y-datos)
- [Control de Versiones](#control-de-versiones)
- [Frontend y Web](#frontend-y-web)
- [Backend y Servidores](#backend-y-servidores)
- [Ingeniería de Datos y ETL](#ingeniería-de-datos-y-etl)
- [Concurrencia y Sistemas Distribuidos](#concurrencia-y-sistemas-distribuidos)
- [Rendimiento y Optimización](#rendimiento-y-optimización)
- [Lenguajes y Compilación](#lenguajes-y-compilación)
- [Redes y Protocolos](#redes-y-protocolos)
- [Seguridad](#seguridad)
- [Testing y Calidad](#testing-y-calidad)
- [Metodologías y Procesos](#metodologías-y-procesos)
- [Operaciones y DevOps](#operaciones-y-devops)
- [Acrónimos y Abreviaturas Comunes](#acrónimos-y-abreviaturas-comunes)
- [Términos Generales](#términos-generales)

---

## Arquitectura y Diseño

| Término | Significado |
|---------|-------------|
| **ACID** | Atomicity, Consistency, Isolation, Durability. Conjunto de propiedades que garantizan la fiabilidad de transacciones en bases de datos. |
| **API** | Application Programming Interface. Conjunto de reglas y definiciones que permite que dos aplicaciones se comuniquen entre sí. |
| **Arquitectura hexagonal** | Patrón de diseño en el que la lógica de negocio (núcleo) es independiente de las tecnologías externas (bases de datos, frameworks, etc.), conectadas mediante "puertos y adaptadores". |
| **Arquitectura limpia (Clean Architecture)** | Estilo de arquitectura que separa el código en capas concéntricas (entidades, casos de uso, adaptadores) con dependencias apuntando siempre hacia adentro. |
| **Arquitectura de microservicios** | Estilo donde la aplicación se divide en servicios pequeños e independientes que se comunican mediante APIs. |
| **Arquitectura monolítica** | Aplicación construida como una sola unidad desplegable en la que todos los módulos comparten el mismo proceso. |
| **Caché** | Almacenamiento temporal de datos de acceso frecuente para reducir latencia y carga del sistema. |
| **Capas (layers)** | División lógica del software en niveles (presentación, lógica de negocio, acceso a datos) con responsabilidades diferenciadas. |
| **CAS (Compare And Swap)** | Operación atómica que compara un valor y lo intercambia si coincide, usada en programación concurrente sin bloqueos. |
| **CQRS** | Command Query Responsibility Segregation. Patrón que separa las operaciones de escritura (commands) de las de lectura (queries). |
| **DAO** | Data Access Object. Patrón que encapsula el acceso a datos, separando la lógica de negocio de la capa de persistencia. |
| **DDD** | Domain-Driven Design. Enfoque que prioriza el modelado del dominio del negocio como base del diseño del software. |
| **DTO** | Data Transfer Object. Objeto que transporta datos entre capas o procesos, sin lógica de negocio. |
| **Event-Driven Architecture** | Arquitectura en la que los componentes se comunican mediante la emisión y consumo de eventos. |
| **Hexagonal** | Ver *Arquitectura hexagonal*. |
| **Inversión de dependencias (DIP)** | Principio SOLID: depender de abstracciones y no de implementaciones concretas. |
| **KISS** | Keep It Simple, Stupid. Principio que favorece la simplicidad sobre la complejidad innecesaria. |
| **Layered Architecture** | Ver *Capas*. |
| **MVC** | Model-View-Controller. Patrón que separa la lógica (modelo), la interfaz (vista) y la entrada de usuario (controlador). |
| **MVP** | Model-View-Presenter. Variación de MVC donde el presentador maneja la lógica de presentación. |
| **MVVM** | Model-View-ViewModel. Patrón en el que la vista se enlaza automáticamente (binding) a un ViewModel que expone la lógica de presentación. |
| **Patrón de diseño** | Solución general y reutilizable para problemas recurrentes en el diseño de software. |
| **Principios SOLID** | Conjunto de cinco principios de diseño orientado a objetos: Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation y Dependency Inversion. |
| **Proxy** | Objeto o servidor intermediario que controla el acceso a otro objeto o servicio. |
| **Repo (repositorio)** | En arquitectura: capa que abstrae el acceso a datos y presenta una colección en memoria. En versionado: ver *Control de Versiones*. |
| **Servicio** | Unidad lógica que expone funcionalidad de negocio de forma acoplada o reutilizable. |
| **Singleton** | Patrón que garantiza una única instancia de una clase en todo el programa. |
| **Slug** | Cadena legible y normalizada (minúsculas, sin acentos, guiones en vez de espacios) usada en URLs para identificar recursos, por ejemplo `mi-primer-post`. |
| **SPA** | Single Page Application. Aplicación web que se ejecuta en una sola página actualizando dinámicamente el contenido sin recargas completas. |
| **SSR** | Server-Side Rendering. Renderizado del HTML en el servidor antes de enviarlo al cliente. |
| **SSG** | Static Site Generation. Generación de páginas estáticas en tiempo de compilación. |
| **Stateful / Stateless** | Con estado / sin estado. Indica si un servicio o componente conserva información entre peticiones. |
| **Wrapper** | Código que envuelve otro componente para adaptar su interfaz, añadir comportamiento o simplificar su uso. |
| **Backpressure** | Mecanismo de control de flujo que reduce la velocidad de producción cuando el consumidor no puede seguir el ritmo. |
| **Bulkhead (mamparo)** | Patrón que aísla recursos (hilos, conexiones) por consumidor para que el fallo de uno no degrade a los demás. |
| **Circuit breaker** | Patrón de tolerancia a fallos: tras N errores consecutivos, "abre el circuito" y devuelve fallo rápido sin llamar al servicio, con reintentos de recuperación. |
| **Event sourcing** | Persistir el estado de un sistema como secuencia inmutable de eventos que se puede reproducir. |
| **Eventual consistency** | Consistencia eventual: los nodos distribuidos convergen al estado final tras un periodo sin garantizar consistencia inmediata. |
| **Feature flag (feature toggle)** | Conmutador en código que activa o desactiva funcionalidades sin desplegar, permitiendo lanzamientos graduales y reversión instantánea. |
| **Graceful degradation** | Degradación elegante: ante fallos, el sistema continúa funcionando con funcionalidad reducida en vez de caer por completo. |
| **N-tier architecture** | Arquitectura en N capas físicas (presentación, aplicación, datos) que se despliegan en niveles separados. |
| **Outbox pattern** | Patrón para publicar eventos de forma fiable: la operación de negocio y el evento se guardan en una misma transacción y un publicador los reenvía. |
| **Service mesh** | Capa de infraestructura (sidecar) que gestiona la comunicación entre microservicios: descubrimiento, balanceo, TLS, observabilidad. |
| **Sidecar** | Contenedor auxiliar que acompaña a la aplicación principal en el mismo pod para tareas de red, logs o proxy. |
| **Strangler pattern** | Migración incremental: sustituir un sistema legacy pieza a pieza hasta que el nuevo lo reemplaza por completo. |
| **Two-phase commit (2PC)** | Protocolo para coordinar transacciones distribuidas en dos fases (preparar y confirmar/abortar) garantizando atomicidad. |
| **CAP theorem** | Teorema de consistencia, disponibilidad y tolerancia a particiones: un sistema distribuido solo puede garantizar dos de tres. |
| **PACELC** | Extensión del teorema CAP: si hay partición, priorizar consistencia (C) o disponibilidad (A); si no, priorizar latencia (L) o consistencia (C). |
| **Eventual / Strong consistency** | Ver *Eventual consistency*: modelo de consistencia débil vs. consistencia fuerte (lecturas siempre ven la última escritura). |
| **Idempotencia de endpoints** | Capacidad de un endpoint de responder igual ante peticiones repetidas, evitando efectos duplicados (clave de idempotencia). |

---

## Bases de Datos y Datos

| Término | Significado |
|---------|-------------|
| **Base de datos relacional** | Base de datos que organiza los datos en tablas con relaciones entre ellas (por ejemplo, MySQL, PostgreSQL). |
| **Base de datos NoSQL** | Base de datos no relacional orientada a documentos, grafos, columnas o clave-valor (por ejemplo, MongoDB, Redis). |
| **Cluster** | Conjunto de servidores o instancias que trabajan juntos para alta disponibilidad y escalabilidad. |
| **CRUD** | Create, Read, Update, Delete. Operaciones básicas de persistencia de datos. |
| **Denormalización** | Introducción deliberada de redundancia para optimizar consultas de lectura a costa de consistencia. |
| **DML** | Data Manipulation Language. Sentencias SQL para manipular datos: INSERT, UPDATE, DELETE, SELECT. |
| **DDL** | Data Definition Language. Sentencias SQL para definir la estructura: CREATE, ALTER, DROP. |
| **ERD** | Entity-Relationship Diagram. Diagrama que representa entidades y sus relaciones. |
| **FK** | Foreign Key (Clave Foránea). Campo que referencia la clave primaria de otra tabla para establecer una relación. |
| **Índice** | Estructura de datos (normalmente B-tree) que acelera las búsquedas en una tabla. |
| **Join** | Operación SQL que combina filas de dos o más tablas según una condición. |
| **Migration** | Script que versiona y aplica cambios de esquema de base de datos de forma controlada. |
| **Normalización** | Proceso de organizar los datos para eliminar redundancia y dependencias anómalas. |
| **NoSQL** | Ver *Base de datos NoSQL*. |
| **ORM** | Object-Relational Mapping. Técnica/libro que mapea tablas de base de datos a objetos del lenguaje (por ejemplo, Hibernate, SQLAlchemy, Prisma). |
| **PK** | Primary Key (Clave Primaria). Campo o combinación que identifica de forma única cada fila. |
| **Query** | Consulta. Petición de datos a una base de datos, normalmente en SQL. |
| **Redis** | Almacén de datos en memoria (key-value) usado como caché o cola de mensajes. |
| **Replicación** | Copia de datos de un servidor a otro para redundancia o lectura distribuida. |
| **Sharding** | Partición horizontal de una base de datos en múltiples servidores (shards). |
| **Schema** | Esquema. Estructura que define tablas, campos, tipos y restricciones de una base de datos. |
| **SQL** | Structured Query Language. Lenguaje estándar para gestionar bases de datos relacionales. |
| **Transacción** | Unidad atómica de trabajo sobre la base de datos que se ejecuta completamente o se revierte. |
| **Upsert** | Operación que inserta un registro o lo actualiza si ya existe. |
| **View** | Vista. Consulta guardada que se comporta como una tabla virtual. |
| **WAL** | Write-Ahead Log. Registro de escrituras previo a la aplicación de cambios, usado para durabilidad y recuperación. |
| **ODBC** | Open Database Connectivity. Estándar de API para acceder a bases de datos. |
| **CDC** | Change Data Capture. Captura de cambios: técnica que detecta y propaga inserciones, actualizaciones y borrados de una base de datos en tiempo real. |
| **Snapshot isolation** | Aislamiento por instantáneas: cada transacción ve una fotografía consistente de los datos, evitando lecturas sucias. |
| **Concurrency control** | Control de concurrencia: mecanismos (bloqueos, MVCC) que garantizan ejecuciones correctas de transacciones simultáneas. |
| **MVCC** | Multi-Version Concurrency Control. Control de concurrencia multiversión: lecturas ven versiones históricas sin bloquear escrituras. |
| **Gap lock / Next-key lock** | Bloqueos de rangos en índices que evitan inserciones fantasma en InnoDB. |

---

## Control de Versiones

| Término | Significado |
|---------|-------------|
| **Branch** | Rama. Línea independiente de desarrollo dentro de un repositorio. |
| **Cherry-pick** | Operación de git que aplica un commit concreto de otra rama a la rama actual. |
| **Clone** | Copia local de un repositorio remoto. |
| **Commit** | Confirmación: guarda un conjunto de cambios de forma permanente en el historial. |
| **Conflict** | Conflicto que ocurre cuando dos cambios incompatibles se fusionan en la misma zona. |
| **Diff** | Diferencia entre dos versiones de archivos o del repositorio. |
| **Fetch** | Descarga los cambios del remoto sin aplicarlos a la rama de trabajo. |
| **Fork** | Copia independiente de un repositorio, generalmente para contribuir a proyectos ajenos. |
| **Git** | Sistema de control de versiones distribuido más usado. |
| **GitHub / GitLab / Bitbucket** | Plataformas que alojan repositorios git con funciones de colaboración. |
| **Hash / SHA** | Identificador único (normalmente SHA-1) de un commit. |
| **HEAD** | Referencia al commit actualmente posicionado en el repositorio. |
| **Merge** | Fusión de los cambios de una rama en otra. |
| **Pull** | Descarga los cambios del remoto y los integra en la rama local (`fetch` + `merge`). |
| **Pull Request (PR)** | Solicitud de integración de los cambios de una rama en otra, con revisión de código previa. |
| **Push** | Sube los commits locales al repositorio remoto. |
| **Rebase** | Reaplica los commits de una rama sobre la base de otra, reescribiendo el historial. |
| **Repo** | Abreviatura de repositorio: espacio donde se almacena el código y su historial. |
| **Staging area** | Área de preparación donde se marcan los cambios que formarán parte del próximo commit. |
| **Stash** | Guarda temporal de cambios sin commitear para limpiar el área de trabajo. |
| **SVN** | Subversion. Sistema de control de versiones centralizado, hoy en desuso frente a git. |
| **Tag** | Etiqueta inmutable que marca un punto del historial, típicamente para releases. |
| **VCS** | Version Control System. Sistema de control de versiones. |

---

## Frontend y Web

| Término | Significado |
|---------|-------------|
| **Accessibility (a11y)** | Accesibilidad: diseño y desarrollo de interfaces utilizables por personas con discapacidades. |
| **Asset** | Recurso estático de una web: imágenes, CSS, JS, fuentes, etc. |
| **Bundler** | Herramienta que combina múltiples archivos en paquetes optimizados (por ejemplo, webpack, Vite). |
| **BEM** | Block, Element, Modifier. Convención de nomenclatura de clases CSS. |
| **CDN** | Content Delivery Network. Red de servidores distribuidos que sirve contenido estático cerca del usuario. |
| **CLS** | Cumulative Layout Shift. Métrica de Core Web Vitals que mide desplazamientos inesperados del layout. |
| **CSS** | Cascading Style Sheets. Lenguaje para dar estilo a documentos HTML. |
| **DOM** | Document Object Model. Representación en memoria de la estructura de una página web manipulable con JS. |
| **Event Loop** | Mecanismo de JavaScript que gestiona la ejecución asíncrona de tareas. |
| **Flexbox / Grid** | Sistemas de layout de CSS para disposición de elementos. |
| **FOUC** | Flash Of Unstyled Content. Parpadeo de contenido sin estilos al cargar una página. |
| **HTML** | HyperText Markup Language. Lenguaje de marcado que estructura el contenido web. |
| **Hydration** | Proceso de conectar el HTML renderizado en el servidor con los manejadores de eventos de JavaScript. |
| **i18n** | Internationalization. Internacionalización: preparación del software para múltiples idiomas. |
| **Inlining** | Incrustación de CSS/JS directamente en el HTML para reducir peticiones. |
| **LCP** | Largest Contentful Paint. Métrica de Core Web Vitals sobre el renderizado del contenido principal. |
| **Lighthouse** | Herramienta de Google para auditar rendimiento, accesibilidad y SEO de una web. |
| **Minificación** | Eliminación de espacios, comentarios y caracteres innecesarios de código para reducir tamaño. |
| **Prettier / ESLint** | Formateadores y linters que unifican el estilo del código. |
| **Progressive Web App (PWA)** | Web con capacidades de app nativa: instalable, offline y con notificaciones. |
| **React / Vue / Angular / Svelte** | Frameworks/librerías de JavaScript para construir interfaces de usuario. |
| **Responsive design** | Diseño que se adapta a distintos tamaños de pantalla. |
| **SEO** | Search Engine Optimization. Optimización para buscadores. |
| **Semantic HTML** | Uso de etiquetas HTML con significado (header, nav, article) en lugar de divs genéricos. |
| **Shadow DOM** | DOM encapsulado que aísla el estilo y comportamiento de un componente web. |
| **SPA** | Ver *Arquitectura y Diseño*. |
| **Sprite** | Imagen única que agrupa varios iconos para reducir peticiones HTTP. |
| **Transpilación** | Conversión de código a otra versión equivalente (por ejemplo, TypeScript a JavaScript). |
| **Tree shaking** | Eliminación de código no utilizado durante el empaquetado. |
| **TypeScript** | Superset de JavaScript con tipado estático opcional. |
| **Webpack / Vite** | Ver *Bundler*. |
| **WebSocket** | Protocolo de comunicación bidireccional y persistente entre cliente y servidor. |
| **XHR** | XMLHttpRequest. API antigua para peticiones HTTP asíncronas desde el navegador. |
| **Locator** | Expresión (CSS selector, XPath, rol) que identifica un elemento del DOM para interactuar con él en pruebas E2E o scraping. |
| **Code splitting** | División del bundle en trozos que se cargan bajo demanda, reduciendo el tiempo de carga inicial. |
| **Design system** | Colección de componentes, tokens y guías que estandarizan la construcción de interfaces de una organización. |
| **Design token** | Variable de diseño (color, tipografía, espaciado) que parametriza los estilos para mantener consistencia. |
| **Headless CMS** | Sistema de gestión de contenidos que entrega contenido vía API sin imponer el frontend. |
| **Micro-frontend** | Estilo de arquitectura que divide el frontend en piezas independientes desarrolladas y desplegadas por separado. |
| **Service worker** | Script que el navegador ejecuta en segundo plano permitiendo offline, cacheado y notificaciones push. |
| **Web worker** | Hilo de JavaScript en segundo plano que permite ejecutar tareas pesadas sin bloquear la UI. |
| **Islands architecture** | Renderizado por "islas": partes hidratables e interactivas dentro de una página mayormente estática. |
| **Cache busting** | Estrategia para forzar la descarga de nuevos assets añadiendo un hash a su URL. |
| **Above the fold** | Contenido visible sin hacer scroll; optimizar su carga crítica mejora LCP y percepciones de velocidad. |

---

## Backend y Servidores

| Término | Significado |
|---------|-------------|
| **API Gateway** | Punto único de entrada que enruta, autentica y limita las peticiones hacia microservicios. |
| **Background job** | Tarea que se ejecuta en segundo plano fuera del flujo principal de la petición. |
| **Carga (payload)** | Datos enviados en una petición o respuesta HTTP. |
| **Concurrencia** | Capacidad de ejecutar múltiples tareas de forma simultánea o entrelazada. |
| **Deadlock** | Bloqueo mutuo: dos procesos esperan recursos que el otro mantiene, deteniéndose ambos. |
| **Garbage Collector (GC)** | Mecanismo que libera automáticamente la memoria de objetos no utilizados. |
| **HATEOAS** | Hypermedia As The Engine Of Application State. Principio REST que incluye enlaces en las respuestas. |
| **JWT** | JSON Web Token. Token autenticado y firmado para sesiones sin estado. |
| **Middleware** | Software o función que procesa peticiones antes de llegar al handler final. |
| **Monorepo** | Repositorio único que alberga múltiples proyectos o paquetes relacionados. |
| **Multithreading** | Ejecución de varios hilos (threads) dentro de un mismo proceso. |
| **Race condition** | Condición de carrera: resultado impredecible cuando varios procesos compiten por el mismo recurso sin sincronización. |
| **REST** | Representational State Transfer. Estilo arquitectónico de APIs basado en recursos y verbos HTTP. |
| **RPC** | Remote Procedure Call. Invocación de funciones en procesos o servidores remotos. |
| **gRPC** | Framework de RPC de alto rendimiento basado en HTTP/2 y protobuf. |
| **Saga** | Patrón para gestionar transacciones distribuidas mediante una secuencia de pasos compensatorios. |
| **SOAP** | Simple Object Access Protocol. Protocolo antiguo de servicios web basado en XML. |
| **Worker** | Proceso que consume tareas de una cola para procesarlas en segundo plano. |
| **Handler** | Función o componente que recibe una petición y produce una respuesta (por ejemplo, el controlador de una ruta). |
| **Endpoint** | URL concreta de una API donde se puede hacer una petición. |
| **Runtime** | Entorno en el que se ejecuta el código (por ejemplo, Node.js, JVM, .NET CLR). |
| **Cron** | Programador de tareas que ejecuta comandos en intervalos definidos. |
| **Webhook** | Llamada HTTP que un servicio realiza a otro ante un evento, para notificarlo en tiempo real. |
| **Polling / Long polling** | Consulta periódica de un estado / consulta que mantiene la conexión abierta hasta que hay datos. |
| **Message queue** | Cola de mensajes que desacopla productores y consumidores permitiendo procesamiento asíncrono y fiable. |
| **Idempotency key** | Clave enviada en peticiones para que el servidor ignore duplicados y devuelva el mismo resultado. |

---

## Ingeniería de Datos y ETL

| Término | Significado |
|---------|-------------|
| **Dedup (deduplication)** | Deduplicación: eliminación de registros duplicados de un conjunto de datos según una clave o similitud. |
| **ETL** | Extract, Transform, Load. Proceso que extrae datos de fuentes, los transforma y los carga en un destino. |
| **ELT** | Extract, Load, Transform. Variante donde la transformación se realiza dentro del almacén de destino. |
| **Data warehouse** | Almacén de datos optimizado para consultas analíticas, con datos históricos y modelados. |
| **Data lake** | Repositorio que almacena datos en bruto, sin esquema previo, en cualquier formato. |
| **Lakehouse** | Arquitectura híbrida que combina la flexibilidad del data lake con la fiabilidad y el rendimiento del warehouse. |
| **Data lineage** | Linaje de datos: trazabilidad del origen, transformaciones y destino de los datos. |
| **Schema-on-read / Schema-on-write** | Esquema aplicado al leer los datos / esquema validado antes de escribir. |
| **Batch processing** | Procesamiento por lotes: análisis de datos en bloques planificados, no en tiempo real. |
| **Stream processing** | Procesamiento de flujos: análisis continuo de datos a medida que llegan. |
| **Window (ventana)** | Intervalo temporal sobre un flujo de datos usado para agregar (tumbling, sliding, session). |
| **Watermark** | Marca de agua: umbral de tiempo que indica que se puede considerar un evento como tardío en streaming. |
| **Exactly-once / At-least-once / At-most-once** | Semánticas de entrega: procesado exactamente una vez / al menos una vez (posibles duplicados) / como máximo una vez (posibles pérdidas). |
| **DLQ** | Dead Letter Queue. Cola de mensajes que fallan repetidamente para inspección y reproceso manual. |
| **Shuffle** | Fase de redistribución de datos entre nodos según una clave (por ejemplo, en MapReduce o joins distribuidas). |
| **Materialized view** | Vista física persistida que precalcula el resultado de una consulta para acelerar accesos repetidos. |
| **Partitioning / bucketing** | División de tablas o datasets en particiones o cubos para mejorar consultas y gestión. |
| **PII masking** | Enmascaramiento de datos personales (PII) para su uso en entornos no productivos. |
| **Star schema / Snowflake schema** | Modelos dimensionales: tabla de hechos con dimensiones desnormalizadas / normalizadas. |

---

## Concurrencia y Sistemas Distribuidos

| Término | Significado |
|---------|-------------|
| **Mutex** | Mutual exclusion: cerrojo que permite que un solo hilo entre en una sección crítica. |
| **Semaphore** | Contador que controla el acceso de N hilos a un conjunto de recursos. |
| **Thread pool** | Grupo de hilos reutilizables que ejecutan tareas de una cola, evitando crear hilos por petición. |
| **Starvation** | Inanición: un proceso nunca consigue el recurso porque otros siempre lo toman. |
| **Livelock** | Estado en el que los procesos se responden entre sí sin progresar, sin llegar a bloquearse. |
| **Optimistic / Pessimistic locking** | Bloqueo optimista (validar versiones antes de escribir) / pesimista (bloquear el recurso durante toda la transacción). |
| **Consensus** | Acuerdo distribuido: procesos alcanzan el mismo valor/estado a pesar de fallos (Raft, Paxos). |
| **Quorum** | Número mínimo de nodos que deben coincidir para aceptar una decisión (mayoría). |
| **Leader election** | Elección de líder: proceso por el que los nodos eligen a uno para coordinar escrituras o trabajos. |
| **Gossip protocol** | Protocolo de "rumores": propagación de estado entre nodos mediante intercambios aleatorios. |
| **Split brain** | Cerebro dividido: partición de red en la que nodos actúan por separado generando datos inconsistentes. |
| **Replication lag** | Retraso en la replicación: la réplica aún no refleja las escrituras del primario. |
| **Distributed tracing** | Trazado distribuido: seguimiento de una petición a través de múltiples servicios (correlation IDs). |
| **Idempotent consumer** | Consumidor que aplica el mismo resultado si recibe un mensaje repetido. |

---

## Rendimiento y Optimización

| Término | Significado |
|---------|-------------|
| **Throughput** | Rendimiento: número de operaciones o peticiones procesadas por unidad de tiempo. |
| **Bottleneck** | Cuello de botella: componente que limita el rendimiento global del sistema. |
| **p99 / Tail latency** | Percentil 99 de latencia: tiempo que supera al 99% de las peticiones; indica latencias extremas. |
| **Profiling** | Perfilado: análisis de qué partes del código consumen más tiempo o memoria. |
| **Flame graph** | Gráfico de llamas: visualización jerárquica del tiempo de ejecución por función. |
| **Benchmark** | Prueba comparativa estandarizada para medir rendimiento y comparar alternativas. |
| **Amdahl's law** | Ley de Amdahl: límite teórico del speedup de paralelizar cuando parte del trabajo es secuencial. |
| **Cache invalidation** | Invalidación de caché: mecanismo para descartar entradas obsoletas y forzar recálculo. |
| **Cache stampede / Thundering herd** | Avalancha: muchas peticiones recomputan el mismo valor perdido de caché a la vez. |
| **Read-through / Write-through / Write-behind** | Estrategias de caché: leer y poblar / escribir a caché y almacén / escribir diferido. |
| **Hot path** | Ruta caliente: la parte del código que se ejecuta con más frecuencia y más crítico optimizar. |
| **Preallocation / Pooling** | Reserva previa o reutilización de recursos (conexiones, objetos) para reducir coste de creación. |
| **Jitter** | Variación de la latencia entre peticiones; su reducción mejora la previsibilidad del servicio. |

---

## Lenguajes y Compilación

| Término | Significado |
|---------|-------------|
| **AST** | Abstract Syntax Tree. Árbol sintáctico abstracto: representación en árbol del código fuente usada por compiladores e intérpretes. |
| **Lexer / Tokenizer** | Analizador léxico: divide el código en tokens (palabras clave, identificadores, símbolos). |
| **Parser** | Analizador sintáctico: construye el AST a partir de los tokens según la gramática del lenguaje. |
| **Bytecode** | Código intermedio de bajo nivel que una máquina virtual ejecuta (por ejemplo, JVM bytecode). |
| **AOT / JIT** | Ahead-Of-Time / Just-In-Time compilation: compilación antes de la ejecución / durante la ejecución. |
| **Closure** | Cierre: función que recuerda el ámbito donde fue creada aunque se invoque fuera de él. |
| **Currying** | Currificación: transformar una función de varios argumentos en una cadena de funciones de un argumento. |
| **Higher-order function** | Función de orden superior: función que recibe o devuelve funciones. |
| **Duck typing** | Tipado por comportamiento: un objeto es válido si tiene los métodos esperados, sin importar su tipo declarado. |
| **Type inference** | Inferencia de tipos: el compilador deduce los tipos sin anotaciones explícitas. |
| **Memory model** | Modelo de memoria: reglas que definen cómo los hilos observan lecturas y escrituras compartidas. |
| **Tail call optimization (TCO)** | Optimización de llamada final: reutiliza el marco de pila en recursión para evitar desbordamientos. |

---

## Redes y Protocolos

| Término | Significado |
|---------|-------------|
| **DNS** | Domain Name System. Sistema que traduce nombres de dominio a direcciones IP. |
| **DNS lookup** | Resolución de un nombre de dominio a su dirección IP. |
| **DoS / DDoS** | Denial of Service / Distributed DoS. Ataques que saturan un servicio para dejarlo inaccesible. |
| **Firewall** | Barrera de seguridad que filtra el tráfico de red según reglas. |
| **HTTP** | HyperText Transfer Protocol. Protocolo de comunicación entre cliente y servidor web. |
| **HTTPS** | HTTP sobre TLS/SSL. Versión cifrada del protocolo web. |
| **IDN** | Internationalized Domain Name. Dominios con caracteres no ASCII. |
| **IP** | Internet Protocol. Dirección que identifica un dispositivo en una red. |
| **IPv4 / IPv6** | Versiones del protocolo IP (32 bits / 128 bits). |
| **Load balancer** | Balanceador de carga: distribuye peticiones entre múltiples servidores. |
| **Latencia** | Tiempo que tarda un dato en viajar del origen al destino. |
| **MTU** | Maximum Transmission Unit. Tamaño máximo de un paquete de red. |
| **NAT** | Network Address Translation. Traducción de direcciones entre redes privadas y públicas. |
| **Port** | Puerto: número que identifica un servicio dentro de un host. |
| **Proxy** | Ver *Arquitectura y Diseño*. |
| **Reverse proxy** | Proxy que se sitúa delante de los servidores de aplicación, ocultándolos y distribuyendo carga. |
| **Router** | Dispositivo que encamina paquetes entre redes. |
| **SSH** | Secure Shell. Protocolo para acceso remoto seguro y túneles cifrados. |
| **TCP / UDP** | Transmission Control Protocol (orientado a conexión, fiable) / User Datagram Protocol (sin conexión, rápido). |
| **TLS / SSL** | Transport Layer Security / Secure Sockets Layer. Protocolos de cifrado de comunicaciones. |
| **TTL** | Time To Live. Tiempo de validez de un registro o paquete en la red. |
| **VPN** | Virtual Private Network. Red privada virtual que cifra el tráfico entre puntos. |
| **WebSocket** | Ver *Frontend y Web*. |
| **URL / URI / URN** | Localizador / Identificador / Nombre uniforme de recursos. |
| **PoE** | Power over Ethernet. Alimentación eléctrica transmitida junto a los datos por el cable de red. |
| **CIDR** | Classless Inter-Domain Routing. Notación de subred (por ejemplo, `192.168.1.0/24`). |
| **Subnet** | Subred: partición lógica de una red IP mediante máscara. |
| **MAC address** | Dirección física única de una tarjeta de red. |
| **DHCP** | Dynamic Host Configuration Protocol. Asigna automáticamente IP y configuración de red a los dispositivos. |
| **ICMP** | Internet Control Message Protocol. Protocolo de diagnóstico (ping, traceroute). |
| **MQTT** | Protocolo ligero de mensajería pub/sub para IoT. |
| **AMQP** | Advanced Message Queuing Protocol. Protocolo estándar para colas de mensajes (por ejemplo, RabbitMQ). |
| **WebRTC** | Web Real-Time Communication. API para audio, vídeo y datos en tiempo real entre navegadores. |
| **QoS** | Quality of Service. Priorización de tráfico según reglas de red. |
| **Network topology** | Topología de red: disposición física/lógica de nodos y enlaces (estrella, malla, bus). |

---

## Seguridad

| Término | Significado |
|---------|-------------|
| **2FA / MFA** | Two-Factor / Multi-Factor Authentication. Autenticación con dos o más factores de verificación. |
| **ARPANET** | Red precursora de Internet; en seguridad suele citarse como hito histórico, no como término técnico operativo. |
| **Brute force** | Ataque que prueba todas las combinaciones posibles de contraseña o clave. |
| **Cifrado (encryption)** | Proceso de transformar datos legibles en ilegibles sin la clave correcta. |
| **CSRF** | Cross-Site Request Forgery. Ataque que fuerza al usuario autenticado a ejecutar acciones no deseadas. |
| **CVE** | Common Vulnerabilities and Exposures. Identificador público de vulnerabilidades conocidas. |
| **CORS** | Cross-Origin Resource Sharing. Mecanismo que controla qué dominios pueden acceder a recursos de un servidor. |
| **Criptografía simétrica / asimétrica** | Cifrado con una única clave compartida / con par de claves pública y privada. |
| **Datos sensibles (PII)** | Personally Identifiable Information. Información que identifica a una persona. |
| **Hashing** | Función unidireccional que genera un resumen fijo de un dato (para contraseñas, integridad). |
| **Inyección SQL** | Vulnerabilidad que permite ejecutar SQL malicioso a través de entradas no validadas. |
| **Man-in-the-Middle (MITM)** | Ataque en el que un intermediario intercepta la comunicación entre dos partes. |
| **OWASP** | Open Web Application Security Project. Organización que publica las vulnerabilidades web más relevantes. |
| **OWASP Top 10** | Lista de los diez riesgos de seguridad web más críticos según OWASP. |
| **OAuth 2.0** | Protocolo estándar de autorización por delegación mediante tokens. |
| **Phishing** | Estafa que suplanta una entidad legítima para robar credenciales. |
| **RBAC** | Role-Based Access Control. Control de acceso basado en roles. |
| **Salted hash** | Hash de contraseña con un valor aleatorio (salt) añadido para dificultar ataques. |
| **Sanitización** | Limpieza de entradas para eliminar contenido malicioso. |
| **SBOM** | Software Bill of Materials. Inventario de componentes y dependencias de un software. |
| **Secreto / Secret** | Clave, token o credencial que debe protegerse y no exponerse en el código. |
| **SQL Injection** | Ver *Inyección SQL*. |
| **Token** | Credencial temporal que autentica o autoriza peticiones. |
| **XSS** | Cross-Site Scripting. Inyección de scripts maliciosos en páginas vistas por otros usuarios. |
| **Zero-day** | Vulnerabilidad desconocida y sin parche que puede ser explotada el mismo día de su descubrimiento. |
| **SAST** | Static Application Security Testing. Análisis de seguridad estático del código fuente sin ejecutarlo. |
| **DAST** | Dynamic Application Security Testing. Análisis de seguridad dinámico ejecutando la aplicación y atacándola desde fuera. |
| **Penetration test (pentest)** | Prueba de penetración: ataque controlado y autorizado para descubrir vulnerabilidades explotables. |
| **Threat modeling** | Modelado de amenazas: identificación sistemática de riesgos, activos y vectores de ataque de un sistema. |
| **Secrets management** | Gestión de secretos: almacenamiento y rotación segura de claves, tokens y credenciales. |
| **Zero trust** | Confianza cero: modelo de seguridad que no confía en nada dentro ni fuera de la red y verifica cada acceso. |
| **OWASP ZAP** | Herramienta de DAST gratuita de OWASP para escaneo de seguridad web. |
| **Input validation** | Validación de entradas: verificación de que los datos recibidos cumplen las reglas esperadas antes de usarlos. |
| **Privilege escalation** | Escalada de privilegios: obtención de permisos superiores a los concedidos. |

---

## Testing y Calidad

| Término | Significado |
|---------|-------------|
| **Unit test (test unitario)** | Prueba que verifica una unidad aislada de código, sin dependencias externas. |
| **Integration test** | Prueba que verifica la interacción entre varios componentes o sistemas. |
| **E2E (end-to-end) test** | Prueba que simula el flujo completo de un usuario a través de la aplicación. |
| **Smoke test** | Prueba rápida de humo que verifica que las funcionalidades principales funcionan tras un despliegue. |
| **Regression test** | Prueba de regresión para detectar que cambios nuevos no rompan funcionalidad existente. |
| **Fixture** | Datos o entorno preparado para ejecutar una prueba en condiciones conocidas. |
| **Mock** | Objeto simulado que imita el comportamiento de una dependencia real. |
| **Stub** | Reemplazo de una dependencia que devuelve respuestas fijas, sin lógica. |
| **Spy** | Objeto que registra cómo fue llamado para verificar interacciones. |
| **TDD** | Test-Driven Development. Desarrollo guiado por pruebas: escribir el test antes del código. |
| **BDD** | Behavior-Driven Development. Desarrollo guiado por comportamiento, con escenarios legibles (Given/When/Then). |
| **Coverage** | Cobertura: porcentaje de código ejecutado por las pruebas. |
| **Fuzz testing** | Prueba que envía entradas aleatorias o malformadas para detectar fallos. |
| **Property-based testing** | Pruebas que validan propiedades con entradas generadas automáticamente. |
| **Code review** | Revisión de código por pares antes de integrarlo. |
| **Code smell** | Indicador de un posible problema de diseño en el código. |
| **Linter** | Herramienta que analiza el código estáticamente para detectar errores y estilo (por ejemplo, ESLint, Ruff). |
| **Static analysis** | Análisis estático del código sin ejecutarlo. |
| **Deuda técnica** | Costo futuro por tomar atajos en la calidad del código. |
| **QA** | Quality Assurance. Aseguramiento de la calidad. |
| **Bug** | Defecto o error en el software. |
| **Issue** | Incidencia registrada para seguimiento de un bug, mejora o tarea. |
| **Flaky test** | Prueba inestable: falla o pasa de forma intermitente sin cambios en el código. |
| **Test pyramid** | Pirámide de testing: muchos tests unitarios rápidos, menos de integración y pocos E2E. |
| **Mutation testing** | Testing por mutación: se introducen fallos deliberados para verificar que los tests los detectan. |
| **Snapshot / Golden file test** | Prueba de instantánea: compara la salida actual con una referencia guardada (golden file). |
| **Contract testing** | Prueba de contrato: valida que consumidor y proveedor de una API cumplen el mismo contrato. |
| **Chaos engineering** | Ingeniería del caos: inyección deliberada de fallos en producción para validar resiliencia. |
| **Load / Stress / Soak test** | Pruebas de carga (volumen esperado), estrés (más allá del límite) y resistencia (sostenidas en el tiempo). |
| **A/B testing** | Prueba A/B: comparar dos variantes para medir cuál logra mejor un objetivo. |
| **Test double** | Doble de prueba: término genérico para mock, stub, spy y fake. |
| **Seeding / Seed data** | Siembra: carga de datos iniciales conocidos para reproducir escenarios en pruebas. |

---

## Metodologías y Procesos

| Término | Significado |
|---------|-------------|
| **Agile** | Marco de trabajo iterativo e incremental para el desarrollo de software. |
| **Scrum** | Metodología ágil con sprints, roles (Product Owner, Scrum Master) y ceremonias (planning, daily, review, retrospective). |
| **Sprint** | Iteración de trabajo de duración fija (normalmente 1–4 semanas) en Scrum. |
| **Kanban** | Método visual de gestión del flujo de trabajo mediante tableros de columnas. |
| **Waterfall** | Metodología secuencial en cascada: fases rígidas sin retroceso. |
| **Product Backlog** | Lista priorizada de requisitos y tareas pendientes del producto. |
| **Sprint Backlog** | Subconjunto del backlog comprometido para un sprint concreto. |
| **Stand-up / Daily** | Reunión breve diaria para sincronizar el equipo. |
| **Retrospective** | Reunión al final del sprint para analizar qué mejorar. |
| **Product Owner (PO)** | Responsable de maximizar el valor del producto y priorizar el backlog. |
| **Scrum Master** | Facilitador del proceso Scrum y eliminador de impedimentos. |
| **User story** | Historia de usuario: requisito expresado desde la perspectiva del usuario. |
| **Epic** | Historia de usuario grande que se divide en historias menores. |
| **Task** | Tarea concreta de desarrollo descomponible y estimable. |
| **Backlog grooming / refinement** | Refinamiento del backlog: revisión y detalle de historias futuras. |
| **Estimation (Story Points)** | Estimación de esfuerzo relativo de las historias mediante puntos. |
| **MVP (producto)** | Minimum Viable Product. Versión mínima con el valor esencial para validar. |
| **Definition of Done (DoD)** | Criterios acordados que definen cuándo una tarea está terminada. |
| **CI/CD** | Ver *Operaciones y DevOps*. |
| **SLDC** | Software Development Life Cycle. Ciclo de vida del desarrollo de software. |
| **RAD** | Rapid Application Development. Metodología enfocada en prototipado rápido. |
| **XP (Extreme Programming)** | Metodología ágil centrada en calidad técnica: TDD, pair programming, refactoring continuo. |
| **Jira / Trello / Linear** | Herramientas de gestión de proyectos y seguimiento de tareas. |
| **Pair programming** | Programación en pareja: dos desarrolladores comparten una tarea (uno escribe, otro revisa). |
| **Mob programming** | Programación en grupo: todo el equipo trabaja sobre la misma tarea en un solo ordenador. |
| **Trunk-based development** | Desarrollo basado en tronco: commits frecuentes y pequeños directos a una rama principal. |
| **Git flow** | Flujo de trabajo git con ramas dedicadas (main, develop, feature, release, hotfix). |
| **Spike** | Tarea de investigación breve para validar viabilidad técnica antes de estimar una historia. |
| **MoSCoW** | Técnica de priorización: Must have, Should have, Could have, Won't have. |
| **RICE** | Método de priorización por Reach, Impact, Confidence, Effort. |
| **Definition of Ready (DoR)** | Criterios que una historia debe cumplir antes de entrar en un sprint. |
| **Velocity** | Velocidad del equipo: puntos de historia completados por sprint, usada para estimar capacidad. |

---

## Operaciones y DevOps

| Término | Significado |
|---------|-------------|
| **CI** | Continuous Integration. Integración continua: integración y compilación automática de código con frecuencia. |
| **CD** | Continuous Delivery / Deployment. Entrega o despliegue continuo automatizado. |
| **DevOps** | Cultura y prácticas que unen desarrollo y operaciones para automatizar el ciclo de vida del software. |
| **SRE** | Site Reliability Engineering. Disciplina que aplica ingeniería de software a la fiabilidad de sistemas. |
| **Infraestructura como código (IaC)** | Gestión de infraestructura mediante definiciones versionables (Terraform, CloudFormation). |
| **Container / Docker** | Empaquetado de una aplicación y sus dependencias en una unidad portable y aislada. |
| **Dockerfile** | Archivo de instrucciones para construir una imagen Docker. |
| **Imagen** | Plantilla inmutable a partir de la cual se crean contenedores. |
| **Orquestador (Kubernetes / K8s)** | Sistema que automatiza el despliegue, escalado y gestión de contenedores. |
| **Pod** | Unidad mínima de ejecución en Kubernetes que contiene uno o más contenedores. |
| **Helm** | Gestor de paquetes para Kubernetes. |
| **Virtualización** | Ejecución de sistemas operativos virtuales sobre hardware físico. |
| **VM (Virtual Machine)** | Máquina virtual: sistema completo emulado con su propio SO. |
| **Serverless** | Modelo en el que la infraestructura es gestionada por el proveedor y se paga por ejecución. |
| **FaaS** | Function as a Service. Ejecución de funciones individuales sin gestionar servidores (por ejemplo, AWS Lambda). |
| **IaaS / PaaS / SaaS** | Infrastructure / Platform / Software as a Service. Modelos de servicio en la nube. |
| **Cloud** | Conjunto de recursos informáticos ofrecidos por internet bajo demanda. |
| **Cloud provider** | Proveedor de nube (AWS, Azure, Google Cloud, etc.). |
| **On-premise** | Infraestructura alojada físicamente en las instalaciones de la empresa. |
| **Monitoring** | Monitorización: seguimiento continuo de métricas, logs y disponibilidad de sistemas. |
| **Logging** | Registro de eventos y errores del sistema en archivos o servicios. |
| **Tracing** | Seguimiento del recorrido de una petición a través de los servicios. |
| **Alerting** | Sistema de alertas ante condiciones anómalas. |
| **Prometheus / Grafana** | Herramientas populares de monitorización y visualización de métricas. |
| **ELK / EFK Stack** | Elasticsearch, Logstash (o Fluentd) y Kibana: stack de logs. |
| **Observabilidad** | Capacidad de entender el estado interno de un sistema desde sus salidas (métricas, logs, trazas). |
| **Rollback** | Reversión de una aplicación a una versión anterior ante fallos. |
| **Blue/Green deployment** | Despliegue con dos entornos (azul y verde) para conmutar el tráfico sin cortes. |
| **Canary release** | Despliegue gradual donde una pequeña parte del tráfico prueba la nueva versión. |
| **Zero-downtime deployment** | Despliegue sin interrupción del servicio. |
| **SLO** | Service Level Objective. Objetivo de nivel de servicio: meta concreta de disponibilidad o rendimiento. |
| **SLI** | Service Level Indicator. Indicador medible que evalúa el cumplimiento del SLO. |
| **SLA** | Service Level Agreement. Acuerdo contractual de nivel de servicio. |
| **Uptime** | Porcentaje de tiempo que un servicio está operativo. |
| **Incident** | Incidencia: evento que degrada o interrumpe el servicio. |
| **Postmortem** | Análisis posterior a un incidente para documentar causas y acciones correctivas. |
| **Scalabilidad horizontal / vertical** | Añadir más máquinas / añadir más recursos a una misma máquina. |
| **Elasticidad** | Capacidad de escalar recursos automáticamente según la demanda. |
| **Autoscaling** | Escalado automático de instancias. |
| **Rate limiting** | Limitación de velocidad: control del número de peticiones por usuario o IP. |
| **TTY** | Terminal teletype: interfaz de terminal; en contenedores, mantener `-t` para procesos interactivos. |
| **Registry (contenedores)** | Repositorio de imágenes de contenedores (Docker Hub, ECR, GHCR). |
| **Network policy** | Reglas que controlan el tráfico entre pods en Kubernetes. |
| **GitOps** | Práctica que usa git como única fuente de verdad para declarar y aplicar infraestructura y despliegues. |
| **Error budget** | Presupuesto de error: margen de indisponibilidad aceptable definido a partir del SLO. |
| **Runbook** | Manual de procedimientos operativos para resolver incidentes conocidos. |
| **On-call** | Guardia: persona responsable de responder alertas y incidentes fuera de horario. |
| **Toil** | Trabajo manual y repetitivo sin valor duradero que la SRE busca automatizar o eliminar. |
| **Immutable infrastructure** | Infraestructura inmutable: los servidores se reemplazan en vez de actualizarse en caliente. |
| **Golden image** | Imagen base validada y estandarizada para crear instancias o contenedores. |
| **Provisioning** | Aprovisionamiento: creación y configuración de recursos de infraestructura. |
| **Secrets injection** | Inyección de secretos: entrega de credenciales al entorno en ejecución sin exponerlas en código ni imágenes. |
| **Canary / A/B deployment** | Despliegues graduales que exponen la nueva versión a una fracción del tráfico o usuarios. |
| **Terraform** | Herramienta de IaC declarativa que gestiona recursos en múltiples proveedores de nube. |
| **Ansible** | Herramienta de automatización de configuración basada en playbooks sin agentes. |
| **Scale-to-zero** | Escalado a cero: apagar instancias sin uso para ahorrar coste (típico en serverless). |

---

## Acrónimos y Abreviaturas Comunes

| Abreviatura | Significado |
|-------------|-------------|
| **a11y** | Accessibility (accesibilidad). |
| **ACL** | Access Control List (lista de control de acceso). |
| **API** | Application Programming Interface. |
| **APK** | Android Package Kit (paquete de instalación Android). |
| **AR** | Augmented Reality (realidad aumentada). |
| **ASCII** | American Standard Code for Information Interchange (código estándar de caracteres). |
| **B2B / B2C** | Business to Business / Business to Consumer (modelos de negocio). |
| **CMS** | Content Management System (sistema de gestión de contenidos, por ejemplo, WordPress). |
| **CPU** | Central Processing Unit. |
| **DB / DBA** | Database / Database Administrator. |
| **DBMS** | Database Management System (sistema gestor de bases de datos). |
| **DNS** | Domain Name System. |
| **EAI** | Enterprise Application Integration (integración de aplicaciones empresariales). |
| **ERP** | Enterprise Resource Planning (planificación de recursos empresariales). |
| **EULA** | End User License Agreement (licencia de usuario final). |
| **FIFO / LIFO** | First In First Out / Last In First Out (estructuras de cola y pila). |
| **FTP** | File Transfer Protocol. |
| **GDPR** | General Data Protection Regulation (RGPD, regulación europea de datos). |
| **GPS** | Global Positioning System. |
| **GUI** | Graphical User Interface (interfaz gráfica). |
| **HID** | Human Interface Device (dispositivo de interacción humana, como teclado o ratón). |
| **HTTP / HTTPS** | HyperText Transfer Protocol (Secure). |
| **I/O** | Input/Output (entrada/salida). |
| **IDE** | Integrated Development Environment (entorno de desarrollo integrado, por ejemplo, VS Code). |
| **IPC** | Inter-Process Communication (comunicación entre procesos). |
| **ISO** | International Organization for Standardization (organización de normalización). |
| **IT** | Information Technology (tecnología de la información). |
| **JSON** | JavaScript Object Notation (formato de datos). |
| **JWT** | JSON Web Token. |
| **KPI** | Key Performance Indicator (indicador clave de rendimiento). |
| **KVM** | Keyboard, Video, Mouse (conmutador de equipos) o Kernel-based Virtual Machine. |
| **LDAP** | Lightweight Directory Access Protocol (protocolo de directorio, como Active Directory). |
| **LTS** | Long Term Support (soporte a largo plazo, versión estable). |
| **MAU** | Monthly Active Users (usuarios activos mensuales). |
| **MIME** | Multipurpose Internet Mail Extensions (tipo de contenido, por ejemplo, `text/html`). |
| **ML / AI** | Machine Learning / Artificial Intelligence (aprendizaje automático / inteligencia artificial). |
| **MVP** | Minimum Viable Product (producto mínimo viable). |
| **OCR** | Optical Character Recognition (reconocimiento óptico de caracteres). |
| **OS** | Operating System (sistema operativo). |
| **PDF** | Portable Document Format. |
| **POSIX** | Portable Operating System Interface (estándar Unix de interfaces). |
| **R&D** | Research and Development (investigación y desarrollo). |
| **RAM / ROM** | Random Access Memory / Read-Only Memory. |
| **RFC** | Request For Comments (documentos de estándares de Internet). |
| **REST** | Representational State Transfer. |
| **ROI** | Return On Investment (retorno de la inversión). |
| **SDK** | Software Development Kit (kit de desarrollo de software). |
| **SMB** | Small and Medium Business (pequeña y mediana empresa) o Server Message Block (protocolo de archivos). |
| **SW** | Software. |
| **HW** | Hardware. |
| **SWAT** | Special Weapons And Tactics; en TI, equipo de respuesta rápida a problemas críticos. |
| **TBD** | To Be Defined (por definir). |
| **TLS** | Transport Layer Security. |
| **TTFB** | Time To First Byte (tiempo hasta el primer byte de respuesta). |
| **UI** | User Interface (interfaz de usuario). |
| **UX** | User Experience (experiencia de usuario). |
| **VDI** | Virtual Desktop Infrastructure (infraestructura de escritorios virtuales). |
| **VLAN** | Virtual Local Area Network (red local virtual). |
| **VR** | Virtual Reality (realidad virtual). |
| **W3C** | World Wide Web Consortium (organización de estándares web). |
| **Wi-Fi** | Wireless Fidelity (red inalámbrica). |
| **WSDL** | Web Services Description Language (descripción de servicios SOAP). |
| **XML** | eXtensible Markup Language (lenguaje de marcado extensible). |
| **YAML** | YAML Ain't Markup Language (formato de datos legible, usado en configuraciones). |
| **ASAP** | As Soon As Possible (lo antes posible). |
| **BFF** | Backend For Frontend: capa intermedia que sirve datos adaptados a un cliente concreto. |
| **CLI** | Command Line Interface (interfaz de línea de comandos). |
| **CORS** | Cross-Origin Resource Sharing (intercambio de recursos entre orígenes). |
| **DAO** | Data Access Object (objeto de acceso a datos). |
| **ESB** | Enterprise Service Bus (bus de servicios empresarial). |
| **ETA** | Estimated Time of Arrival (tiempo estimado de llegada/finalización). |
| **ETL** | Extract, Transform, Load (extraer, transformar, cargar). |
| **FF / Feature flag** | Feature Flag (conmutador de funcionalidad). |
| **GC** | Garbage Collector (recolector de basura). |
| **LGTM** | Looks Good To Me (aprobación en revisión de código). |
| **LIFO / FIFO** | Last In First Out / First In First Out (estructuras de datos). |
| **MTTR / MTBF** | Mean Time To Repair / Between Failures (tiempo medio de reparación / entre fallos). |
| **NFR** | Non-Functional Requirement (requisito no funcional). |
| **OTA** | Over The Air (actualización inalámbrica de software). |
| **QPS / RPS** | Queries / Requests Per Second (consultas o peticiones por segundo). |
| **RDS** | Relational Database Service (servicio de base de datos relacional gestionado). |
| **REPL** | Read-Eval-Print Loop (bucle interactivo de evaluación de código). |
| **RTFM** | Read The Fucking Manual (léete el manual). |
| **SaaS** | Software as a Service (software como servicio). |
| **SBOM** | Software Bill of Materials (inventario de componentes del software). |
| **SPOF** | Single Point Of Failure (punto único de fallo). |
| **SRE** | Site Reliability Engineering (ingeniería de fiabilidad de sitios). |
| **TL;DR** | Too Long; Didn't Read (resumen). |
| **ToS / EULA** | Terms of Service / End User License Agreement (términos del servicio / licencia de usuario final). |
| **WIP** | Work In Progress (trabajo en curso). |

---

## Términos Generales

| Término | Significado |
|---------|-------------|
| **Abstracción** | Representación simplificada que oculta la complejidad subyacente. |
| **Algoritmo** | Secuencia finita y ordenada de pasos para resolver un problema. |
| **Ámbito (scope)** | Contexto en el que una variable o recurso es visible y accesible. |
| **API key** | Clave de acceso para autenticar peticiones a una API. |
| **Argumento / Parámetro** | Valor pasado a una función (argumento) / variable declarada en la firma de la función (parámetro). |
| **Artefacto** | Producto generado por el proceso de compilación o build (binario, paquete, imagen). |
| **Biblioteca (library)** | Conjunto de código reutilizable que se enlaza a la aplicación. |
| **Build** | Compilación o empaquetado del código fuente en artefactos ejecutables. |
| **Boilerplate** | Código repetitivo y necesario que hay que escribir en cada proyecto. |
| **Bootstrapping** | Proceso de inicialización de una aplicación o framework. |
| **Buffer** | Región de memoria temporal para datos en tránsito. |
| **Bug** | Ver *Testing y Calidad*. |
| **Callback** | Función que se pasa como argumento para ejecutarse tras un evento o tarea. |
| **Clase / Objeto** | Plantilla para crear instancias (clase) / instancia concreta con estado y comportamiento (objeto). |
| **Clon** | Copia exacta de un objeto o repositorio. |
| **Compilador / Intérprete** | Traduce todo el código a binario (compilador) / ejecuta el código línea a línea (intérprete). |
| **Dependencia** | Paquete, librería o servicio del que otro código depende para funcionar. |
| **Depurar (debug)** | Proceso de localizar y corregir errores en el código. |
| **Deserialización / Serialización** | Conversión de datos binarios/texto a objetos (des) y de objetos a formato almacenable (se). |
| **Divergencia** | Diferencia acumulada entre ramas o estados de datos. |
| **DRY** | Don't Repeat Yourself. Principio que evita la duplicación de código. |
| **Eager / Lazy loading** | Carga anticipada / carga diferida de recursos o datos. |
| **Encapsulación** | Ocultamiento del estado interno de un objeto tras su interfaz pública. |
| **Env var / Variable de entorno** | Configuración externa al código accesible desde el proceso en ejecución. |
| **Escalabilidad** | Capacidad de un sistema para crecer y soportar mayor carga. |
| **Framework** | Estructura de código e infraestructura que define el flujo de trabajo de una aplicación. |
| **Fork (código)** | Copia independiente de un código para desarrollar sobre ella. |
| **Función pura** | Función cuyo resultado depende solo de sus argumentos, sin efectos secundarios. |
| **Generics (genéricos)** | Mecanismo que permite escribir código reutilizable para múltiples tipos. |
| **Heap / Stack** | Memoria dinámica asignada (heap) / pila de ejecución de llamadas (stack). |
| **Helper** | Función o utilidad auxiliar reutilizable. |
| **Hotfix** | Parche urgente aplicado sobre una versión en producción. |
| **Idempotencia** | Propiedad por la que repetir una operación produce el mismo resultado que ejecutarla una vez. |
| **Immutable / Mutable** | Inmutable (no modificable tras creación) / mutable (modificable). |
| **Interfaz** | Contrato que define qué métodos o propiedades debe exponer un objeto. |
| **Issue** | Ver *Testing y Calidad*. |
| **Iteración** | Ciclo de desarrollo corto que produce una versión funcional. |
| **Iterable / Iterator** | Objeto que puede recorrerse elemento a elemento / objeto que realiza el recorrido. |
| **Legacy** | Sistema o código antiguo heredado que sigue en uso. |
| **Librería** | Ver *Biblioteca*. |
| **Lógica de negocio** | Reglas y procesos que modelan el dominio del problema que resuelve el software. |
| **Locking** | Mecanismo de bloqueo de recursos para evitar accesos concurrentes conflictivos. |
| **Memory leak** | Fuga de memoria: memoria no liberada que se agota con el tiempo. |
| **Namespace** | Espacio de nombres que agrupa y evita colisiones de identificadores. |
| **Nube / Cloud** | Ver *Operaciones y DevOps*. |
| **Objeto** | Ver *Clase / Objeto*. |
| **Paradigma de programación** | Estilo de programación (imperativo, funcional, orientado a objetos, declarativo). |
| **Performance** | Rendimiento: velocidad y eficiencia de un sistema. |
| **Pipeline** | Cadena de etapas automatizadas (build, test, deploy). |
| **PoC** | Proof of Concept (prueba de concepto): demostración de viabilidad de una idea. |
| **Prototipo** | Versión inicial de bajo esfuerzo para validar ideas o flujos. |
| **Refactoring** | Reestructuración del código sin cambiar su comportamiento externo para mejorar su calidad. |
| **Release** | Versión oficial y estable del software publicada para uso. |
| **Repo** | Ver *Control de Versiones*. |
| **Requerimiento (requisito)** | Necesidad o especificación que el software debe cumplir. |
| **Retry** | Reintento automático de una operación fallida. |
| **Sprint** | Ver *Metodologías y Procesos*. |
| **Stack tecnológico** | Conjunto de tecnologías usadas en un proyecto (lenguajes, frameworks, bases de datos). |
| **State (estado)** | Información conservada por una aplicación o componente entre ejecuciones. |
| **Sweep / GC** | Recorrido de limpieza del recolector de basura. |
| **Thread / Hilo** | Unidad de ejecución ligera dentro de un proceso. |
| **Timezone / Huso horario** | Zona horaria; factor clave en sistemas con fechas globales. |
| **Timestamp** | Marca de tiempo (fecha y hora de un evento). |
| **Trace** | Rastro de ejecución o recorrido de una petición. |
| **Trigger** | Disparador: evento que inicia una acción automática. |
| **Try/catch** | Estructura de manejo explícito de excepciones. |
| **Type / Tipo de dato** | Categoría de valor (string, int, boolean, objeto, etc.). |
| **Utility / util** | Ver *Helper*. |
| **Varargs** | Número variable de argumentos en una función. |
| **Versión semántica (SemVer)** | Versionado X.Y.Z (mayor, menor, parche) con reglas de compatibilidad. |
| **Workflow** | Flujo de trabajo automatizado (por ejemplo, GitHub Actions). |
| **YAGNI** | You Aren't Gonna Need It. Principio que evita construir funcionalidad que no se necesita hoy. |
| **Zero-config** | Herramienta que funciona sin configuración previa. |
| **Backward compatibility** | Compatibilidad hacia atrás: el nuevo código sigue funcionando con consumidores de versiones anteriores. |
| **Breaking change** | Cambio que rompe la compatibilidad con versiones anteriores de la API o contrato. |
| **Deprecation** | Deprecación: marca de una funcionalidad que quedará obsoleta y se retirará en el futuro. |
| **Edge case** | Caso límite: situación extrema o inusual que puede romper una implementación. |
| **Happy path** | Camino feliz: el flujo principal y sin errores de un proceso. |
| **Heisenbug** | Bug que desaparece o cambia al intentar observarlo (por ejemplo, al añadir logs o depurador). |
| **Magic number** | Número literal sin nombre ni explicación dentro del código. |
| **Opinionated** | Opinado: framework o herramienta que impone convenciones y una forma concreta de hacer las cosas. |
| **Rubber duck debugging** | Depuración del pato de goma: explicar el problema en voz alta para descubrir el fallo. |
| **Sandbox** | Entorno aislado para ejecutar código o pruebas sin afectar al sistema real. |
| **Spaghetti code** | Código espagueti: código enmarañado con flujos difíciles de seguir. |
| **Yak shaving** | Aplazamiento: encadenar tareas preparatorias que impiden llegar al objetivo real. |
| **Boilerplate removal** | Eliminación de código repetitivo mediante abstracciones, generadores o librerías. |
| **Refactorización de nombres (renaming)** | Renombrado sistemático de símbolos para mejorar claridad sin cambiar comportamiento. |

---

*Fuente: glosario colaborativo de términos estándar de la industria.*
