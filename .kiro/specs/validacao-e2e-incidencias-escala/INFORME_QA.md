# Informe QA — Validación E2E: Incidências de Escala

## 1. Encabezado

| Campo | Detalle |
| --- | --- |
| **Fecha** | 2026-07-05 |
| **Módulo** | Incidências de Escala (backend `incidencias.*` + perfil enriquecido y su consumo en mobile) |
| **Entorno** | PostgreSQL 15.16 local (`checkout_pro`, esquema migrado hasta `9w_incidencia_escala`) |
| **API** | NestJS booteada desde `node dist/main.js` en `http://localhost:3000` |
| **Datos** | `npx prisma db seed` aplicado + fixtures deterministas **F0–F5** (aditivos / solo-inserción) |
| **Alcance** | Endpoints CRUD, permisos 401/403, auto-detección de sugestoes desde el ponto, alerta por umbral mensual, perfil enriquecido + timeline, y regresión (backend + mobile) |
| **Fuente de datos crudos** | `_qa_scripts/e2e_results.md` (corrida E2E 2026-07-05T02:40:29Z) |
| **Metodología** | Por caso: `curl -sS -o /tmp/body -w '%{http_code}'` capturando código HTTP + cuerpo; verificaciones de BD mediante `SELECT` de solo lectura |

## 2. Resumen ejecutivo

- **21/23 casos conformes** con el comportamiento esperado.
- **2 bugs confirmados**: 1 de severidad **Alta** (E4) y 1 de severidad **Media** (E14).
- **Regresión verde**: backend **193 tests** OK (incluye property tests fast-check) y mobile **41 tests** OK. Build, lint y type-check sin errores en ambos.
- El módulo es funcionalmente sólido: validaciones de formato, unicidad, permisos por perfil, detección de no-retorno, umbral de notificación y analítica del perfil funcionan según lo diseñado. Los 2 defectos son acotados y corregibles sin cambios de esquema (BUG-1) o con un ajuste puntual del dominio puro + property test (BUG-2).

## 3. Tabla principal de resultados

> Ordenada por severidad descendente: **Alta → Media → Baja → Sin defecto**. Columnas: `Caso | Esperado | Obtenido | Severidad | Archivo | Causa raíz | Fix propuesto`. Los casos conformes llevan severidad **Sin defecto** con causa raíz y fix vacíos (Req 8.4).

