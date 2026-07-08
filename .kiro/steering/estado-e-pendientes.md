# Check-out PRO — Estado actual y pendientes (handoff)

> Documento de continuidad. Léelo junto con `.kiro/steering/arquitetura.md` (mapa
> técnico del proyecto). Idioma de trabajo: español; UI/dominio en portugués.
> Monorepo `backend/` (NestJS + Prisma + PostgreSQL) y `mobile/` (Expo/RN + web).

## Infraestructura (Render)

- **API:** `https://checkout-pro-api.onrender.com` (web service, rootDir `backend`).
- **Web:** `https://checkout-pro-web.onrender.com` (static site, rootDir `mobile`).
- **Base de datos:** Postgres free de Render, nombre interno `stok-center-db`
  (NO renombrar = se perderían datos). ⚠️ **El plan free expira ~30 días** →
  migrar a plan pago antes de esa fecha para no perder datos.
- **Secretos en Render (no en el repo):** `JWT_SECRET` (auto-generado, seguro),
  `GEMINI_API_KEY`, `DATABASE_URL`, `GEMINI_MODEL=gemini-2.5-flash`,
  `JWT_EXPIRES_IN=30d`, `HORARIO_FIM_DO_DIA=22:50`, `SENHA_INICIAL`.
- **Servicios creados a mano** (el Blueprint fue desconectado). `render.yaml`
  quedó como documentación; no maneja los servicios.
- Push directo a `main` → Render redespliega solo. Archivos de CI
  (`.github/workflows/`) NO se pueden pushear directo a main: van por PR.

## Convenciones de trabajo

- **Verificación SIEMPRE antes de push:**
  - Backend: `npx prisma generate` + `DATABASE_URL=postgresql://u:p@localhost:5432/db npx prisma validate` + `npm run build` + `npm run lint` + `npx jest`.
  - Mobile: `npm run type-check` + `npm run lint` + `npx jest` + `EXPO_PUBLIC_API_URL=https://checkout-pro-api.onrender.com npx expo export --platform web --output-dir dist`.
- Commits descriptivos en portugués. Migraciones Prisma: nombrar para que ordenen
  DESPUÉS de la última (ya van por `9a`..`9s`; la próxima debe ordenar después de `9s`).
- Diálogos: usar `confirmar`/`notificar` de `mobile/src/utils/dialogos.ts` (la web
  no soporta `Alert`).
- TypeScript en `strict` total (backend y mobile). 0 `any`.

## Estado actual (hecho)

- **Rebranding total a "Check-out PRO"** (código, app, paquetes `@checkout-pro/*`,
  URLs, servicios). No queda "Stok Center"/"Zaffari" visible (solo el nombre
  interno de la BD).
- **Área de Fiscais — control de jornada en tiempo real:** 3 estados
  (DISPONIVEL/INTERVALO/FORA_EXPEDIENTE), fiscal auto-identificado por login,
  panel en vivo (WebSocket), notificaciones a gestores en cada transición,
  cálculo de jornada (trabajando/intervalo/carga), log para gestores
  (`FISCAIS_JORNADA`), falta del día. Backend: `RegistroPontoFiscal` reemplazó a
  `SessaoFiscal` (migración `9g`).
- **Cluby (asistente IA):** chat flotante (Gemini `gemini-2.5-flash`), conversación
  24h, efecto de escritura, markdown. Enfocada en gestión inteligente de
  supermercados **Brasil + Rio Grande do Sul** (fiscal NF-e/NFC-e/SAT, ICMS-ST,
  SEFAZ-RS, KPIs).
- **Notificaciones in-app en tiempo real** vía WebSocket (toast + badge).
- **Sesión de 30 días** + `JWT_SECRET` seguro.

### Actualización — limpieza, permisos y áreas (ver `REGISTRO_DE_MUDANCAS.md`)

- **Permisos unificados:** catálogo único `TODAS_FUNCIONALIDADES` (+ tipo
  `Funcionalidade`) en backend (`acessos.domain.ts`, fuente de verdad) y su
  espejo en mobile (`auth/funcionalidades.ts`). `GERENTE_DESENVOLVEDOR` ve
  **absolutamente todo** (regla explícita; cubre funcionalidades futuras). Test
  guarda: `acessos.permissoes.spec.ts`.
