# Plan de Implementación — Validación E2E y Corrección de Bugs: Incidências de Escala

## Overview

Este plan **no construye una feature nueva**: ejecuta un ciclo de **validación E2E contra PostgreSQL real + corrección acotada de bugs** para el módulo "Incidências de Escala" (backend `incidencias.*` + perfil enriquecido y su consumo en mobile).

El agente de código debe avanzar de forma incremental: primero deja el **entorno real** reproducible (Postgres migrado + seed + API booteada), luego crea **fixtures deterministas**, ejecuta la **matriz E2E** (E1–E19, P1–P5) capturando código HTTP + cuerpo, corre la **regresión**, redacta el **Informe QA**, **corrige** los bugs confirmados respetando `controller→service→domain` (con property tests `fast-check` ≥100 corridas cuando el fix toque el dominio puro) y finalmente **entrega** vía rama → PR contra `main` → CI verde.

Todos los comandos de backend se ejecutan desde `backend/`; los de mobile desde `mobile/`. El dominio y la UI se mantienen en portugués BR; la comunicación es en español.

> Convención: las sub-tareas marcadas con `*` son opcionales (tests) y pueden saltarse para un MVP más rápido; el agente **no** las implementa salvo indicación. Las sub-tareas sin `*` son obligatorias.

## Tasks

- [ ] 1. Preparar el entorno real (Postgres + API booteada)
  - [ ] 1.1 Levantar PostgreSQL local y configurar variables de entorno
    - Iniciar PostgreSQL local (Docker `postgres:16` si está disponible, o binario del sistema) y crear la base `checkout_pro`; verificar con `pg_isready -h localhost -p 5432`
    - Crear `backend/.env` a partir de `.env.example` con: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/checkout_pro?schema=public`, `JWT_SECRET` (valor fijo vía `openssl rand -hex 32`), `JWT_EXPIRES_IN=30d`, `PORT=3000`, `NODE_ENV=development`
    - Ejecutar `npm ci` en `backend/` si las dependencias no están instaladas
    - _Requirements: 1.1_
  - [ ] 1.2 Aplicar migraciones y verificar esquema hasta `9w_incidencia_escala`
    - Ejecutar `npx prisma migrate deploy`
    - Ejecutar `npx prisma migrate status` y confirmar que todas las migraciones están aplicadas, incluida `9w_incidencia_escala`
    - Verificar que existe la tabla `incidencias_escala` con sus índices (`(colaboradorId, data)`, `(tipo, data)`, `(data)`) y el `@@unique([colaboradorId, tipo, data])`
    - IF `migrate deploy` falla: capturar salida + `migrate status` y anotar el error con causa raíz para el Informe QA (no aplicar fixes destructivos)
    - _Requirements: 1.1, 1.5_
  - [ ] 1.3 Poblar datos base con el seed
    - Ejecutar `npx prisma db seed` (equivalente a `npm run db:seed`) y confirmar que finaliza sin errores
    - Registrar que el seed crea fiscais/gerentes/escalas (`intervaloMin=120`) pero **no** crea registros `Colaborador` (hallazgo de diseño → candidato de bug para F0 y el Informe QA)
    - _Requirements: 1.2_
  - [ ] 1.4 Compilar y arrancar la API, verificar arranque (smoke de login)
    - Ejecutar `npm run build` (`prisma generate` + `nest build`)
    - Arrancar `node dist/main.js` (equivalente a `npm run start:prod`); indicar al usuario que este proceso queda en ejecución en su terminal
    - Smoke: `curl -sS -o /tmp/body -w '%{http_code}' -X POST http://localhost:3000/acessos/login` debe responder (400 por body vacío confirma que la API responde) → cubre arranque sin gatear por estado de migraciones
    - _Requirements: 1.3, 1.4_

