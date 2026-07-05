# Documento de Requisitos

## Introduction

Este spec define un **plan de validación de punta a punta (E2E)** y un conjunto de **criterios de aceptación verificables** para el módulo "Incidências de Escala" del proyecto Check-out PRO (PRs #100 backend + #101 mobile), que aún no ha sido probado E2E contra una base de datos real.

El objetivo NO es construir una funcionalidad nueva, sino: (1) validar el comportamiento del módulo contra un PostgreSQL real, (2) verificar endpoints, permisos, auto-detección desde el ponto, alertas por umbral y el perfil enriquecido, (3) confirmar que la regresión (build, lint, type-check y suites de test) sigue verde, y (4) producir un **informe QA** que documente cada caso probado, su resultado y, cuando aplique, la causa raíz y el fix propuesto para corregir los bugs encontrados.

El idioma de comunicación de este documento es español; los identificadores del dominio, endpoints, enums, nombres de tablas y textos de UI se mantienen en portugués BR tal como existen en el código.

## Glossary

- **Plan_Validacion**: Conjunto de procedimientos y verificaciones E2E ejecutados manualmente y/o mediante scripts para comprobar el módulo "Incidências de Escala".
- **Entorno_Real**: Instancia local de PostgreSQL con el esquema migrado y datos de seed, más la API NestJS booteada desde `dist/main.js`.
- **API_Incidencias**: Conjunto de endpoints bajo `/escala/incidencias` expuestos por `incidencias.controller.ts` (POST `/`, PATCH `:id`, DELETE `:id`, GET `/`, GET `/sugestoes`, GET `/ranking`).
- **Servicio_Incidencias**: `IncidenciasService` (`backend/src/incidencias/incidencias.service.ts`).
- **Dominio_Incidencias**: Lógica pura en `incidencias.domain.ts` (incluye `detectarNaoRetorno`, `verificarLimiteMes`, `resumoDoColaborador`).
- **IncidenciaEscala**: Registro en la tabla `incidencias_escala`; unicidad por `(colaboradorId, tipo, data)`; enum `TipoIncidenciaEscala` (hoy solo `NAO_RETORNO_INTERVALO`).
- **RegistroPontoFiscal**: Registro de eventos de ponto del fiscal con transiciones de estado (`DISPONIVEL`, `INTERVALO`, `FORA_EXPEDIENTE`).
- **EscalaEntry**: Entrada de escala del día que contiene el `intervaloMin` usado para derivar horas esperadas.
- **Sugestion_NaoRetorno**: Incidencia candidata detectada automáticamente desde el ponto, con `origem=DETECTADO_PONTO`.
- **Perfil_Colaborador**: Respuesta de `GET /colaboradores/:id/perfil` producida por `perfil-colaborador.service.ts`, que incluye la sección `incidencias` y el `timeline` unificado.
- **Notificacao_Umbral**: Registro en la tabla `notificacoes` generado cuando la cuenta mensual de no-retornos de un colaborador alcanza exactamente 3.
- **Permiso_OPERADORES_AUSENCIAS**: Funcionalidad requerida para operaciones de escritura (POST/PATCH/DELETE).
- **Permiso_ESCALA_VISUALIZAR**: Funcionalidad requerida para operaciones de lectura (GET listar/sugestoes/ranking).
- **Informe_QA**: Documento entregable en formato de tabla con columnas: caso, esperado, obtenido, severidad, archivo, causa raíz, fix propuesto.
- **Suite_Regresion**: Conjunto de comandos de build, lint, type-check y test de backend y mobile.

## Requirements

### Requirement 1: Preparación del entorno real

**User Story:** Como ingeniero de QA, quiero preparar un entorno con PostgreSQL real y la API booteada, para poder validar el módulo de forma reproducible.

#### Acceptance Criteria

1. WHEN se ejecuta `npx prisma migrate deploy` sobre una base de datos PostgreSQL vacía, THE Entorno_Real SHALL aplicar todas las migraciones hasta `9w_incidencia_escala` sin errores y crear la tabla `incidencias_escala` con sus índices.
2. WHEN se ejecuta `npx prisma db seed` tras las migraciones, THE Entorno_Real SHALL poblar los datos de seed sin errores.
3. WHEN se ejecuta `node dist/main.js` tras compilar el backend, THE API_Incidencias SHALL quedar accesible y responder a peticiones HTTP.
4. WHERE el esquema de base de datos está incompleto o las migraciones no se han aplicado, THE API_Incidencias SHALL iniciarse igualmente sin bloquear el arranque por el estado de las migraciones.
5. IF una migración falla o produce un error de esquema, THEN THE Plan_Validacion SHALL registrar el error en el Informe_QA con su causa raíz.

### Requirement 2: Endpoints CRUD con validaciones

**User Story:** Como ingeniero de QA, quiero validar los endpoints CRUD con entradas válidas e inválidas, para confirmar que responden con los códigos HTTP y mensajes correctos.

#### Acceptance Criteria

1. WHEN se envía un POST `/escala/incidencias` con datos válidos, THE API_Incidencias SHALL crear la IncidenciaEscala y responder con código HTTP 201.
2. IF un POST `/escala/incidencias` incluye una hora con formato distinto de HH:mm, THEN THE API_Incidencias SHALL rechazar la petición con código HTTP 400.
3. IF un POST `/escala/incidencias` referencia un colaborador inexistente, THEN THE API_Incidencias SHALL rechazar la petición con un código HTTP de error y un mensaje descriptivo.
4. IF un POST `/escala/incidencias` duplica la combinación `(colaboradorId, tipo, data)` de una IncidenciaEscala existente, THEN THE API_Incidencias SHALL responder con código HTTP 409.
5. WHEN se envía un POST `/escala/incidencias` válido de tipo `NAO_RETORNO_INTERVALO`, THE Servicio_Incidencias SHALL derivar `horaEsperadaRetorno` a partir del `intervaloMin` de la EscalaEntry del día.
6. IF un PATCH `/escala/incidencias/:id` o un DELETE `/escala/incidencias/:id` referencia un identificador inexistente, THEN THE API_Incidencias SHALL responder con código HTTP 404.
7. WHEN se envía un GET `/escala/incidencias` con filtros `colaboradorId`, `tipo`, `inicio` y `fim`, THE API_Incidencias SHALL devolver únicamente las incidencias que cumplen los filtros indicados.
8. WHEN se envía un GET `/escala/incidencias/ranking` con `inicio` y `fim`, THE API_Incidencias SHALL devolver el ranking de colaboradores por cantidad de incidencias en el rango indicado.

### Requirement 3: Autorización por permisos

**User Story:** Como responsable de seguridad, quiero verificar que cada endpoint exige el permiso correcto, para garantizar que solo usuarios autorizados operan sobre el módulo.

#### Acceptance Criteria

1. WHERE la petición es POST, PATCH o DELETE sobre `/escala/incidencias`, THE API_Incidencias SHALL requerir el Permiso_OPERADORES_AUSENCIAS.
2. WHERE la petición es GET sobre `/escala/incidencias`, `/escala/incidencias/sugestoes` o `/escala/incidencias/ranking`, THE API_Incidencias SHALL requerir el Permiso_ESCALA_VISUALIZAR.
3. IF una petición se realiza con un token válido pero sin el permiso requerido, THEN THE API_Incidencias SHALL responder con código HTTP 403.
4. IF una petición se realiza sin token de autenticación, THEN THE API_Incidencias SHALL responder con código HTTP 401.

### Requirement 4: Auto-detección de no-retorno desde el ponto

**User Story:** Como gestor de escala, quiero que el sistema detecte automáticamente los no-retornos de intervalo a partir del ponto, para no tener que registrarlos manualmente.

#### Acceptance Criteria

1. WHEN existe un RegistroPontoFiscal con una transición a `INTERVALO` sin un `DISPONIVEL` posterior antes de `FORA_EXPEDIENTE` o del fin del log, THE Dominio_Incidencias SHALL clasificar ese caso como no-retorno de intervalo.
2. WHEN un GET `/escala/incidencias/sugestoes?data=` corresponde a un día con un no-retorno detectado, THE API_Incidencias SHALL devolver una Sugestion_NaoRetorno con `horaSaida` y `horaEsperadaRetorno` derivados del `intervaloMin` de la EscalaEntry y con `origem=DETECTADO_PONTO`.
3. WHERE el `INTERVALO` no va seguido de un `DISPONIVEL` antes de `FORA_EXPEDIENTE` o del fin del log, THE Dominio_Incidencias SHALL tratar esa transición como evidencia explícita de problema y solo entonces generar la Sugestion_NaoRetorno.
4. IF el `intervaloMin` de la EscalaEntry del día es cero minutos, THEN THE Dominio_Incidencias SHALL omitir la Sugestion_NaoRetorno para ese día.
5. IF el RegistroPontoFiscal muestra un retorno a `DISPONIVEL` tras el `INTERVALO`, THEN THE Dominio_Incidencias SHALL excluir ese día de las Sugestion_NaoRetorno.
6. IF ya existe una IncidenciaEscala registrada para el colaborador, tipo y fecha detectados, THEN THE Dominio_Incidencias SHALL excluir esa fecha de las Sugestion_NaoRetorno.

### Requirement 5: Alerta por umbral mensual

**User Story:** Como gestor, quiero recibir una alerta cuando un colaborador alcanza el tercer no-retorno del mes, para intervenir a tiempo sin recibir avisos redundantes.

#### Acceptance Criteria

1. WHEN la cuenta mensual de no-retornos de un colaborador alcanza exactamente 3, THE Dominio_Incidencias SHALL generar una única Notificacao_Umbral dirigida a los gestores.
2. THE Servicio_Incidencias SHALL registrar la Notificacao_Umbral en la tabla `notificacoes`.
3. WHILE la cuenta mensual del colaborador es distinta de 3, THE Dominio_Incidencias SHALL abstenerse de generar una Notificacao_Umbral por umbral.

### Requirement 6: Perfil enriquecido del colaborador

**User Story:** Como gestor, quiero ver las métricas de incidencias y una línea de tiempo unificada en el perfil del colaborador, para evaluar su comportamiento de forma consolidada.

#### Acceptance Criteria

1. WHEN se solicita `GET /colaboradores/:id/perfil`, THE Perfil_Colaborador SHALL incluir una sección `incidencias` con el total de no-retornos, el último no-retorno, los días consecutivos sin incidencia, el riesgo, la tendencia, la distribución `porDiaSemana` y el porcentaje sobre días escalados.
2. WHEN se solicita `GET /colaboradores/:id/perfil`, THE Perfil_Colaborador SHALL incluir un `timeline` unificado que combina faltas y no-retornos ordenados de forma descendente por fecha.
3. THE Perfil_Colaborador SHALL obtener la sección `incidencias` y el `timeline` a través de `IncidenciasService.resumoDoColaborador`.

### Requirement 7: Regresión verde

**User Story:** Como responsable de entrega, quiero confirmar que la validación no rompe el proyecto existente, para poder integrar los cambios con confianza.

#### Acceptance Criteria

1. WHEN se ejecuta la Suite_Regresion del backend (build, lint, type-check y tests), THE Plan_Validacion SHALL confirmar que todos los comandos finalizan con éxito.
2. WHEN se ejecuta la Suite_Regresion del mobile (build, lint, type-check y tests), THE Plan_Validacion SHALL confirmar que todos los comandos finalizan con éxito.
3. IF cualquier comando de la Suite_Regresion falla, THEN THE Plan_Validacion SHALL registrar el fallo en el Informe_QA con su archivo y causa raíz.

### Requirement 8: Entregable de informe QA

**User Story:** Como responsable de QA, quiero un informe estructurado de todos los casos validados, para priorizar la corrección de los bugs encontrados.

#### Acceptance Criteria

1. WHEN concluye la ejecución del Plan_Validacion, THE Informe_QA SHALL presentar cada caso probado en una tabla con las columnas: caso, esperado, obtenido, severidad, archivo, causa raíz y fix propuesto.
2. THE Plan_Validacion SHALL considerarse completo únicamente cuando el Informe_QA se ha presentado correctamente.
3. THE Informe_QA SHALL ordenar las filas por prioridad, con la severidad más alta primero.
4. WHERE un caso resulta conforme al comportamiento esperado, THE Informe_QA SHALL marcar la severidad como sin defecto y dejar vacíos los campos de causa raíz y fix propuesto.

## Requisitos No Funcionales

### Requirement 9: Cumplimiento de las reglas del proyecto

**User Story:** Como mantenedor del proyecto, quiero que la validación y cualquier corrección respeten las convenciones establecidas, para preservar la integridad del código base.

#### Acceptance Criteria

1. WHERE se requiera un cambio de esquema rutinario, THE Plan_Validacion SHALL utilizar únicamente migraciones aditivas y abstenerse de operaciones destructivas.
2. WHERE un cambio de esquema corrige un defecto crítico de diseño o una vulnerabilidad de seguridad, THE Plan_Validacion SHALL permitir migraciones destructivas siempre que apliquen salvaguardas de respaldo y reversión documentadas.
3. THE Dominio_Incidencias SHALL mantener su lógica pura y conservar en verde las pruebas basadas en propiedades con fast-check ejecutadas con un mínimo de 100 corridas.
4. WHERE se defina un error de dominio nuevo, THE error SHALL extender `ErroDominio`.
5. THE API_Incidencias SHALL aplicar el control de acceso mediante `@Funcionalidade` y `PerfilGuard`, tomando la definición de permisos desde la fuente única `acessos.domain.ts`.
6. THE API_Incidencias SHALL mantener activos helmet, CORS controlado por `CORS_ORIGINS`, rate-limit en el login y JWT con `tokenVersion`.

### Requirement 10: Flujo de entrega

**User Story:** Como responsable de entrega, quiero que los cambios se integren mediante un flujo controlado, para evitar regresiones en la rama principal.

#### Acceptance Criteria

1. WHEN se inicie el trabajo de corrección, THE Plan_Validacion SHALL crear una rama nueva a partir de `main`.
2. WHEN los cambios estén listos, THE Plan_Validacion SHALL ejecutar la verificación local (build, lint, type-check y tests, más E2E contra PostgreSQL cuando el cambio afecte a la base de datos) antes de abrir la integración.
3. WHEN se proponga la integración, THE Plan_Validacion SHALL abrir un Pull Request contra `main` mediante las herramientas de push/PR y abstenerse de hacer push directo a `main`.
4. WHEN el Pull Request esté abierto, THE Plan_Validacion SHALL confirmar que la CI finaliza en verde.
