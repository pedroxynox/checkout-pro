# Check-out PRO — Estado actual y pendientes (handoff)

> Continuidad operativa del repositorio. Leer junto con `PROJECT_UNDERSTANDING.md` (snapshot canónico) y `.kiro/steering/arquitetura.md` (mapa técnico). Actualizado: **2026-07-15**.

## Estado verificable

- Rama base auditada: `main` en `e8c32be` (merge de PR #235).
- Todo lo descrito como entregado está **mergeado en `main`**; el deploy de ese commit no fue confirmado desde esta sesión.
- Última migration: `9zp_tipo_contrato_colaborador`.
- Backend: build OK; **71 suites / 406 tests**.
- Mobile: type-check + lint OK; **23 suites / 85 tests**.
- ESLint focalizado TAC: OK.
- Lint global backend sin `--fix`: 31 errores Prettier preexistentes en cuatro archivos; limpiar en PR independiente.

## Entregas recientes

- **#211–#214:** auditoría de seguridad/privacidad, validación de uploads/entradas, atomicidad de ausencias y monitoreo de dependencias.
- **#223:** mejoras de rendimiento/UX en contexto de notificaciones y sello de estado.
- **#224–#225:** Central de Jornada, Relógio Ponto, feriados y contrato 6x1–2x1 (backend + app).
- **#226 y #232:** Dependabot ajustado para evitar ruido, majors y paquetes controlados por Expo/NestJS.
- **#234:** TAC en tiempo real para supervisión/gerencia y jornada consciente de feriados.
- **#235:** alertas preventivos TAC (1h30/1h40), deduplicación compartida entre batida y cron.

## Reglas críticas que no deben cambiarse sin decisión de producto

### Ponto/TAC
- Riesgo: extras `>=1h30`; riesgo alto: `>=1h40`; TAC por extras solo `>1h50`.
- Intervalo `<1h` o `>3h` también es TAC.
- Domingo/feriado: carga 7h20 y extras 100%; seg–qui 7h, sex–sáb 8h.
- Avisos TAC solo a `SUPERVISOR`, `GERENTE`, `GERENTE_DESENVOLVEDOR`.
- Envío best-effort: nunca bloquear la batida.
- Dedupe por persona/día/etapa en memoria; batida y cron comparten estado. Reinicio puede permitir reaviso.

### Central de Jornada
- Ciclo 26→25; contrato `SEIS_X_UM_DOIS_X_UM`.
- Incluye operador, supervisor y fiscal.
- Saldo = extras 50 + extras 100 − horas devidas.
- Falta puede convertirse en débito; comparativo hasta 12 ciclos.

### Feriados/contratos
- Nacionales automáticos; estatales/municipales manuales; Carnaval/Corpus Christi no automáticos.
- `SEIS_X_UM_DOIS_X_UM` gobierna la jornada; no es el estado del contrato de experiencia.
- La experiencia se calcula para operadores activos: hasta 90 días, alerta en los 5 días previos y efectivación automática el día 91.
- El cron de experiencia notifica actualmente a `FISCAL`, `SUPERVISOR`, `GERENTE` y `GERENTE_DESENVOLVEDOR`.

## Infraestructura

- API: `https://checkout-pro-api.onrender.com`.
- Web: `https://checkout-pro-web.onrender.com`.
- PostgreSQL Render: tratar el plan gratuito/no persistente como riesgo de pérdida/indisponibilidad.
- Variables esenciales: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `SENHA_INICIAL`, `RETENCAO_INATIVOS_MESES`; mobile: `EXPO_PUBLIC_API_URL`.
- Push real ya existe en backend mediante Expo Push Service y tokens persistidos. Para Android con app cerrado: configurar FCM en Expo/EAS y recompilar/publicar APK.
- Mover `prisma migrate deploy` a Pre-Deploy. Start Command debe abrir el servidor directamente; no dejarlo esperando un advisory lock.
- Verificar `/health/ready` y logs; nunca inferir deploy por el merge.

## Pendientes priorizados

### P0 — antes de operación/entrega estable
1. Configurar FCM y generar/publicar APK nuevo.
2. Validar OCR/ML Kit con comprobantes reales en Android y afinar parser con muestras reales.
3. Migrar PostgreSQL Render a plan persistente/estable.
4. Configurar migrations en Pre-Deploy y ensayar deploy/rollback.
5. Activar tier pago Gemini para concurrencia multiusuario.

### P1 — producto
6. Decidir terminar o retirar Alertas de Fila, Normativas e Indicador de Quebra (hoy ocultos).
7. Normativas: diseñar ingestión/RAG con pgvector + object storage antes de reactivar.
8. Preparar `reset:cliente` + seed mínimo, sin datos demo/piloto, antes de entregar.

### P2 — deuda/evolución
9. Persistir deduplicación TAC si se requiere garantía entre reinicios/múltiples instancias.
10. Limpiar 31 errores Prettier en PR aislado:
   - `backend/src/alertas/alertas.service.spec.ts`
   - `backend/src/fiscais/fiscais.service.ts`
   - `backend/src/insumos/insumos.service.ts`
   - `backend/test/helpers/fake-prisma.ts`
11. Multi-tenancy sigue parqueado hasta estabilizar una tienda. Plan futuro: `lojaId`, RLS y tests de aislamiento.

## Flujo de trabajo

- Rama nueva desde `main` actualizada; un PR por lote lógico.
- Commits/PRs en portugués; respuesta al usuario en español.
- GitHub: usar el power/herramientas autenticadas; no `git push` desde bash.
- No ejecutar lint backend con `--fix` para validar: puede alterar archivos ajenos. Usar ESLint focalizado o revisar el diff inmediatamente.
- No afirmar “en producción” sin logs/commit de deploy.
- Nueva migration debe ordenar después de `9zp_tipo_contrato_colaborador`.

## Verificación antes de publicar

- Backend: Prisma generate/validate, build, tests y ESLint focalizado.
- Mobile: type-check, lint, tests y export web cuando el cambio afecte bundle/navegación.
- Revisar `git diff --check`, diff completo y estado de Git.
- Si toca DB: ensayar migration en PostgreSQL descartable y documentar rollback/compatibilidad.

## Decisiones vigentes

- Objetivo: app de una tienda 100% operativa antes de escalar.
- Multi-tenancy no es prioridad actual.
- Merge, deploy y configuración externa son estados diferentes.
- `PROJECT_UNDERSTANDING.md` es la fuente canónica; este archivo solo mantiene el handoff operativo.