| Caso | Esperado | Obtenido | Severidad | Archivo | Causa raíz | Fix propuesto |
| --- | --- | --- | --- | --- | --- | --- |
| E4 | Error + mensaje descriptivo (400) por `colaboradorId` inexistente | **201**; crea fila huérfana con `colaboradorId="colaborador-inexistente-zzz"`, `funcionarioId=null`. Contamina `GET /ranking` (E11) → **CORREGIDO: 400 + "Colaborador informado não existe." (0 filas huérfanas)** | **Alta** | `backend/src/incidencias/incidencias.service.ts` (`registrar`) | `colaboradorId` es `String` sin FK y `registrar()` no valida la existencia del `Colaborador` antes del `create` | Validar existencia del `Colaborador` en `registrar` y lanzar `ColaboradorIncidenciaInvalidoError` (400), sin cambio de esquema. Req violado: **2.3** |
| E14 | 200, SIN sugestión cuando `intervaloMin=0` | **200; 1 sugestión** (Karen, `horaEsperadaRetorno="12:00"`) → **CORREGIDO: 200; `[]`** | **Media** | `backend/src/incidencias/incidencias.domain.ts` (`detectarNaoRetorno`) | La detección de no-retorno ignora `intervaloMin`; con `intervaloMin=0` igual emite sugestión | Retornar `null` cuando `intervaloMin<=0`; ampliar **Property 2** (fast-check ≥100 corridas). Req violado: **4.4** |
| E1 | 201, `origem="MANUAL"`, `horaEsperadaRetorno="14:00"` (saída 12:00 + `intervaloMin` 120) | 201; `origem="MANUAL"`, `horaEsperadaRetorno="14:00"` | Sin defecto | — | — | — |
| E2 | 400 por hora fuera de formato HH:mm | 400; "O horário deve estar no formato HH:mm (00:00–23:59)." | Sin defecto | — | — | — |
| E3 | 400 por fecha inválida (ISO 8601) | 400; "A data deve estar em formato de data válido (ISO 8601)." | Sin defecto | — | — | — |
| E5 | 409 por duplicado `(colaboradorId, tipo, data)` | 409; "Já existe uma incidência deste tipo para este colaborador nesta data." | Sin defecto | — | — | — |
| E6 | 404 en PATCH con id inexistente | 404; "Incidência de escala não encontrada." | Sin defecto | — | — | — |
| E7 | 200 en PATCH válido (motivo=atestado) | 200; `motivo` actualizado a "atestado" | Sin defecto | — | — | — |
| E8 | 404 en DELETE con id inexistente | 404; "Incidência de escala não encontrada." | Sin defecto | — | — | — |
| E9 | 204 sin body en DELETE válido | 204; body vacío | Sin defecto | — | — | — |
| E10 | 200; solo las del filtro, orden `data` desc | 200; 3 incidencias de COL (07-24, 07-10, 07-03) orden desc | Sin defecto | — | — | — |
| E11 | 200; ranking desc por `total` | 200; COL=3, COL2=1, orden desc (desempate asc por nombre) | Sin defecto | — | — | — |
| P1 | 401 sin token | 401; "Autenticação necessária. Informe um token de acesso válido." | Sin defecto | — | — | — |
| P2 | 403 escritura con perfil IMPORTADOR | 403; "Permissão insuficiente para acessar esta funcionalidade." | Sin defecto | — | — | — |
| P3 | 403 lectura con perfil IMPORTADOR | 403; "Permissão insuficiente para acessar esta funcionalidade." | Sin defecto | — | — | — |
| P4 | 201/200 escritura autorizada (dev) | 201 (GERENTE_DESENVOLVEDOR) | Sin defecto | — | — | — |
| P5 | 200 lectura autorizada (dev) | 200; lista de incidencias | Sin defecto | — | — | — |
| E12 | 200; 1 sugestión `DETECTADO_PONTO` (12:00→14:00) | 200; 1 sugestión (Fabiana), `origem="DETECTADO_PONTO"`, `horaSaida="12:00"`, `horaEsperadaRetorno="14:00"` | Sin defecto | — | — | — |
| E13 | 200; SIN sugestión (volvió a DISPONIVEL) | 200; `[]` | Sin defecto | — | — | — |
| E15 | 200; SIN sugestión (ya registrada) | 200; `[]` tras registrar la incidencia del día | Sin defecto | — | — | — |
| E16 | Al 3.º no-retorno del mes: se dispara el umbral | 201; Δnotificaciones=+2 (broadcast: 1 fila por gestor × 2 gestores), título "🔴 Incidências recorrentes na escala", destino GERENTE + GERENTE_DESENVOLVEDOR | Sin defecto | — | — | — |
| E17 | 1.º/2.º/4.º no-retorno: sin notificación de umbral | 201; Δ=0 en 1.º (N=1), 2.º (N=2) y 4.º (N=4) | Sin defecto | — | — | — |
| E18 | Sección `incidencias` completa | 200; `totalNaoRetorno=3`, `ultimoNaoRetorno=2026-07-24`, `diasConsecutivosSemIncidencia=0`, `risco=MEDIO`, `tendencia=MELHORANDO`, `porDiaSemana`(Sex=3), `frequenciaMensal=0.6`, `percentualSobreEscalados=2` | Sin defecto | — | — | — |
| E19 | `timeline` unificado FALTA + NAO_RETORNO orden `data` desc | 200; 5 items [07-24 NAO_RETORNO, 07-13 FALTA, 07-10 NAO_RETORNO, 07-06 FALTA, 07-03 NAO_RETORNO] desc; longitud = 3 incidencias + 2 faltas | Sin defecto | — | — | — |

**Total: 23 casos — 21 conformes, 2 con defecto (E4 Alta, E14 Media).**

## 4. Detalle de los bugs

### BUG-1 (E4) — Severidad Alta

- **Síntoma:** `POST /escala/incidencias` con un `colaboradorId` inexistente devuelve **201** y crea una fila huérfana (`funcionarioId=null`), en vez de rechazar con **400**.
- **Evidencia:** el registro creado tiene `colaboradorId="colaborador-inexistente-zzz"` y `funcionarioId=null`.
- **Archivo:** `backend/src/incidencias/incidencias.service.ts` → `IncidenciasService.registrar`.
- **Causa raíz:** `IncidenciaEscala.colaboradorId` es un `String` **sin FK** a `colaboradores`. `registrar()` invoca `resolverFuncionarioId` (que devuelve `null` cuando no hay vínculo) pero **no verifica la existencia del `Colaborador`** antes del `create`. Resultado: se persiste una incidencia con `colaboradorId` huérfano.
- **Efecto colateral:** el registro fantasma **contamina `GET /ranking`** — en E11 aparece "colaborador-inexistente-zzz" con `total=1`.
- **Fix propuesto:** en `registrar`, verificar `prisma.colaborador.findUnique({ where: { id: colaboradorId } })`; si no existe, lanzar `ColaboradorIncidenciaInvalidoError` (error ya existente, mapea a 400). **Sin cambio de esquema**; respeta `controller → service → domain`. No toca el dominio puro, por lo que no requiere property test nuevo.
- **Requisito violado:** **Req 2.3**.