- [ ] 2. Crear fixtures deterministas (solo-inserción / aditivo)
  - [ ] 2.1 F0 — Backfill de `Colaborador` FISCAL
    - Re-ejecutar tras el seed el SQL insert-only de la migración `9s_colaboradores_de_fiscais` (idempotente): `INSERT INTO "colaboradores" ...` + el `INSERT` de `colaborador_identificadores` MATRICULA
    - Obtener `{COL_FISCAL}` con `GET /colaboradores?funcao=FISCAL` (o `SELECT id,nome`)
    - _Requirements: 1.2, 9.1_
  - [ ] 2.2 F1 — Usuario IMPORTADOR (para probar 403)
    - Insertar (SQL insert-only) un `Usuario` con `perfil=IMPORTADOR` y `senhaHash` bcrypt conocido, o crearlo vía `POST /colaboradores`
    - Loguearse para obtener su JWT (`TOKEN_IMPORTADOR`)
    - _Requirements: 3.3, 9.1_
  - [ ] 2.3 F2 — `RegistroPontoFiscal` con transiciones
    - Insertar vía SQL directo (para controlar `data` = medianoche UTC y `em` con `HH:mm` en `America/Sao_Paulo`) los escenarios:
      - No-retorno (detecta): `DISPONIVEL(08:00)` → `INTERVALO(12:00)` → `FORA_EXPEDIENTE(17:00)` sin `DISPONIVEL` intermedio
      - Con retorno (no detecta): `... INTERVALO(12:00)` → `DISPONIVEL(14:00)` → `FORA_EXPEDIENTE(17:00)`
    - _Requirements: 4.1, 4.3, 4.5_
  - [ ] 2.4 F3 — `EscalaEntry` con `intervaloMin` de 120 y 0
    - Confirmar `intervaloMin=120` sembrado; para E14 insertar/actualizar una entrada (`especial`) con `intervaloMin=0` en el `diaSemana` del día objetivo (recordar que `especial` prima sobre el general)
    - _Requirements: 4.2, 4.4_
  - [ ] 2.5 F4 — Incidencias para umbral / ranking / perfil
    - Crear 3 incidencias del mismo `{COL_FISCAL}` en 3 fechas del mismo mes (umbral, E16); ≥2 colaboradores con incidencias (ranking, E11); insertar `Ausencia` (`pessoaId={COL_FISCAL}`) para el timeline (E19)
    - _Requirements: 5.1, 2.8, 6.2_
  - [ ] 2.6 F5 — Verificar gestores para el aviso de umbral
    - Confirmar que `NotificacoesService.gestores()` devuelve ≥1 (Pedro/Arlete sembrados)
    - _Requirements: 5.1, 5.2_

- [ ] 3. Ejecutar la matriz E2E capturando código HTTP + cuerpo
  - Patrón por caso: `curl -sS -o /tmp/body.json -w '%{http_code}\n' ...` (código + cuerpo → Informe QA). Obtener JWT por perfil con `POST /acessos/login`.
  - [ ] 3.1 CRUD + validaciones (E1–E11)
    - E1 crear válida (201, `origem="MANUAL"`, `horaEsperadaRetorno` derivada de `intervaloMin`); E2 hora inválida (400); E3 fecha inválida (400); E4 colaborador inexistente (código de error + mensaje); E5 duplicado (409); E6 PATCH inexistente (404); E7 PATCH válido (200); E8 DELETE inexistente (404); E9 DELETE válido (204); E10 GET con filtros; E11 GET ranking (orden desc por total)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_
  - [ ] 3.2 Permisos 401/403 (P1–P5)
    - P1 sin token (401); P2 escritura IMPORTADOR (403); P3 lectura IMPORTADOR (403); P4 escritura autorizada (201/200); P5 lectura autorizada (200)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [ ] 3.3 Auto-detección de sugestoes (E12–E15)
    - E12 no-retorno detectado (`origem="DETECTADO_PONTO"`, `horaSaida`/`horaEsperadaRetorno`); E13 con retorno excluida; E14 `intervaloMin=0` omitida; E15 ya registrada excluida
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
  - [ ] 3.4 Umbral de notificación (E16–E17)
    - E16 al 3.º no-retorno del mes → exactamente 1 `Notificacao` a gestores (verificar por `SELECT` de solo lectura en `notificacoes`); E17 en 1.º/2.º/4.º → sin notificación de umbral
    - _Requirements: 5.1, 5.2, 5.3_
  - [ ] 3.5 Perfil enriquecido + timeline (E18–E19)
    - E18 `GET /colaboradores/{COL_FISCAL}/perfil` → sección `incidencias` completa (`totalNaoRetorno`, `ultimoNaoRetorno`, `diasConsecutivosSemIncidencia`, `risco`, `tendencia`, `porDiaSemana`, `percentualSobreEscalados`); E19 `timeline` unificado (FALTA + NAO_RETORNO_INTERVALO, orden `data desc`)
    - _Requirements: 6.1, 6.2, 6.3_

