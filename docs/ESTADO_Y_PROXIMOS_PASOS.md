# Estado del Proyecto y Próximos Pasos — Check-out PRO

> Documento vivo de traspaso: dónde está el proyecto hoy, qué hace, qué datos/config necesita y **cuáles son los próximos pasos**. Última actualización: 2026-07-03.

## 1. Resumen ejecutivo

**Check-out PRO** es una app de gestión inteligente de la frente de caja de un supermercado (backend NestJS + app Expo/React Native, PostgreSQL vía Prisma, asistente IA con Gemini, hosting en Render). Centraliza: carga de archivos operativos, indicadores/metas, insumos, sacolas APAE, checklists, jornada de fiscales en tiempo real, panel de ventas y el asistente "Cluby".

**Estado:** en producción, **sano y verificado**. Compila, tipa y lintea limpio; **193 tests backend + 41 mobile**; ejecución E2E validada contra un PostgreSQL real (migraciones, seed, arranque, auth, rate-limit, headers de seguridad).

**Este ciclo se completó:**
- Auditoría de seguridad (PRs #91–#94): `JWT_SECRET` obligatorio en prod, remoción de deps con CVE (xlsx/papaparse), rate-limit en login + helmet, límites de upload, CORS por allowlist, clave Gemini en header, y **revocación de sesiones** (`tokenVersion`).
- Rendimiento (#95): fin de N+1 en insumos, agregaciones en BD, consultas en paralelo.
- Atomicidad y errores (#96): errores auto-clasificados (sin 500 silenciosos), cierre de fechamento idempotente, anti-duplicación de auto-reposición.
- Pulido y observabilidad (#97): DRY, correlation-id + log de requests, docs de seguridad, checklist de producción.
- QA integral ejecutado (build, lint, type-check, tests, E2E contra Postgres real).
- **Nuevo módulo "Incidências de Escala"** (#100 backend + #101 mobile): registro del evento "No retornó del intervalo", auto-detección desde el ponto de fiscales, analítica e historial unificado en el perfil.

## 2. Arquitectura y stack (resumen)

- **Monorepo** npm workspaces: `backend/` (NestJS 10 + Prisma + PostgreSQL) y `mobile/` (Expo SDK 52 / React Native 0.76 + react-native-web).
- **Patrón por módulo:** `*.controller.ts` (HTTP) → `*.service.ts` (orquestación/persistencia) → `*.domain.ts` (lógica pura, testeada con **property-based testing** / fast-check). DTOs con class-validator; errores de dominio (`ErroDominio` con `statusHttp`) traducidos por un filtro global.
- **Autenticación:** JWT Bearer (30 días) con `tokenVersion` para revocación. **Autorización:** allowlist por funcionalidad (`@Funcionalidade` + `PerfilGuard`); fuente única en `acessos.domain.ts`.
- **Tiempo real:** Socket.IO (estado de fiscales, notificaciones in-app). **Cron:** alertas y limpieza. **IA:** Gemini (`gemini-2.5-flash`) con timeout y concurrencia acotada.
- **Perfiles:** GERENTE_DESENVOLVEDOR, GERENTE, SUPERVISOR, FISCAL, IMPORTADOR.

## 3. Funcionalidades (por módulo)

**Backend (módulos):** acessos (login/identidad), usuarios, colaboradores (Cadastro Unificado + perfil inteligente), arrecadacao/indicadores, vendas (painel), metas, fechamento (resumen del día), insumos + pedidos-recorrentes, requisicoes, lote-apae (sacolas APAE), fiscais (jornada + escala), **incidencias** (incidências de escala — nuevo), checklist, operadores/quadro-operadores, notificacoes, assistente (Cluby), alertas. Además: common (guards, filtros, config, upload, cors, correlation-id), prisma, health (`/health` liveness + `/health/ready` readiness con chequeo de BD).

**Mobile (pantallas):** Login; Home por perfil (Pulso del Día); Indicadores + detalle; Painel de Vendas; Insumos + requisiciones; Sacolas APAE; Checklist; Fiscais (jornada en tiempo real); **Escala** (con registro y sugerencias de "no retorno del intervalo"); Colaboradores + **Perfil** (score, indicadores, faltas y **historial unificado de incidencias**); Notificaciones; Cluby; Centro de Control (según permisos). Cache offline con SQLite.

## 4. Datos y configuración necesarios

### Variables de entorno (Render / `.env`)
| Variable | Obligatoria | Notas |
|---|---|---|
| `JWT_SECRET` | **Sí (prod)** | La API **no arranca** sin ella en producción. Usar `openssl rand -hex 32`. |
| `DATABASE_URL` | **Sí (prod)** | Cadena PostgreSQL. La API no arranca sin ella en prod. |
| `CORS_ORIGINS` | Recomendada | Orígenes permitidos separados por coma (ej. la URL de la web). Si falta, refleja cualquier origen. |
| `GEMINI_API_KEY` | Para la Cluby | Sin ella, el asistente responde "no configurado". |
| `GEMINI_MODEL` | No | Default `gemini-2.5-flash`. |
| `JWT_EXPIRES_IN` | No | Default `30d`. |
| `HORARIO_FIM_DO_DIA` | No | Default `22:50`. |
| `SENHA_INICIAL` | Sí (seed) | Contraseña inicial de los usuarios del seed. En `render.yaml` es secreto (`sync: false`) — cargar en el panel. |
| `EXPO_PUBLIC_API_URL` (mobile) | Sí | URL pública de la API. |

### Migraciones
Van de `0_init` hasta `9w`. Las de este ciclo:
- `9t_usuario_token_version` — revocación de sesiones.
- `9u_fechamento_concluido` — marca idempotente de cierre.
- `9v_requisicao_automatica` — anti-duplicado de auto-reposición.
- `9w_incidencia_escala` — nuevo módulo de incidencias de escala.
Se aplican con `prisma migrate deploy` (configurado como **Pre-Deploy Command** en `render.yaml`).

### Comandos útiles
- Backend: `npm run build`, `npm test`, `npm run lint`, `npx prisma generate`, `npx prisma migrate deploy`, `npm run seed`.
- Mobile: `npm run type-check`, `npm test`, `npm run lint`, `npx expo export --platform web`.
- CI (GitHub Actions, Node 20): build + lint + tests de backend y mobile + export web.

## 5. Próximos pasos (priorizados)

### Bloqueante / operación
- [ ] Cargar en Render: `JWT_SECRET`, `DATABASE_URL`, `CORS_ORIGINS`, `GEMINI_API_KEY`, `SENHA_INICIAL` (ver `docs/CHECKLIST_PRODUCAO.md`).
- [ ] Confirmar que las migraciones nuevas (`9t`–`9w`) se apliquen en el deploy.
- [ ] **Migrar la base de datos a un plan persistente** — la free de Render expira ~30 días (riesgo de pérdida de datos). Es lo más urgente a mediano plazo.

### Importante
- [ ] **Gemini plan pago** — la cuota gratuita (~20 req/min) no alcanza para ~15 fiscales simultáneos.
- [ ] **Validación E2E del módulo de incidencias** — probar contra Postgres real: registro manual, sugerencias auto-detectadas desde el ponto, edición/eliminación, alerta por umbral y el historial unificado en el perfil.
- [ ] Endurecer el deploy (ya migrado a Pre-Deploy Command) y borrar el servicio web duplicado en Render.

### Deuda técnica / calidad
- [ ] **Upgrade a NestJS 11** (Express 5) — cierra vulnerabilidades de deps (multer/qs/uuid). Cambio mayor/breaking: hacerlo en rama dedicada, ajustar el comodín de rutas del middleware (`forRoutes('*')`) y correr regresión completa. No urgente (los uploads ya exigen auth + límite de tamaño).
- [ ] **Subir la cobertura de tests del backend** (~30%): priorizar controllers de auth/arrecadação/insumos e incidencias.

### Producto / evolución
- [ ] Completar o retirar las áreas "em breve" (Alertas de Fila, Normativas, Indicador de Quebra).
- [ ] **Push notifications reales** (Expo Push/FCM) — hoy solo hay in-app/WebSocket.
- [ ] Unificar el catálogo de permisos backend↔mobile en un paquete compartido (toca el build de Expo).
- [ ] Limpieza de modelos deprecados (`Operador`, `OperadorTurno`, `RegistroOperacional`, `RegistroImportacao`) y de la columna `Insumo.saldo` (siempre 0) — migración destructiva: evaluar preservación de histórico.
- [ ] **Evolución del módulo de incidencias:** el diseño es genérico por `tipo`, así que se pueden sumar nuevos eventos SIN tablas nuevas (ej.: `ATRASO`, `SAIDA_ANTECIPADA`, `RETORNO_TARDIO`, `ADVERTENCIA`). Además: ranking de incidencias a nivel módulo y comparativas entre períodos.

## 6. Cómo trabajar en este proyecto (flujo)

1. Rama nueva desde `main`; cambios acotados por lote lógico.
2. Respetar patrones: dominio puro + property tests, allowlist por funcionalidad, migraciones **aditivas** (nunca destructivas), errores vía `ErroDominio`.
3. Verificar local: build + lint + type-check + tests (y E2E contra Postgres si toca BD).
4. Push + PR contra `main`; la CI valida. Merge tras verde.
5. Documentar: entrada en `REGISTRO_DE_MUDANCAS.md` y un ADR en `docs/adr/` para decisiones de arquitectura.

## 7. Documentos de referencia en el repo
- `README.md` — puesta en marcha y variables.
- `PROJECT_UNDERSTANDING.md` — visión general del producto.
- `REGISTRO_DE_MUDANCAS.md` — bitácora de cambios.
- `docs/API.md` — contrato de endpoints y permisos.
- `docs/CHECKLIST_PRODUCAO.md` — checklist de producción.
- `docs/adr/` — decisiones de arquitectura (incluye 0007: tabla genérica de incidencias).
- `GUIA_QA.md` — pruebas manuales por perfil.
- `.kiro/steering/` — arquitectura y estado/pendientes.