### BUG-2 (E14) — Severidad Media

- **Síntoma:** `GET /escala/incidencias/sugestoes` con `intervaloMin=0` devuelve **una sugestión** (esperado: omitirla).
- **Evidencia:** sugestión de Karen con `horaEsperadaRetorno="12:00"` (igual a `horaSaida`, indicio de intervalo nulo).
- **Archivo:** `backend/src/incidencias/incidencias.domain.ts` → `detectarNaoRetorno` (usado por `IncidenciasService.sugestoes`).
- **Causa raíz:** `detectarNaoRetorno(transicoes, intervaloMin)` deduce el no-retorno solo por las transiciones de ponto, **sin considerar `intervaloMin`**. Con `intervaloMin=0` (día sin intervalo previsto) no puede existir un "no-retorno del intervalo", pero la lógica igualmente emite la detección.
- **Fix propuesto:** en `detectarNaoRetorno`, retornar `null` cuando `intervaloMin<=0` (o filtrar en `sugestoes` cuando el intervalo resuelto sea 0). Al tocar el **dominio puro**, ampliar la **Property 2** (`incidencias.properties.spec.ts`, fast-check ≥100 corridas) con el caso `intervaloMin=0 ⇒ sin detección`.
- **Requisito violado:** **Req 4.4**.

## 5. Hallazgos informativos (no defectos)

1. **El seed no crea registros `Colaborador`.** `migrate deploy` + `db seed` dejan la tabla `colaboradores` vacía (el backfill `9s_colaboradores_de_fiscais` corre sobre base vacía y el seed no re-backfillea). Se resolvió en la validación con el **backfill F0** (SQL insert-only idempotente). **Candidato a mejora del seed → Tarea 6.1.**
2. **`diasConsecutivosSemIncidencia=0` (E18) es un artefacto de fixture.** Las incidencias sembradas caen **después** de `hoje` (2026-07-05) porque el fixture usa fechas relativas al mes actual (07-10 / 07-24 son futuras). El cálculo `max(0, hoje − ultima)` da 0. No es un defecto de la lógica.
3. **El umbral crea 1 fila por gestor (broadcast).** `NotificacoesService.enviar` genera una fila por destinatario; con 2 gestores → 2 filas. Se interpreta Req 5.1 ("una única Notificacao_Umbral dirigida a los gestores") como **un único disparo** al cruzar el umbral, entregado a cada gestor. Se dispara exactamente una vez (al conteo=3) y no se repite (4.º POST Δ=0). **Conforme.**
4. **Discrepancia de log HTTP interno (cosmético).** Se observó que el log HTTP interno puede registrar 200 mientras el cliente recibe correctamente 400. No afecta la respuesta al cliente; **evaluar** si conviene alinear el log.

## 6. Resultado de la regresión

| Suite | Comandos | Nº de tests | Veredicto |
| --- | --- | --- | --- |
| **Backend** (`backend/`) | `npm run build`, `npm run lint`, `npm test` (incluye property tests fast-check) | **193 tests** | ✅ Verde — todos los comandos finalizan con éxito |
| **Mobile** (`mobile/`) | `npm run type-check`, `npm run lint`, `npm test` | **41 tests** | ✅ Verde — todos los comandos finalizan con éxito |

**Veredicto de regresión:** la validación no introduce regresiones; el proyecto existente permanece estable (Req 7.1, 7.2).

## 7. Conclusión y priorización de fixes

El módulo Incidências de Escala está listo salvo dos defectos acotados. Orden de corrección recomendado:

1. **BUG-1 (E4) — Alta** — primero. Impacto directo en la integridad de datos (filas huérfanas) y contaminación del ranking. Fix acotado en `incidencias.service.ts` sin cambio de esquema.
2. **BUG-2 (E14) — Media** — a continuación. Ajuste puntual en el dominio puro (`detectarNaoRetorno`) + ampliación de la Property 2 (fast-check ≥100).
3. **Mejora del seed (backfill de colaboradores)** — para que `migrate deploy` + `db seed` dejen `colaboradores` poblada sin necesidad del F0 manual (Tarea 6.1).

