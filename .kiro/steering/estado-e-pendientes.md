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
  DESPUÉS de la última (ya van por `9a`..`9o`; la próxima debe ordenar después de `9o`).
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

## Pendientes / próximos pasos (en orden sugerido)

1. **Gemini tier pago (URGENTE para multiusuario):** la capa gratis da ~20
   req/min → insuficiente para 15 fiscais (da `RESOURCE_EXHAUSTED`). Activar
   facturación en Google AI Studio (pago por uso, ~$5–20/mes). Además, el tier
   pago **no usa los datos para entrenar** (requisito para las normativas).
2. **Migrar la BD de Render a plan pago** antes de que expire (~30 días).
3. **Normativas de Cluby (RAG con fotos):** están DESACTIVADAS por el flag
   `PROCEDIMENTOS_ATIVOS=false` en `backend/src/assistente/procedimentos.service.ts`
   (los datos del piloto siguen en `procedimentos.data.ts` + fotos en
   `backend/assets/procedimentos/`). Para reactivar a escala: poner el flag en
   `true`, ingerir los ~300 PDFs (RAG con pgvector + object storage tipo
   Cloudinary para las fotos) y usar tier pago (datos confidenciales).
4. **APK + push notifications reales (v1.1):** `expo-notifications` + tokens push
   (campo `pushToken` en `Usuario`) + `expo-server-sdk` en el backend. Solo
   funciona en el APK instalado, no en la web. Hoy las notificaciones son in-app.
5. **EscalaScreen con nombres** (hoy muestra IDs) — diferido.
6. **Opcional:** renombrar el repo de GitHub a `checkout-pro` (GitHub deja
   redirecciones, no rompe). Mergear el PR `chore/keep-alive-checkout-pro` si
   sigue abierto.

## Cómo continuar en otra cuenta de Kiro

El proyecto vive en **GitHub**, no en Kiro. En la cuenta nueva: conectar el mismo
GitHub, abrir el repo `pedroxynox/gestao-frente-de-caixa-stok-center` (o su nuevo
nombre). El contexto viaja en `.kiro/steering/` (este archivo + `arquitetura.md`).
Lo que NO viaja: el historial de chat. Cuentas externas (Render/Gemini/GitHub) son
del usuario, independientes de Kiro.
