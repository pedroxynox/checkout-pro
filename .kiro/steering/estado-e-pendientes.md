# Check-out PRO — Estado actual y pendientes (handoff)

> Continuidad operativa del repositorio. Leer junto con [`docs/README.md`](../../docs/README.md) (índice de la documentación) y `.kiro/steering/arquitetura.md` (mapa técnico). Actualizado: **2026-10-10**.
>
> **Números** (suites, casos, rutas, tablas, migraciones): no se repiten aquí. La fuente única es [`docs/08-gestao/estado-e-metricas.md`](../../docs/08-gestao/estado-e-metricas.md), generada por `npm run docs:gen`.

## En curso: fin del 6x1 → jornada 5x2 (desde 22/11/2026)

- Spec: [`.kiro/specs/jornada-5x2/`](../specs/jornada-5x2/requirements.md); resumen y reglas de la transición en `.kiro/steering/jornada-5x2.md`.
- Desde el **23/11/2026** la empresa opera en 5x2 (44 h); el **16/12/2026** pasa a 42 h. Los días hasta el 22/11 siguen en 6x1 mediante vigencias.
- Las "Reglas críticas" de abajo describen el **6x1** y siguen valiendo para los días hasta el 22/11. Para los contratos 5x2 valen las del spec.
- Mientras dure la transición: pausa `PAUSA_TRANSICAO_JORNADA=true` en producción, no cerrar el ciclo 26/10–25/11 y no editar el contrato 6x1 ni las fichas.
- Fase 2 (backend #442 + app): los números del TAC, los avisos y el feriado vienen del contrato del día; un contrato en uso tiene las reglas bloqueadas (se duplica para cambiar). Para el 6x1 todo da igual que antes. La pantalla Tipos de contrato ya tiene los campos nuevos, Duplicar y Tornar padrão; el Registro de Ponto cita los números del contrato. Falta que el dueño cree el contrato 5x2 44h (tarea 2.8).
- Fase 3: rodízio de folgas G1/G2/G3 con vigencia (tabla `rodizio_folgas_vigencias`, sembrada el 23/11/2026, ADR 0028). Solo decide a quien tiene grupo en una vigencia de jornada (todavía nadie hasta la Fase 4). Pantalla "Rodízio de folgas" en el Centro de Controle (reemplaza la card del rodízio de domingo).

## Estado verificable

- Todo lo descrito como entregado está **mergeado en `main`**; el deploy de cada commit debe confirmarse por logs y `/health/ready`.
- Última migration: `9zzw_rodizio_folgas`. La siguiente debe ordenar después de `9zzw`.
- **El app no tiene IA.** La asistente Cluby (Google Gemini) fue retirada por completo en oct/2026: módulo backend, chat del app, tabla `mensagens_assistente`, imágenes de procedimientos y las variables `GEMINI_API_KEY`/`GEMINI_MODEL`.
- En el sandbox de Kiro no hay acceso al registro npm: los tests se validan en el CI del PR. Para comandos de Node, vaciar `NODE_OPTIONS`.

## Entregas recientes (resumen)

- **#422:** faltas y no-retornos PENDIENTES se cierran solos como "no justificada" a los 3 días (cron 03:00, aviso único 08:00); cerrar el ciclo de folha cierra los pendientes; débito en día "faltou (não registrada)".
- **#421:** la Central de Jornada respeta las vacaciones (día de férias no es falta).
- **#420:** indicadores y detalle usan la meta del mes editada en Metas.
- **#418:** el detalle de la jornada refleja la exclusión de un atestado.
- **#413–#415:** el horario es el de la ficha (ADR 0026) y Conferencia de escala.
- **#403–#412:** compensación de horas (ADR 0021), indicador Sacolas (ADR 0022), Cancelamentos Totais (ADR 0025), contrato de experiencia de la persona (ADR 0024).

Histórico completo en [`docs/08-gestao/historico-de-mudancas.md`](../../docs/08-gestao/historico-de-mudancas.md).

## Reglas críticas que no deben cambiarse sin decisión de producto

### Ponto/TAC
- (6x1) Riesgo: extras `>=1h30`; riesgo alto: `>=1h40`; TAC por extras solo `>1h50`. En otros contratos, los minutos del contrato.
- (6x1) Intervalo `<1h` o `>3h` también es TAC; sin tope diario. En otros contratos, los del contrato (5x2: máx. 2h50, tope 10h).
- (6x1) Domingo/feriado: carga 7h20 y extras 100%; seg–qui 7h, sex–sáb 8h. El feriado tiene carga propia por contrato.
- Avisos TAC solo a `SUPERVISOR`, `GERENTE`, `ADMINISTRADOR`.
- Envío best-effort: nunca bloquear la batida.
- Dedupe por persona/día/etapa PERSISTENTE (tabla `AlertaTacEnviado`).

### Central de Jornada
- Ciclo 26→25; incluye operador, supervisor y fiscal.
- Saldo = extras 50 + extras 100 − horas devidas.
- Falta puede convertirse en débito (decisión del gestor; el cierre automático nunca pone débito).

### Escala, faltas y justificativas
- El horario y la folga son los de la **ficha** (ADR 0023 y 0026).
- Vacaciones y atestados sacan a la persona de la escala y no generan falta.
- Pendientes de escala se cierran solos a los 3 días (`DIAS_ENCERRAMENTO_AUTOMATICO`).

### Feriados/contratos
- Nacionales automáticos; estatales/municipales manuales; Carnaval/Corpus Christi no automáticos.
- La experiencia: hasta 90 días, alerta en los 5 días previos y efectivación automática el día 91.

## Infraestructura

- API: `https://checkout-pro-api.onrender.com` · Web: `https://checkout-pro-web.onrender.com`.
- Render: banco `basic-256mb` (persistente) y web `starter` (no hiberna) desde jul/2026 (ADR 0013).
- `prisma migrate deploy` corre en **Pre-Deploy** (`render.yaml`); el Start Command abre el servidor directo.
- Variables: ver [`docs/07-operacao/variaveis-de-ambiente.md`](../../docs/07-operacao/variaveis-de-ambiente.md). Mobile: `EXPO_PUBLIC_API_URL`.
- Push real existe en backend (Expo Push Service). Para Android con app cerrado: configurar FCM en Expo/EAS y recompilar/publicar APK.
- Archivos subidos (fotos de checklist) aún en disco efímero: migrar a storage de objetos (S3).
- Tras el deploy de la remoción de la Cluby: **borrar `GEMINI_API_KEY` y `GEMINI_MODEL` del panel del Render** (ya no se usan).

## Pendientes priorizados

Lista completa y comentada en [`docs/08-gestao/roadmap-e-pendencias.md`](../../docs/08-gestao/roadmap-e-pendencias.md).

### P0 — antes de operación/entrega estable
1. Configurar FCM y generar/publicar APK nuevo.
2. Validar OCR/ML Kit con comprobantes reales en Android.
3. Ensayar deploy y rollback de una migration.

### P1 — producto
4. Decidir terminar o retirar Alertas de Fila, Normativas e Indicador de Quebra (hoy ocultos).
5. Preparar `reset:cliente` + seed mínimo, sin datos demo/piloto.

### P2 — deuda/evolución
6. Retirar `EscalaEntry` (etapa 3 de la ADR 0026).
7. Storage de objetos para archivos subidos.
8. Multi-tenancy sigue parqueado hasta estabilizar una tienda.

## Flujo de trabajo

- Rama nueva desde `main` actualizada; un PR por lote lógico.
- Commits/PRs y documentación en portugués; respuesta al usuario en español, simple y resumida.
- Regla de documentación: `.kiro/steering/documentacao.md` (`npm run docs:gen` + `npm run docs:check`).
- No ejecutar lint backend con `--fix` para validar: puede alterar archivos ajenos.
- No afirmar "en producción" sin logs/commit de deploy.

## Verificación antes de publicar

- Backend: Prisma generate/validate, build, tests y ESLint focalizado.
- Mobile: type-check, lint, tests y export web cuando el cambio afecte bundle/navegación.
- Revisar `git diff --check`, diff completo y estado de Git.
- Si toca DB: ensayar migration en PostgreSQL descartable y documentar rollback/compatibilidad.