- [ ] 4. Ejecutar la Suite de Regresión (backend + mobile)
  - [ ] 4.1 Regresión backend
    - Desde `backend/`: `npm run build`, `npm run lint`, `npm test` (incluye property tests fast-check); confirmar que todos terminan con éxito
    - IF algún comando falla: registrar archivo y causa raíz para el Informe QA
    - _Requirements: 7.1, 7.3_
  - [ ] 4.2 Regresión mobile
    - Desde `mobile/`: `npm run type-check`, `npm run lint`, `npm test`; confirmar éxito
    - IF algún comando falla: registrar archivo y causa raíz para el Informe QA
    - _Requirements: 7.2, 7.3_

- [ ] 5. Redactar el Informe QA (entregable)
  - Crear `.kiro/specs/validacao-e2e-incidencias-escala/INFORME_QA.md` con tabla: `Caso | Esperado | Obtenido | Severidad | Archivo | Causa raíz | Fix propuesto`
  - Incluir cada caso de la matriz (E1–E19, P1–P5) + resultados de entorno (1.x) y regresión (7.x); ordenar por severidad descendente (`Alta`→`Media`→`Baja`→`Sin defecto`)
  - Los casos conformes se marcan `Sin defecto` con causa raíz y fix vacíos
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 1.5, 7.3_

- [ ] 6. Corregir los bugs confirmados (protocolo causa raíz → fix acotado)
  - Protocolo por bug: causa raíz por capa (controller/service/domain/DTO/migración) → fix acotado respetando `controller→service→domain`, errores extienden `ErroDominio`, permisos desde `acessos.domain.ts`, migraciones **solo aditivas** → re-ejecutar el caso E2E hasta verlo conforme → regresión
  - [ ] 6.1 Fix candidato (a): tabla `colaboradores` vacía tras `migrate deploy` + `db seed`
    - Confirmar causa raíz (backfill `9s` corre sobre base vacía; el seed no re-backfillea); aplicar fix acotado y aditivo: que el seed cree/backfillee las fichas `Colaborador` FISCAL (o migración aditiva idempotente equivalente)
    - Re-ejecutar entorno (migrate + seed) y verificar `colaboradores` poblada sin necesidad de F0 manual
    - _Requirements: 1.2, 9.1_
  - [ ] 6.2 Fix candidato (b): POST con `colaboradorId` inexistente no falla
    - Validar la existencia del `Colaborador` en `IncidenciasService.registrar` antes del `create` y lanzar `ColaboradorIncidenciaInvalidoError` (ya existe, mapea a 400); sin cambio de esquema, respetando controller→service→domain
    - Re-ejecutar E4 hasta obtener código de error + mensaje descriptivo
    - _Requirements: 2.3_
  - [ ] 6.3 Corregir el resto de bugs confirmados en el Informe QA
    - Para cada bug restante de severidad Alta/Media/Baja: aplicar el protocolo acotado; si toca DTO/permisos, respetar la fuente única `acessos.domain.ts` y `@Funcionalidade`/`PerfilGuard`
    - Actualizar el Informe QA con `Obtenido` corregido tras cada fix
    - _Requirements: 2.2, 2.3, 2.4, 2.6, 3.1, 3.2, 3.3, 3.4, 4.4, 4.6, 5.1, 5.3, 6.3, 9.4, 9.5_
  - [ ]* 6.4 Property test: derivación de hora esperada (si un fix toca el dominio)
    - Ampliar/ajustar `backend/src/incidencias/incidencias.properties.spec.ts` con fast-check ≥100 corridas
    - **Property 1: Derivación de la hora esperada de retorno**
    - **Validates: Requirements 2.5, 2.2, 4.4**
  - [ ]* 6.5 Property test: detección de no-retorno (si un fix toca el dominio)
    - fast-check ≥100 corridas (iff no-retorno + metamórfica de inserción de `DISPONIVEL`)
    - **Property 2: Detección de no-retorno del intervalo**
    - **Validates: Requirements 4.1, 4.3, 4.5**
  - [ ]* 6.6 Property test: orden y conservación del ranking (si un fix toca el dominio)
    - fast-check ≥100 corridas (permutación; orden desc por `total`, desempate asc por `nome`)
    - **Property 3: Orden y conservación del ranking de incidencias**
    - **Validates: Requirements 2.8**
  - [ ]* 6.7 Property test: invariantes de la analítica (si un fix toca el dominio)
    - fast-check ≥100 corridas (`total` consistente; `percentual` en [0,100]; `risco`/`tendencia` en dominios válidos; `diasConsecutivos>=0`)
    - **Property 4: Invariantes de la analítica de incidencias**
    - **Validates: Requirements 6.1**
  - [ ]* 6.8 Property test: timeline unificado (si un fix toca el dominio)
    - fast-check ≥100 corridas (orden desc por fecha; longitud = `faltas.length + incidencias.length`)
    - **Property 5: Timeline unificado ordenado y completo**
    - **Validates: Requirements 6.2**