- **Código muerto eliminado:** servicios mobile `importacoes`/`indicadores` y
  tipos órfãos; superficie HTTP backend de `IndicadoresModule`/`ImportacoesModule`
  (controllers/services/modules/dtos/specs). Se MANTUVIERON, por estar en uso por
  código vivo: `importacoes.parser` (`parseValor` lo usan arrecadacao/vendas),
  `importacoes.domain` (tipo `LinhaImportada`) y los `*.errors.ts` (usados por el
  filtro global). No se tocó la BD (sin migraciones destructivas).
- **Bug corregido:** el alerta de "importaciones pendientes" leía la tabla del
  flujo viejo (ya sin datos); ahora `AlertasService` usa `ArrecadacaoService.status`.
- **Áreas "em breve" ocultas:** Alertas de Fila, Normativas e Indicador de Quebra
  marcadas con `emBreve: true` en `areas.ts` y filtradas en la Home hasta
  terminarlas.
- ⚠️ Pendiente de verificación: no se pudo correr `build`/`lint`/`jest` en el
  entorno de edición (sin dependencias / red restringida). Correr la verificación
  completa antes del deploy.

### Actualización — Cadastro Unificado, Centro de Controle y escalas (sesión 2026-06-26)

- **Cadastro Unificado de Colaboradores** es ahora la fuente única de personas:
  cadastro/edición con unicidad de matrícula/login; el **login del app se crea en
  el propio cadastro** del colaborador (fiscal/supervisor/gestor); **operadores
  sin acceso al app**; senha mínima subida a **6**. Pantallas: `ColaboradoresScreen`
  (lista, con conteo separado de **Fiscais**), `GestaoColaboradoresScreen`
  (cadastro + aba de acceso) y `PerfilColaboradorScreen` (perfil inteligente).
- **Vínculo único fiscal:** la escala, el login de acceso y la sección de fiscais
  (online/jornada) quedan enlazados al mismo colaborador (`usuarioId`/`colaboradorId`;
  helper `colaborador-vinculo.ts`; backfill `9s_colaboradores_de_fiscais`).
