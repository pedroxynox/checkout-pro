# PROJECT_UNDERSTANDING — Check-out PRO

> Documento base de comprensión del proyecto, generado a partir del análisis
> completo del repositorio. Sirve como contexto de continuidad para cualquier
> trabajo futuro. Complementa (no reemplaza) a `.kiro/steering/arquitetura.md`
> y `.kiro/steering/estado-e-pendientes.md`.
>
> Idioma de trabajo: español · UI/dominio: portugués (Brasil).
>
> Última revisión: 2026-06-27 (fila de "Não reconhecidos" —total cuenta a todos,
> bandeja para asociar/crear—; Fechamento inteligente Fase 1 —resumen del día con
> pendencias y alertas—; deprecados los modelos viejos `Operador`/`OperadorTurno`;
> branding ya integrado y limpieza del rojo viejo muerto. Meta del usuario: dejar
> la app 100% operativa antes de escalar; multi-tenancy parqueado).

---

## 1. Resumen ejecutivo

**Check-out PRO** es una aplicación de **gestión inteligente de la frente de caja
de un supermercado** (rebranding del antiguo "Stok Center"). Centraliza la
operación de caja para **gerentes, supervisores, fiscales, importadores y
operadores**.

Funcionalidades principales:
- Importación diaria de archivos operativos (`.txt`).
- Indicadores/metas (KPIs) con semáforo (verde/amarillo/rojo) y rankings.
- Control de insumos (bolsas, bobinas, paños) con fardos por código de barras,
  requisiciones y pedidos recurrentes.
- Monitoreo de fiscales en tiempo real (WebSocket) con jornada y escala.
- Checklists de apertura/cierre con imagen y anti-fraude.
- Sacolas APAE por lote, panel de ventas por hora.
- Asistente de IA **"Cluby"** (Google Gemini) que orienta al equipo.

Producto 100% en **portugués de Brasil**, disponible como **app Android (APK vía
Expo)** y como **web estática**. Estado: **funcional/en producción**; spec
completo (tareas 1–22 marcadas como hechas) con evolución posterior reflejada en
migraciones `9h`–`9s`.

---

## 2. Arquitectura

Monorepo **npm workspaces** con dos paquetes independientes:

```
mobile/ (Expo / React Native)  --HTTPS + JWT Bearer-->  backend/ (NestJS)
  - App Android (APK)                                    - REST + WebSocket + Cron
  - App Web (estática)                                   - Prisma -> PostgreSQL
                                                         - Gemini (asistente IA)
```