- [ ] 7. Checkpoint — Verificación local completa tras las correcciones
  - Re-ejecutar entorno E2E afectado por los fixes (migrate/seed/build/arranque) + Suite_Regresion completa (backend y mobile). Asegurar que todo pasa; ante dudas, preguntar al usuario.
  - _Requirements: 7.1, 7.2, 10.2_

- [ ] 8. Entrega vía rama → PR contra `main` → CI verde
  - [ ] 8.1 Crear rama nueva desde `main` y commitear los cambios
    - Crear una rama a partir de `main` (nunca push directo a `main`); commitear fixes + Informe QA + property tests
    - _Requirements: 10.1_
  - [ ] 8.2 Push y abrir Pull Request contra `main`
    - Push a la rama mediante la herramienta de push; abrir PR contra `main` mediante la herramienta de PR, con resumen de casos validados, bugs corregidos y evidencia
    - _Requirements: 10.3_
  - [ ] 8.3 Confirmar CI en verde
    - Verificar que el workflow `.github/workflows/ci.yml` finaliza en verde; IF falla, revisar logs, corregir y re-push
    - _Requirements: 10.4_

## Grafo de dependencias de tareas

```mermaid
flowchart TD
    T1[1. Entorno real] --> T2[2. Fixtures]
    T2 --> T3[3. Matriz E2E]
    T1 --> T4[4. Regresión]
    T3 --> T5[5. Informe QA]
    T4 --> T5
    T5 --> T6[6. Corregir bugs]
    T6 --> T7[7. Checkpoint verificación local]
    T7 --> T8[8. Entrega: rama, PR, CI]
    T6 -.property tests si toca dominio.-> T6
```

- **1 → 2 → 3**: sin entorno no hay fixtures, y sin fixtures no corre la matriz E2E.
- **1 → 4**: la regresión solo necesita el repositorio/deps (independiente de fixtures), por eso deriva directamente de la tarea 1.
- **3 + 4 → 5**: el Informe QA consolida resultados E2E y de regresión.
- **5 → 6**: solo se corrigen bugs una vez documentados y priorizados.
- **6 → 7 → 8**: verificación local completa antes de abrir el PR; CI verde cierra la entrega.

## Notas

- Las sub-tareas con `*` (6.4–6.8) son property tests opcionales que **solo** se implementan si el fix correspondiente toca el dominio puro `incidencias.domain.ts`.
- Cada tarea referencia requisitos concretos para trazabilidad; las propiedades de correctness del diseño se referencian en las sub-tareas de property test.
- Los checkpoints aseguran validación incremental antes de la entrega.
- Fixes y cambios de esquema son **solo aditivos** (NFR 9.1); una migración destructiva exige la salvaguarda documentada de NFR 9.2.