- **Escala unificada (Opción A):** el Colaborador es la fuente; al guardar un
  fiscal se regenera su `EscalaEntry` semanal (PR #79). La escala de **operadores**
  también lee de `Colaborador`; el model `OperadorTurno` quedó `[DEPRECADO]` y se
  retiró su camino de escritura (PR #80). **Sin migraciones destructivas.**
- **Centro de Controle reorganizado:** ya **no existen** "Pessoas e Acessos" ni
  "Gerenciar dados". Cards: **Acesso**, **Metas** (metas mensuales por indicador +
  card **Sacolas APAE** con precio y meta), **Insumos** (zerar estoque / limpar
  requisições) e **Importações** (sale de la Home salvo perfil IMPORTADOR).
- **Metas mensuales:** modelo `MetaMensal`, módulo `backend/src/metas/`
  (migración `9r_metas_mensais`). La meta de ventas ya no se define en el Painel
  de Vendas, sino en Centro de Controle ▸ Metas.
- **Salud del negocio:** corregido el cálculo que caía a 0 (topes por categoría);
  los archivos pendientes solo penalizan a partir de las 18h.
- **Verificación de esta sesión:** backend `build` + **152 tests**; mobile
  `type-check` + **32 tests**. Todo verde.

### Actualización — fila de no reconocidos, Fechamento inteligente y limpieza (sesión 2026-06-27)

PRs mergeados esta sesión: **#83, #84, #85, #86, #87** (todos en `main`).

- **Fila de "Não reconhecidos"** (PRs #83 backend + #84 mobile): los lançamentos
  de arrecadación cuyo código (matrícula/login del .txt) no casa con ningún
  colaborador **YA suman en el total del indicador** (gente de fuera también
  cuenta — el `somar` nunca filtró por cadastro; quien filtra es solo el ranking
  por persona). Se expuso:
  - `ArrecadacaoService.naoReconhecidos(tipo, ini, fim)` → `{ total, lancamentos }`
    (línea "Não reconhecidos" en el detalle del indicador, Opción B).
  - `ArrecadacaoService.listarNaoReconhecidos(ini, fim)` → bandeja agrupada por
    código. Endpoints `GET /arrecadacao/nao-reconhecidos/resumo` y
    `/nao-reconhecidos` (lista, gestor).
  - `ColaboradoresService.adicionarIdentificador(colaboradorId, valor)` + endpoint
    `POST /colaboradores/:id/identificadores`: **asociar** un código a una persona
    crea un identificador `MATRICULA` (resuelve en TODOS los indicadores y
    **arregla el histórico retroactivamente**, porque la resolución es en lectura).
  - Mobile: pantalla `NaoReconhecidosScreen` (ruta `NaoReconhecidos`, gestor) con
    **Asociar** (selector inline) y **Criar** (abre `GestaoColaboradores` con
    `matriculaInicial`/`nomeInicial` prellenados). Línea en `IndicadorDetalheScreen`.
  - Decisión de diseño: total = TODO; ranking/atribución = solo cadastrados;
    lançamentos sin código no entran en la bandeja pero siguen sumando al total.
- **Deprecación `OperadorTurno`** (PR #80, sesión previa) y **`Operador` simple**
  (PR #82): retirados los caminos de escritura/CRUD viejos; modelos marcados
  `[DEPRECADO]` en el schema (sin migración). `escala.service` resuelve nombres
  con `Colaborador` (ya no con `Operador`). `NomeDuplicadoError` se mantuvo (lo
  usa el filtro global); `nomeDuplicado` (domínio) se mantuvo (property test).
- **Fechamento inteligente — Fase 1** (PR #85): nuevo `fechamento.domain.ts`
  (puro, testeado) `montarResumoFechamento` + `FechamentoService.resumo(data)` +
  `FechamentoController` (`GET /fechamento/resumo`). La pantalla pasó de "X de N
  archivos" a un **resumen del día**: titular ("Tudo pronto"/"X de N"), **alertas
  de consistencia** (todas "sem movimento"; vendas sin arrecadación; dia encerrado
  con pendencias) y el estado de cada item (5 arrecadaciones + vendas + 2
  checklists). `estaCompleto`/notificaciones NO cambiaron.
- **Branding** (PR #86): se constató que **ya estaba aplicado** (login usa
  `assets/Logo.png`, header de Home usa `assets/LogoElemento.png`, `app.json` azul
  `#0F4C81` + `Appicon.png`). Solo se removió **código muerto con el rojo viejo**:
  `components/Logo.tsx` (LogoPulseC) y `theme/icones.ts` (`#E30613`/`SVG_*`).
- **Tests de frontend** (PR #87): `NaoReconhecidosScreen.test.tsx` (lista/vacío/
  asociar) y `GestaoColaboradoresScreen.test.tsx` (prellenado).
- **Verificación final de la sesión:** backend `build` + **156 tests**; mobile
  `type-check` + **37 tests**; lint OK. Sin migraciones nuevas (siguen hasta `9s`).

### Actualización — auditoría, limpieza de legacy y ventana de retención (sesión 2026-07-08)

- **Auditoría técnica completa** (backend + mobile): proyecto sano. Build OK,
  0 `any`/`@ts-ignore`/`TODO`, sin catch vacíos. Solo diferencias de prettier
  (las auto-corrige el CI). Verificación: backend **59 suites / 300 tests**;
  mobile **20 suites / 68 tests** (el `type-check` marca errores solo en
  archivos `.test` por instalación aislada de dependencias —los `@types/jest` se
  resuelven vía hoisting del workspace en `npm install` desde la raíz—; NO es un
  fallo del código de producción, que type-checkea limpio).
- **Limpieza de código muerto (legacy):** se eliminaron por completo las carpetas
  `backend/src/importacoes/` e `backend/src/indicadores/`. Lo único vivo era
  `parseValor` (lo usan los parsers de `arrecadacao` y `vendas`): se movió a
  `backend/src/common/numeros.ts` y se actualizaron los 2 imports. Los tipos de
  error `ColunaAusenteError`/`ValorVendaInvalidoError` solo se usaban como
  fixtures en `dominio-exception.filter.spec.ts` (el filtro es genérico vía la
  base `ErroDominio`, NO los referencia); se quitaron esos 2 casos del spec (el
  mapeo 400 sigue cubierto por otros errores). Sin cambios de comportamiento.
  Nota: `operador-turno.*` (`/quadro-operadores/*`) NO es legacy —lo usa el mobile
  (`listarTurnos`, grade/dia/ao-vivo/faltas)— y se conservó.
- **Ventana de retención en la purga mensual de inactivos** (protección legal):
  antes, al marcar un colaborador `ativo=false`, el 1º del mes siguiente se
  borraba PARA SIEMPRE su ficha y todo el histórico de RRHH (advertencias,
  incidencias/sanciones, decisiones de contrato, ponto, escala). Ahora:
  - Nuevo campo `Colaborador.desligadoEm` (migración `9zf_colaborador_desligado_em`,
    aditiva; backfill de inactivos existentes a `now()`).
  - `colaboradores.service` marca `desligadoEm` al pasar a inactivo y la limpia al
    reactivar (en `editar` y `definirAtivo`).
  - La purga solo borra a quien fue dado de baja hace más de
    **`RETENCAO_INATIVOS_MESES`** meses (env, **def. 12**, mín. 1). Fichas
    inactivas sin `desligadoEm` (legado) NO se purgan por seguridad. Se sigue
    preservando `registros_arrecadacao` y el lote APAE (totales intactos).
  - **Decisión pendiente del usuario:** confirmar el nº de meses (12 por defecto).
    Si el requisito legal del cliente es mayor (ej. 24 meses), setear
    `RETENCAO_INATIVOS_MESES` en Render.
- **Documentación actualizada** (`PROJECT_UNDERSTANDING.md` + este steering +
  `arquitetura.md`): se documentaron los módulos de RRHH que faltaban
  (`incidencias`, `advertencias`, `contratos`, `data-inicial`, `reset-operacional`)
  y los push tokens en `notificacoes`.
- **Migraciones:** la última pasa a ser `9zf_colaborador_desligado_em`; nombrar la
  próxima para ordenar DESPUÉS de ella.

### Incidente de deploy resuelto (2026-06-27)

- Síntoma: build OK pero deploy "Failed/Timed Out" con **"Port scan timeout, no
  open ports"** y **cero logs de la app** durante ~15 min.
- Causa: el **start command** corre `npx prisma migrate deploy && npx prisma db
  seed && node dist/main.js`. Al mergear varios PRs seguidos, los deploys se
  encimaron y `migrate deploy` quedó **colgado esperando un advisory lock** →
  el servidor nunca arrancó. (La BD estaba "Available", PG 18 — NO era base caída.)
- Solución que funcionó: **Manual Deploy → "Clear build cache & deploy"**, uno
  solo. Arrancó normal (`Conexão com o banco… / ouvindo na porta 10000 / live`).
- **Arreglo de fondo recomendado (en el panel de Render, no en el repo, porque los
  servicios se manejan a mano):** mover migraciones al **Pre-Deploy Command**
  (`npx prisma migrate deploy && npx prisma db seed`) y dejar **Start Command** =
  `node dist/main.js`. Así un cuelgue de migrate no bloquea el puerto en silencio.

### Decisiones de producto/negocio de la sesión

- **Foco actual del usuario:** dejar la app **100% operativa ANTES de escalar**.
  Multi-tenancy queda **parqueado** (plan ya discutido, ver abajo).
- **Multi-tenancy (cuando se retome):** modelo recomendado = **1 BD + columna
  `lojaId`** (row-level) + RLS de Postgres como red de seguridad. Toca ~28 modelos
  y las ~15 unicidades (pasan a compuestas con `lojaId`). El token JWT llevaría
  `lojaId`. Decisión pendiente: cómo identifica el usuario su tienda en el login
  (A: código de tienda; B: email global; C: subdominio web) — se sugirió **A**.
  Plan por fases en el chat; es el cambio más grande (riesgo: fuga entre tenants →
  exige tests de aislamiento).
- **Reset para entrega a cliente (pre-entrega, NO ahora):** crear `seed-cliente`
  mínimo (1 gerente + configs por defecto) + script `reset:cliente` (borra datos
  operativos) + sacar el seed demo del arranque (hoy el seed recrea ~39 operadores
  Zaffari en cada deploy → la limpieza no "pega" si no se cambia el seed). Quitar
  también las normativas del piloto Zaffari del código.
- **Pricing (orientativo):** para un mercado que factura ~R$18M/mes, sugerido
  **R$1.500–2.500/mes + setup R$3–5k** como primer cliente (early adopter), con
  plan de subir a **R$3–6k/mes** con caso de éxito + soporte/infra de pago. Ancla
  de venta = prevención de pérdidas (1–3% del faturamento).

## Pendientes / próximos pasos (estado a 2026-06-27)

> Meta del usuario: **app 100% operativa antes de escalar.** No hay PRs abiertos.

### 🖐️ Infraestructura / decisiones del usuario (bloqueantes reales para uso diario)
1. **Gemini tier pago (URGENTE multiusuario):** la capa gratis (~20 req/min) es
   insuficiente para ~15 fiscais (`RESOURCE_EXHAUSTED`). Activar facturación en
   Google AI Studio. El tier pago además **no entrena con los datos** (requisito
   para normativas).
2. **BD de Render a plan estable** antes de que expire la free.
3. **Endurecer el deploy:** Pre-Deploy Command (ver "Incidente de deploy" arriba).
4. **Borrar el `checkout-pro-web` duplicado** en Render (hay 2 servicios web).
5. **`JWT_SECRET` ahora es OBLIGATORIO en producción:** la API **no arranca** sin
   él (falla rápida en el boot — ya no hay default inseguro ni "solo warning").
   Ya no es un "confirmar": debe estar seteado en Render (`DATABASE_URL` cae en la
   misma regla). Asegurar ambos configurados antes de cualquier deploy.

### 🧩 Producto incompleto pero OCULTO (no rompe nada)
6. Áreas "em breve" (`emBreve: true` en `areas.ts`, ocultas): **Alertas de Fila,
   Normativas, Indicador de Quebra** (pantallas placeholder de ~15 líneas).
   Decisión: terminarlas o quitarlas (limpieza ofrecida).
7. **Normativas de Cluby** desactivadas por `PROCEDIMENTOS_ATIVOS=false`
   (`assistente/procedimentos.service.ts`). Reactivar a escala requiere RAG
   (pgvector + object storage) + tier pago. Datos del piloto en
   `procedimentos.data.ts` + fotos en `backend/assets/procedimentos/`.

### 🔧 Que el agente puede hacer en código (ofrecido, pendiente de luz verde)
8. **Guía de QA paso a paso** (documento `GUIA_QA.md`): checklist manual por
   perfil/módulo para validar todo en producción. **El usuario preguntó cómo
   funciona; quedó pendiente decidir formato (A: archivo en repo / B: en chat) y
   organización (por perfil / por módulo) antes de generarla.**
9. **Limpiar las 3 áreas "em breve"** (quitar placeholders + rutas).
10. **Push notifications reales (v1.1):** `expo-notifications` + `pushToken` en
    `Usuario` + `expo-server-sdk`. Hoy solo in-app. Solo funciona en APK.
11. **EscalaScreen con nombres** (la escala del quadro ya muestra nombres vía
    `Colaborador`; revisar si la EscalaScreen dedicada aún muestra algún ID) — menor.

### 🚀 Escalado (parqueado por decisión del usuario)
12. **Multi-tenancy** (ver "Decisiones de producto/negocio" arriba). El cambio
    grande para ser SaaS multi-cliente.
13. **Cobros / registro self-service** (Stripe, planes) — capa aparte del #12.
14. **Script `reset:cliente` + seed limpio** (pre-entrega a cliente — ver arriba).

### 📄 Negocio
15. **Propuesta comercial de una página** con cuenta de ROI (ofrecida, pendiente).

## Cómo continuar en otra cuenta/sesión de Kiro

El proyecto vive en **GitHub** (`pedroxynox/checkout-pro`), no en Kiro. El
contexto viaja en `.kiro/steering/` (este archivo + `arquitetura.md` +
`PROJECT_UNDERSTANDING.md`). Lo que NO viaja: el historial de chat. Cuentas
externas (Render/Gemini/GitHub) son del usuario.

### Notas operativas para el agente (gotchas confirmados esta sesión)
- **Git directo NO funciona** (`git push`/`fetch` dan auth error). Usar el **power
  de GitHub** (`kiro_powers` → `github` → `push_to_remote`, `create_pull_request`,
  `pull_repository`, `list_pull_requests`). Para sincronizar `main` local:
  `pull_repository` + `git merge --ff-only origin/main` (operación local).
- **`npm run lint` del backend corre con `--fix`** y reformatea archivos ajenos.
  NO usarlo para validar; usar `npx eslint <archivos>` (sin fix). Errores de
  prettier preexistentes en líneas no tocadas → el CI los auto-corrige (CI usa
  `lint` con `--fix` y sale 0). Solo formatear los archivos NUEVOS propios con
  `npx prettier --write`.
- **Flujo de entrega:** rama nueva desde `main` actualizado → editar → validar
  (build/type-check + jest, sin lint --fix) → commit → `push_to_remote` →
  `create_pull_request` contra `main`. El usuario mergea. Si una rama remota ya
  existe (rechazo "fetch first"), usar un nombre de rama nuevo.
- **Trabajar por partes: 1 PR por parte.** Responder en **español**; código,
  commits y PRs en **portugués**. Tono claro para no-programador.
- Tras mergear varios PRs, avisar de hacer **Manual Deploy → Clear build cache**
  uno a la vez para evitar el cuelgue de migrate (advisory lock).
