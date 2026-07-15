# PROJECT_UNDERSTANDING — Check-out PRO

> Snapshot canónico para continuidad del proyecto. Resume producto, arquitectura, reglas de negocio, entregas, calidad, operación, riesgos y próximos pasos. Complementa el historial de `REGISTRO_DE_MUDANCAS.md`, el QA de `GUIA_QA.md` y el mapa técnico de `.kiro/steering/arquitetura.md`.
>
> Última revisión: **2026-07-15**. Idioma de trabajo/handoff: español; UI, dominio y código: portugués de Brasil.

## 1. Resumen ejecutivo

**Check-out PRO** gestiona la operación de la frente de caja de un supermercado desde web y Android: personas y accesos, importaciones, indicadores, ventas, stock, checklists, escalas, punto, jornada, contratos, disciplina, notificaciones y asistencia con IA.

El estado funcional documentado está **mergeado en `main`** hasta `e8c32be` (PR #235). No se verificó desde este trabajo que ese commit esté efectivamente desplegado en producción; por eso se distingue siempre entre **implementado/mergeado**, **deploy confirmado** y **configuración externa pendiente**.

Validación más reciente:
- Backend: build correcto; **71 suites / 411 tests**.
- Mobile: type-check y lint correctos; **23 suites / 85 tests**.
- ESLint focalizado de los archivos TAC: correcto.
- Prettier: los cuatro archivos históricos ya fueron formateados (ver §10). Con Prettier 3.9.5 el `--check` global marca 9 archivos de dominio adicionales por deriva de versión; el CI los normaliza al vuelo vía `eslint --fix`, por lo que no rompen la validación.

## 2. Producto y perfiles

Perfiles de acceso:
- `GERENTE_DESENVOLVEDOR`: acceso total y administración de datos/configuración.
- `GERENTE`: operación y gestión, con restricciones estructurales según la allowlist.
- `SUPERVISOR`: operación y supervisión de equipos/jornada.
- `FISCAL`: rutinas de caja, punto y consulta según permisos.
- `IMPORTADOR`: carga de archivos operativos.
- Los operadores se administran como colaboradores, pero no reciben necesariamente login del app.

La autorización se define por funcionalidad en `backend/src/acessos/acessos.domain.ts` y se refleja en mobile. `Colaborador` es la fuente única de personas; matrícula/login e identificadores permiten atribuir movimientos históricos.

## 3. Arquitectura

Monorepo npm workspaces:

```text
mobile/ (Expo SDK 52 / React Native 0.76 / web)
   └── REST HTTPS + JWT / Socket.IO
backend/ (NestJS 10 / Prisma 5 / cron)
   └── PostgreSQL / Gemini / Expo Push Service
```

Patrón backend:
- `*.controller.ts`: contrato HTTP y permisos.
- `*.service.ts`: orquestación, transacciones y persistencia.
- `*.domain.ts`: reglas puras y determinísticas.
- `dto/`: validación de entrada.
- errores de dominio: traducidos por filtro global.

Patrón mobile: `api`, `auth`, `components`, `navigation`, `screens`, `hooks`, `offline`, `theme` y `utils`. El app mantiene soporte web y cola offline en SQLite para los flujos compatibles.

Servicios externos:
- Render: API, web y PostgreSQL.
- Google Gemini: Cluby.
- Expo/EAS: compilación y distribución Android.
- Expo Push Service: envío push; Android requiere credenciales FCM.

## 4. Mapa funcional actual

### Núcleo y seguridad
- `acessos`, `usuarios`: login por matrícula, JWT, revocación con `tokenVersion`, rate limiting y permisos por funcionalidad.
- `colaboradores`: cadastro unificado, identificadores, perfil inteligente, activación/inactivación y purga con retención.
- `common`, `config`, `prisma`, `storage`: filtros, guards, validación de entorno, observabilidad, BD y archivos.

### Operación comercial
- `arrecadacao`: carga `.txt`, indicadores, rankings y no reconocidos.
- `vendas`: ventas por hora y total diario.
- `metas`: metas mensuales.
- `fechamento`: resumen del día, consistencia y conclusión idempotente.
- `insumos`, `requisicoes`: movimientos de stock, solicitudes y pedidos recurrentes; el stock no puede quedar negativo.
- `lote-apae`: Sacolas APAE, lote, saldo y configuración.
- `checklist`: apertura/cierre con imagen, ventanas y hash anti-fraude.

### Personas, escala y jornada
- `fiscais`: estado en tiempo real y jornada histórica.
- `operadores`: cuadro, escala y ausencias.
- `ponto`: batidas, OCR del comprobante, cálculo de jornada y alertas TAC.
- `central-jornada`: consolidación por ciclo 26→25 y comparativos.
- `feriados`: calendario nacional automático y fechas estatales/municipales manuales.
- `escala-domingo`: alternancia/configuración de domingos.
- `incidencias`, `advertencias`: faltas, no retorno, sanciones, justificativas y solicitudes con aprobación.
- `contratos`: contrato de experiência dos operadores ativos, derivado da data de admissão; `tipoContrato` pertence às regras de jornada do colaborador.
- `feedforward`: seguimiento/desarrollo de colaboradores.
- `data-inicial`, `reset-operacional`: fecha mínima y reinicio controlado de datos operativos.

### Comunicación
- `notificacoes`: persistencia in-app, WebSocket y envío real al Expo Push Service.
- `alertas`: crons operacionales.
- `assistente`: Cluby con Gemini; procedimientos masivos todavía desactivados.

## 5. Reglas de negocio confirmadas

### 5.1 Registro de Ponto y TAC

Fuente principal: `backend/src/ponto/ponto.domain.ts`.

- Carga base: lunes–jueves 7h; viernes–sábado 8h; domingo/feriado 7h20.
- Extras: lunes–sábado al 50%; domingo y feriado al 100%.
- Intervalo no cuenta como trabajo y debe estar entre 1h y 3h.
- Umbrales de extras:
  - desde 1h30 (`90 min`): riesgo de TAC;
  - desde 1h40 (`100 min`): riesgo alto;
  - TAC solo cuando las extras son **mayores** a 1h50 (`>110 min`). Exactamente 1h50 todavía no cruza el umbral de TAC por extras.
- Un intervalo `<1h` o `>3h` también genera TAC.
- El horario válido es el impreso en el comprobante; el usuario confirma/corrige el OCR antes de guardar.

Alertas:
- destinatarios: `SUPERVISOR`, `GERENTE` y `GERENTE_DESENVOLVEDOR`;
- nunca bloquean una batida si falla la notificación;
- batida y cron comparten deduplicación por persona/día/etapa;
- cron cada minuto y cobertura de fiscales/operadores;
- deduplicación PERSISTENTE (tabla `AlertaTacEnviado`, migración `9zq_alerta_tac_enviado`): reserva atómica por índice único `(pessoaId, dia, etapa)` antes de notificar, así sobrevive a reinicios y coordina múltiples instancias; el fallo libera la reserva y puede reintentarse; el TAC es diario (la unicidad incluye el día).

### 5.2 Central de Jornada

Fuente principal: `backend/src/central-jornada/central-jornada.service.ts`.

- Ciclo mensual: día **26** hasta día **25**.
- Funciones consideradas: operador, supervisor y fiscal.
- Contrato soportado: `SEIS_X_UM_DOIS_X_UM` (6x1–2x1).
- Métricas: carga trabajada y base diaria, extras 50%, extras 100%, horas devidas, atestado, faltas, TAC y saldo.
- La carga se deriva de las batidas y reglas diarias; la Central no calcula hoy una “carga prevista” desde la escala.
- Saldo = extras 50% + extras 100% − horas devidas.
- Una falta puede marcarse como débito de horas.
- El backend admite comparativo de hasta 12 ciclos; el app solicita/muestra actualmente seis.
- Las tres funciones se consolidan juntas; no existe filtro interactivo por función.
- Lista **todos** los colaboradores no-gerentes del ciclo, aunque no tengan movimiento (card en cero), en **orden alfabético** por nombre. (La "Jornada de Equipe" sí sigue mostrando solo a quien fichó en el día.)

### 5.3 Feriados

Fuente: `backend/src/feriados/feriados.domain.ts`.

- Feriados nacionales se generan automáticamente.
- Feriados estatales y municipales se registran manualmente.
- Carnaval y Corpus Christi no se agregan automáticamente.
- Para jornada, feriado usa carga base de domingo (7h20) y extras 100%.

### 5.4 Contrato de jornada y contrato de experiencia

Son conceptos distintos:
- `tipoContrato = SEIS_X_UM_DOIS_X_UM` gobierna las reglas de jornada del colaborador.
- El contrato de experiencia se deriva de `dataAdmissao` y se procesa para **operadores activos**.
- Experiencia máxima: 90 días; efectivación automática a partir del día 91.
- El cron alerta durante los 5 días anteriores al marco de 90 días.
- Los destinatarios actuales del cron de experiencia son `FISCAL`, `SUPERVISOR`, `GERENTE` y `GERENTE_DESENVOLVEDOR` a través del selector `gestores()`; no describirlo como exclusivo de gerentes mientras el código mantenga ese alcance.
- Decisiones manuales antiguas se conservan por compatibilidad histórica/API, pero no son la fuente principal del estado actual.

### 5.5 Notificaciones

- Todos los avisos pasan por el canal persistido/in-app y WebSocket según el flujo.
- `NotificacoesService` envía push real mediante `https://exp.host/--/api/v2/push/send` a tokens guardados.
- El envío es best-effort: un fallo externo no debe romper la operación principal.
- Para recibir con el APK Android cerrado falta vincular FCM al proyecto Expo/EAS y recompilar/publicar el APK.

## 6. Entregas recientes auditadas

| PR | Resultado mergeado |
| --- | --- |
| #211 | Seguridad: autenticación en WebSocket de fiscales, bloqueo de escalada en colaboradores y eliminación de contraseña débil del seed. |
| #212 | Validación de uploads/entradas y refuerzo de privacidad en el app. |
| #213 | Registro atómico de ausencias a plazo. |
| #214 | Dependabot incorporado para monitoreo de dependencias. |
| #223 | Rendimiento/UX: memoización del contexto de notificaciones y renombre `StatusBadge` → `Selo`. |
| #224 | Backend de Central de Jornada, ciclo 26→25, feriados y contrato 6x1–2x1. |
| #225 | App de Central de Jornada, Relógio Ponto, feriados y contrato. |
| #226 | Dependabot con menos ruido para paquetes controlados por Expo/NestJS. |
| #232 | Bloqueo de upgrades major y paquetes incompatibles/trabados. |
| #234 | Aviso TAC en tiempo real a supervisión/gerencia y jornada consciente de feriados. |
| #235 | Alertas preventivos de riesgo TAC a 1h30 y 1h40, con deduplicación compartida. |

El historial anterior continúa en `REGISTRO_DE_MUDANCAS.md`; esta tabla no reemplaza las entradas detalladas.

## 7. Persistencia y migraciones

- Schema: `backend/prisma/schema.prisma`.
- Migraciones: `backend/prisma/migrations/`.
- Última migración real: **`9zq_alerta_tac_enviado`**.
- La próxima migración debe ordenar después de `9zp` y ser aditiva siempre que sea posible.
- Nunca ejecutar un reset destructivo en producción como parte de una entrega automática.
- Antes de entregar a un cliente se requiere un `reset:cliente` explícito y seed mínimo, separado del seed demo.

## 8. Infraestructura y operación

Variables críticas:
- `DATABASE_URL`, `JWT_SECRET`: obligatorias en producción.
- `CORS_ORIGINS`: allowlist web.
- `GEMINI_API_KEY`, `GEMINI_MODEL`: Cluby.
- `SENHA_INICIAL`: seed.
- `RETENCAO_INATIVOS_MESES`: retención de ex colaboradores.
- `EXPO_PUBLIC_API_URL`: URL de API para mobile/web.

Caveats:
- El banco gratuito/no persistente de Render representa riesgo operativo; migrar a un plan estable/pago.
- Ejecutar `prisma migrate deploy` en **Pre-Deploy**, no en el Start Command, para que un advisory lock no impida abrir el puerto.
- Verificar deploy mediante panel/logs y `/health/ready`; un merge exitoso no lo confirma.
- La cuota gratuita de Gemini no es adecuada para concurrencia multiusuario sostenida.

## 9. Estado del producto y próximos pasos priorizados

### Bloqueantes de operación/entrega
1. Configurar FCM en Expo/EAS y generar/publicar un nuevo APK.
2. Probar OCR/ML Kit con comprobantes reales en dispositivo Android; ajustar parser con muestras reales.
3. Migrar PostgreSQL de Render a un plan persistente/estable.
4. Mover migrations a Pre-Deploy y validar el procedimiento completo de deploy.
5. Habilitar un tier pago de Gemini antes del uso intensivo multiusuario.

### Producto
6. Decidir si terminar o retirar las áreas ocultas: Alertas de Fila, Normativas e Indicador de Quebra.
7. Para Normativas: construir ingestión/RAG con pgvector y object storage; no reactivar el piloto hardcoded como solución de escala.
8. Preparar `reset:cliente` + seed limpio y retirar datos del piloto antes de la entrega.

### Calidad/deuda técnica
9. **Resuelto.** Deduplicación persistente de alertas TAC (tabla `AlertaTacEnviado`, migración `9zq`): reserva atómica por índice único; sobrevive a reinicios y coordina múltiples instancias.
10. **Resuelto.** Los cuatro archivos Prettier históricos fueron formateados en PR aislado (ver §10). Queda como deuda menor decidir si se normalizan los 9 archivos de dominio que Prettier 3.9.5 marca por deriva de versión.
11. Mantener multi-tenancy parqueado hasta que la instancia de una sola tienda esté operativamente estable. Cuando se retome: `lojaId`, aislamiento por fila/RLS y pruebas de fuga entre tenants.

## 10. Verificación y deuda conocida

Últimos resultados confirmados:
- Backend: build OK; 71 suites, 411 tests.
- Mobile: type-check + lint OK; 23 suites, 85 tests.
- Archivos TAC: ESLint focalizado OK.

Los cuatro archivos con diferencias Prettier históricas ya fueron formateados en un
cambio aislado (solo estilo, sin tocar lógica), verificado con build + 71 suites /
406 tests en verde:
- `backend/src/alertas/alertas.service.spec.ts`
- `backend/src/fiscais/fiscais.service.ts`
- `backend/src/insumos/insumos.service.ts`
- `backend/test/helpers/fake-prisma.ts`

Deuda residual: con Prettier 3.9.5 el `--check` global marca 9 archivos de dominio
adicionales (`acessos`, `checklist`, `common/justificativas`, `contratos`,
`fechamento`, `feedforward`, `incidencias`, `ponto-ocr.parser`, `ponto`). Son
diferencias por deriva de versión de la herramienta; el CI las normaliza al vuelo
con `eslint --fix`, así que no rompen la validación. No mezclar esa limpieza con
cambios funcionales.

## 11. Fuentes documentales y responsabilidad

- `README.md`: resumen público, setup y operación básica.
- `PROJECT_UNDERSTANDING.md`: este snapshot canónico.
- `REGISTRO_DE_MUDANCAS.md`: bitácora cronológica.
- `GUIA_QA.md`: validación manual.
- `.kiro/steering/estado-e-pendientes.md`: handoff de estado/prioridades.
- `.kiro/steering/arquitetura.md`: mapa técnico.
- `docs/ESTADO_Y_PROXIMOS_PASOS.md`: índice de compatibilidad; no debe duplicar el snapshot.

## 12. Convenciones de continuidad

- Responder al usuario en español; UI, dominio, commits y PRs en portugués.
- TypeScript strict; no introducir `any` sin justificación.
- Backend: controller → service → domain/Prisma; reglas puras testeables.
- Mobile: API separada de UI; permisos reflejados; diálogos multiplataforma.
- Una rama/PR por lote lógico; nunca afirmar deploy sin evidencia.
- Antes de cambiar reglas de jornada, TAC, contratos o feriados, releer los dominios fuente y actualizar este documento, el registro y el QA.