- **backend/** — API NestJS modular por dominio. JWT global; autorización por
  funcionalidad con `@Funcionalidade('X')` + `PerfilGuard`. WebSocket (estado de
  fiscales) y cron jobs (alertas/limpieza) en huso `America/Sao_Paulo`.
- **mobile/** — React Native + Expo SDK 52, exportable como web estática.
  Organizado por capas; soporte offline (SQLite + cola de sincronización).

**Patrón por módulo backend:**
`*.controller.ts` (HTTP) → `*.service.ts` (negocio) → Prisma (persistencia);
`*.domain.ts` (lógica pura testeable), `dto/` (validación), `*.errors.ts`
(errores de dominio traducidos a HTTP por `DominioExceptionFilter` global).

### Stack tecnológico

| Capa | Tecnologías |
| --- | --- |
| Backend | Node.js ≥18, NestJS 10, TypeScript strict, Prisma 5, PostgreSQL, JWT, Socket.IO, `@nestjs/schedule` |
| IA | Google Gemini (`gemini-2.5-flash`) vía REST |
| Mobile | React Native 0.76, Expo SDK 52, TypeScript, React Navigation 7 (native-stack) |
| Parsing | papaparse, xlsx (flujos antiguos) + parsers `.txt` propios (flujo actual) |
| Tests | Jest (backend y mobile), fast-check (property-based, ≥100 iter.), Testing Library |
| Calidad | ESLint, Prettier, TypeScript `strict` (ambos paquetes) |
| Infra | Render (API + Web + PostgreSQL), EAS Build (APK) |

### Despliegue (Render)

- **API:** `https://checkout-pro-api.onrender.com` (web service, rootDir `backend`).
- **Web:** `https://checkout-pro-web.onrender.com` (static site, rootDir `mobile`).
- **BD:** PostgreSQL free de Render (`stok-center-db` — NO renombrar). El plan
  free expira ~30 días.
- Push directo a `main` → redeploy automático. CI (`.github/workflows/`) va por PR.
- `render.yaml` quedó como documentación (los servicios se gestionan a mano).

---

## 3. Módulos

### Backend (`backend/src/*`)

| Módulo | Responsabilidad |
| --- | --- |
| `acessos` | Login (matrícula + senha) + JWT; mapa de permisos por perfil (`acessos.domain.ts`). |
| `usuarios` | CRUD de logins/accesos del app. |
| `colaboradores` | **Cadastro Unificado** (fuente única de personas): cadastro/edición con unicidad de matrícula/login, login creado en el cadastro, `resolverColaboradorId` y **perfil inteligente** (`perfil-colaborador.*`). |
| `arrecadacao` | Indicadores desde `.txt` (parser por tipo) + `indicadores-inteligente` / `indicadores-resumo` + **"não reconhecidos"** (total cuenta a todos; bandeja para asociar/crear). **(flujo actual)** |
| `fechamento` | Cierre del día: `estaCompleto`/notificación + **resumo inteligente** (`fechamento.domain` puro + `GET /fechamento/resumo`: pendencias y alertas). |
| `vendas` | Ventas por hora desde `.txt`; espeja el total diario en `VendaDiaria`. |
| `metas` | Metas mensuales por indicador (`MetaMensal`): vendas, cancelamientos, recargas, devoluções y Sacolas APAE. Mostradas en Centro de Controle ▸ Metas. |
| `indicadores` | Flujo **ANTIGUO** (% / color / rankings, registro manual). No usado por la UI; mantenido por compat. |
| `importacoes` | Flujo **ANTIGUO** CSV/XLSX. No usado por la UI; mantenido por compat. |
| `insumos` | Stock como suma de `MovimentoEstoque`; fardos por código de barras; alertas de stock bajo. |
| `requisicoes` | Requisiciones de insumos (aprobación) + pedidos recurrentes / sugerencias. |
| `lote-apae` | Sacolas APAE por lote, histórico, config de precio/meta. |
| `fiscais` | Estado en tiempo real (WebSocket) + jornada (`RegistroPontoFiscal`) + escala (la escala del fiscal viene del cadastro del colaborador — Opción A). |
| `checklist` | Apertura/cierre con imagen, ventanas fijas, hash anti-fraude. |
| `operadores` | Cuadro de turnos y ausencias. La **escala lee de `Colaborador`** (funcao OPERADOR); `OperadorTurno` quedó `[DEPRECADO]` (no se lee ni escribe). |
| `notificacoes` | In-app + WebSocket (toast + badge). Sin push real de dispositivo aún. |
| `assistente` | Chat Cluby (Gemini) + procedimientos guiados (desactivados por flag). |
| `alertas` | Cron jobs: checklist (08:55 / 13:55) e importaciones (fin del día). |
| `common` / `config` / `prisma` / `storage` | Guards, decorators, filtros; validación de env; acceso a BD; almacenamiento. |

### Mobile (`mobile/src/*`)

- `api/` — `client.ts`, `config.ts`, `socket.ts`, `tokenStorage.ts`, `types.ts`,
  y `services/` (uno por dominio).
- `auth/` — contexto de autenticación, `podeAcessar(perfil, funcionalidade)`,
  `funcionalidades.ts` (espejo del catálogo del backend) y `biometria.ts`.
- `navigation/` — `RootNavigator`, `AppNavigator` (pila de pantallas de módulo),
  **`MainTabs.tsx`** (barra inferior del app autenticado: **Início, Tarefas
  [badge de pendencias], botón central Cluby [sparkles] → Mensagens,
  Notificações [badge], Perfil**), `areas.ts` (allowlist por funcionalidad
  reflejando el backend; áreas `emBreve: true` ocultas del menú), `types.ts`.
- `screens/` — pantallas por área (colaboradores [Colaboradores/Gestão/Perfil],
  centroControle [Centro de Controle: Acesso/Insumos], metas, fechamento, fiscais
  [Fiscais/Escala/JornadaFiscais], importacoes, indicadores [Indicadores/
  IndicadorDetalhe/PainelVendas], insumos [Insumos/InsumoDetalhe/Requisicoes],
  loteApae, normativas, notificacoes, operadores, quebra, usuarios, checklist,
  alertasFila) + **centroDeMando** (`ResumoDoDia` + hook `usePulsoDoDia`),
  **tarefas** (`TarefasScreen`), **mensagens** (chat Cluby), **perfil**
  (`PerfilScreen`), Home y Login (rediseñado: fondo onda azul/blanco).
- `components/` (incl. `Graficos.tsx`: pizza/rosca interactiva + barras,
  `Logo.tsx` con `LogoPulseC`, `LeitorCodigoBarras`, `MarkdownTexto`,
  `ProcedimentoView`), `assistente/` (`AssistenteContext`), `notificacoes/`
  (`NotificacoesContext`), `hooks/`, `offline/` (SQLite + cola), `theme/`
  (tema azul + `Inter` + iconos Lucide), `utils/` (`dialogos.ts`).
- `assets/` — branding subido por el usuario: `Logo.png` (login),
  `LogoElemento.png` (header), `Appicon.png` (ícono APK), `Favicon.ico` (web).
  Integración **en curso** en la rama `feat/branding-imagens` (ver §5).

### Perfiles y autorización

Perfiles: `GERENTE_DESENVOLVEDOR` (acceso total), `GERENTE`, `SUPERVISOR`,
`FISCAL`, `IMPORTADOR` (solo *Importações*). La autorización es una **allowlist
por funcionalidad** definida en `backend/src/acessos/acessos.domain.ts` y
reflejada en el mobile (`areas.ts` / `funcionalidades.ts`).

---

## 4. Dependencias

### Backend (principales)
`@nestjs/common|core|config|jwt|schedule|websockets|platform-express|platform-socket.io`,
`@prisma/client` + `prisma` (v5), `bcrypt`, `class-validator` + `class-transformer`,
`papaparse`, `xlsx`, `socket.io`, `rxjs`, `reflect-metadata`.
Dev: `fast-check`, `jest` + `ts-jest`, `@nestjs/testing`, ESLint/Prettier, `ts-node`.

### Mobile (principales)
`expo` (~52), `react` 18.3 / `react-native` 0.76.9 / `react-native-web`,
`@react-navigation/native` + `native-stack`, `expo-camera`, `expo-image-picker`,
`expo-document-picker`, `expo-secure-store`, `expo-sqlite`, `react-native-svg`,
`socket.io-client`, `@react-native-async-storage/async-storage`.
Dev: `jest-expo`, `@testing-library/react-native`, ESLint, TypeScript.

### Servicios externos
Render (hosting API/Web/BD), Google Gemini (asistente), EAS Build (APK).
Secretos en Render (no en el repo): `DATABASE_URL`, `JWT_SECRET`,
`GEMINI_API_KEY`, `GEMINI_MODEL`, `JWT_EXPIRES_IN`, `HORARIO_FIM_DO_DIA`,
`CORS_ORIGINS`, `SENHA_INICIAL`. Mobile: `EXPO_PUBLIC_API_URL`.

---

## 5. Estado actual

### Hecho
- Rebranding total a "Check-out PRO" (código, paquetes `@checkout-pro/*`, URLs).
- 7 módulos del spec implementados (importaciones, indicadores/metas, insumos,
  fiscales/escala, checklist, operadores/ausencias, accesos/perfiles).
- Capa de dominio pura con property-based tests; API REST por módulo; WebSocket
  gateway; cron jobs; app móvil con navegación por perfil; cache offline.
- Jornada de fiscales en tiempo real (3 estados, log, cálculo de jornada).
- Asistente Cluby (Gemini) con chat flotante, conversación 24h, markdown.
- Notificaciones in-app en tiempo real; sesión de 30 días; `JWT_SECRET` seguro.
- Funcionalidades posteriores al spec (migraciones `9h`–`9s`): pedidos
  recurrentes, stock inicial, metas configurables, APAE inteligente, config de
  ventas, cuadro de operadores, auditoría de checklist, género de operador.
- **Rediseño de UX reciente** (sprint de UI): barra inferior de navegación
  (`MainTabs`: Início / Tarefas / botón central **Cluby** / Notificações /
  Perfil), **Centro de Mando** ("Pulso do Dia" — resumen y pendencias por
  perfil), Home compacta en grilla de "Acessos rápidos", escalas unificadas
  (fiscales + operadores), tipografía **Inter** + iconos **Lucide**, y login
  rediseñado (fondo mitad blanco/mitad azul con onda suave + logo Pulse C).
- **Branding (en curso, rama `feat/branding-imagens`):** el usuario subió 4
  imágenes a `mobile/assets/` (`Logo.png`, `LogoElemento.png`, `Appicon.png`,
  `Favicon.ico`). Pendiente integrarlas: `Logo.png` en el login (reemplaza el
  vector `LogoPulseC`), `LogoElemento.png` en el header del menú (solo el logo,
  sin el texto "Check-out Pro"), `Appicon.png` como ícono del APK y
  `Favicon.ico` como favicon web (en `app.json`), y pasar los colores rojos
  viejos de `app.json` a azul. Aún sin commits en la rama.
- **Cadastro Unificado de Colaboradores (fuente única de personas):** cadastro/
  edición con unicidad de matrícula/login; el **login del app se crea en el
  cadastro** (fiscal/supervisor/gestor); operadores sin acceso; senha mínima 6.
  Pantallas Lista/Gestão/Perfil. **Escalas unificadas:** fiscais y operadores
  leen de `Colaborador`; `OperadorTurno` deprecado (sin migración destructiva).
- **Centro de Controle reorganizado:** desaparecen "Pessoas e Acessos" y
  "Gerenciar dados"; cards **Acesso / Metas / Insumos / Importações**. **Metas
  mensuales** por indicador (`MetaMensal`, módulo `metas/`) + card Sacolas APAE.
  Fix de "Saúde do negócio" (topes por categoría; archivos pendientes pesan tras 18h).

### Verificación
- Backend: **35** suites `.spec.ts` / **156** tests. Mobile: **13** suites / **37** tests.
- Comandos: backend (`prisma generate` + `validate` + `build` + `lint` + `jest`);
  mobile (`type-check` + `lint` + `jest` + `expo export --platform web`).

### Pendientes / deuda técnica
1. **Gemini tier pago (URGENTE multiusuario):** la capa gratuita (~20 req/min) es
   insuficiente para ~15 fiscales (`RESOURCE_EXHAUSTED`).
2. **Migrar la BD de Render a plan pago** antes de que expire (~30 días).
3. **Normativas de Cluby (RAG con fotos):** DESACTIVADAS por
   `PROCEDIMENTOS_ATIVOS = false` en
   `backend/src/assistente/procedimentos.service.ts`. Requiere ingestar ~300
   PDFs (RAG + pgvector + object storage) y tier pago.
4. **APK + push notifications reales (v1.1):** hoy solo in-app; falta
   `expo-notifications` + tokens push + `expo-server-sdk`.
5. **EscalaScreen con nombres:** la escala del Quadro de Operadores ya muestra
   nombres (vía `Colaborador`); revisar si la `EscalaScreen` dedicada de fiscais
   aún muestra algún ID suelto y pulirlo — menor.
6. Áreas marcadas "(em breve)" en la UI: **Alertas de Fila**, **Normativas**,
   **Indicador de Quebra**.

### Riesgos / observaciones técnicas
- Coexistencia de flujos **antiguos** (`indicadores`, `importacoes` CSV/XLSX) sin
  uso por la UI → candidatos a documentar/deprecar.
- Acoplamiento implícito: `vendas` → `VendaDiaria` → % de indicadores.
- `pessoaId` en `Ausencia`/`EscalaEntry` ahora apunta al `Colaborador` (id); se
  añadió `colaboradorId` (nullable) para el vínculo. Convive con datos históricos
  sin FK rígida.
- Notificaciones "push" simuladas (campos `canalPush`/`canalInApp` son marcadores).
- Plan free de Render: API "duerme" (~30–60s primer arranque) y BD expira.
- Migraciones con nomenclatura `9a..9s`: la próxima debe ordenarse **después de
  `9s`**.
- El repositorio fue clonado **shallow (1 commit squashed)** → sin historial
  detallado; el contexto de evolución vive en `.kiro/steering/`.

---

## 6. Convenciones (mantener consistencia)

- **Idioma:** dominio/identificadores/UI en **portugués**; comunicación y handoff
  en **español**; commits descriptivos en portugués.
- **TypeScript `strict`** en ambos paquetes; **0 `any`**; tipos compartidos en
  `types.ts`/DTOs.
- **Backend:** un módulo por dominio; separación controller → service →
  domain/Prisma; errores de dominio tipados + filtro global; lógica pura aislada
  para property-based testing (fast-check, ≥100 iter., anotada con
  `// Feature: gestao-frente-de-caixa, Property N: ...`).
- **Mobile:** UI en `components/`, red en `api/services/`, pantallas en
  `screens/`; diálogos vía `utils/dialogos.ts` (la web no soporta `Alert`).
- **Git:** push directo a `main` autorizado (Render redespliega); CI va por PR.
- **Verificación SIEMPRE antes de push** (ver sección 5).

---

## 7. Próximos pasos recomendados

1. **Antes de implementar cualquier funcionalidad nueva**, leer este documento +
   `.kiro/steering/arquitetura.md` + `.kiro/steering/estado-e-pendientes.md` para
   mantener continuidad.
2. Confirmar con el usuario la prioridad real entre los pendientes (sección 5);
   los puntos 1 y 2 (Gemini pago y BD pago) son de **infraestructura/riesgo** y
   pueden bloquear el uso multiusuario o causar pérdida de datos.
3. Reutilizar los patrones existentes (módulo por dominio, lógica pura + tests
   de propiedad, allowlist por funcionalidad) en cualquier extensión.
4. Para nuevas migraciones Prisma, nombrar de forma que ordenen después de la
   última (`9s`).
5. Ejecutar la batería de verificación completa antes de cualquier push.

---

## 8. Alcance del análisis (exclusiones explícitas)

- **`backend/assets/procedimentos/**.jpg`** — imágenes binarias de normativas
  (datos del piloto). No leídas (binarios); su rol se entiende por el código de
  `assistente/procedimentos`.
- **`.git/`** — metadatos de Git (clon shallow, 1 commit). No analizable en
  profundidad histórica.
- **Pantallas individuales `mobile/src/screens/**.tsx`** y cada archivo de
  dominio/servicio — revisados de forma representativa (ej.: `acessos.domain.ts`,
  `arrecadacao`), no exhaustivamente archivo por archivo; la estructura completa
  sí fue recorrida.
- No se revisó `node_modules` (dependencias instaladas) por irrelevante.

Ningún directorio de código fuente fue omitido sin justificación.