> Nota: los cambios propuestos son **solo aditivos** (NFR 9.1); ninguno requiere migración destructiva.


## 8. Resultados tras corrección (Tarea 6)

> Los 3 fixes se aplicaron sobre la rama `fix/validacao-e2e-incidencias-escala` (solo aditivos; sin migraciones destructivas). Re-ejecución E2E contra el mismo PostgreSQL real (API `node dist/main.js` recompilada) + regresión completa backend/mobile.

### 8.1 Fixes aplicados

| # | Bug / mejora | Archivo | Cambio | Requisito |
| --- | --- | --- | --- | --- |
| Fix 1 | BUG-1 (E4, Alta) | `backend/src/incidencias/incidencias.service.ts` (`registrar`) | Antes del `create`, valida `prisma.colaborador.findUnique({ where:{ id: colaboradorId } })`; si no existe, lanza `ColaboradorIncidenciaInvalidoError` (400). Sin cambio de esquema; respeta controller→service→domain. | 2.3 |
| Fix 2 | BUG-2 (E14, Media) | `backend/src/incidencias/incidencias.domain.ts` (`detectarNaoRetorno`) | Retorna `null` cuando `intervaloMin<=0` (o no finito) antes de inspeccionar el log. Lógica pura preservada. Se amplió la **Property 2** (`incidencias.properties.spec.ts`, fast-check `numRuns:100`) con el caso `intervaloMin<=0 ⇒ sin detección`. | 4.4 |
| Fix 3 | Seed no crea `Colaborador` | `backend/prisma/seed.ts` | Nueva `seedColaboradoresFiscais()` (insert-only, idempotente, espejo de la migración `9s`): crea la ficha `Colaborador` FISCAL + su `ColaboradorIdentificador` MATRICULA a partir de los fiscais sembrados. Sin migración destructiva. | 1.2, 9.1 |

### 8.2 Re-ejecución de casos (mismo entorno E2E)

| Caso | Antes del fix | Después del fix | Estado |
| --- | --- | --- | --- |
| **E4** | 201 + fila huérfana; contamina ranking | **HTTP 400**, `{"mensagem":"Colaborador informado não existe."}`; **0 filas huérfanas** en `incidencias_escala` | ✅ Conforme |
| **E14** | 200 + 1 sugestión (intervaloMin=0) | **HTTP 200**, cuerpo **`[]`** | ✅ Conforme |
| E1 (regresión happy-path) | 201, `horaEsperadaRetorno="14:00"` | **201**, `horaEsperadaRetorno="14:00"` (derivada de saída 12:00 + intervaloMin 120) | ✅ Sin regresión |
| E5 (duplicado) | 409 | **409** "Já existe uma incidência..." | ✅ Sin regresión |
| E11 (ranking) | COL=3, COL2=1 (contaminado por el fantasma cuando existía) | **200**; `[{Auri:3},{Betzabeth:1}]` desc, **sin** `colaborador-inexistente-zzz` | ✅ Sin regresión |

### 8.3 Verificación del Fix 3 (seed)

- **BD limpia** (`checkout_seedtest`): `migrate deploy` → `colaboradores = 0`; tras `prisma db seed` → **10 colaboradores FISCAL + 10 identificadores MATRICULA**, sin necesidad del backfill manual F0.
- **Idempotencia**: un segundo `db seed` mantiene 10 colaboradores (no duplica).
- **BD principal**: `db seed` corre sin error y `colaboradores` FISCAL = 10.

### 8.4 Regresión tras corrección

| Suite | Comandos | Nº de tests | Veredicto |
| --- | --- | --- | --- |
| **Backend** | `npm run build`, `npm run lint`, `npm test` | **195 tests** (193 previos + 1 unit E4 + 1 property `intervaloMin<=0`) | ✅ Verde |
| **Mobile** | `npm run type-check`, `npm run lint`, `npm test` | **41 tests** | ✅ Verde |

**Veredicto final:** los 2 bugs (E4 Alta, E14 Media) quedan corregidos y verificados E2E; la mejora del seed (Fix 3) deja `colaboradores` poblada tras `migrate deploy` + `db seed`. No se introdujeron regresiones. Cambios **solo aditivos** (NFR 9.1).
