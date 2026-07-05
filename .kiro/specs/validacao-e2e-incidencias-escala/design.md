# Documento de Design — Plan de Validación E2E y Corrección de Bugs

> **Idioma:** la explicación está en español; los identificadores del dominio,
> endpoints, enums, nombres de tablas, variables de entorno y textos de UI se
> conservan en portugués BR tal como existen en el código.

## Overview

Este documento **no diseña una funcionalidad nueva**: define el plan técnico
para **validar de punta a punta (E2E)** el módulo "Incidências de Escala"
(PRs #100 backend + #101 mobile) contra un **PostgreSQL real**, detectar bugs,
corregirlos de forma acotada y entregar un **Informe QA**.

El módulo bajo prueba se compone de tres capas ya implementadas:

- **API_Incidencias** — `incidencias.controller.ts`, rutas bajo
  `/escala/incidencias` (POST, PATCH, DELETE, GET, `/sugestoes`, `/ranking`) y
  la sección `incidencias` del `GET /colaboradores/:id/perfil`.
- **Servicio_Incidencias** — `incidencias.service.ts` (efectos colaterales:
  Prisma + notificaciones).
- **Dominio_Incidencias** — `incidencias.domain.ts` (lógica pura: detección de
  no-retorno, derivación de hora esperada, analítica, timeline, ranking).

La estrategia respeta las reglas del proyecto (NFR 9): patrón
controller→service→domain, errores que extienden `ErroDominio`, permisos desde
la fuente única `acessos.domain.ts` (`@Funcionalidade` + `PerfilGuard`),
migraciones **aditivas** y property-based testing con `fast-check` ≥100 corridas.

### Objetivo de diseño y criterios de éxito

1. Un entorno real reproducible (Postgres + API booteada desde `dist/main.js`).
2. Una matriz de pruebas E2E que cubre cada endpoint y cada criterio de
   aceptación de los requisitos 2–6, incluyendo permisos (401/403).
3. Fixtures deterministas para ejercitar auto-detección, umbral y perfil.
4. Un protocolo de corrección de bugs acotado y con regresión verde.
5. Un Informe QA en tabla, priorizado por severidad.
6. Entrega mediante rama desde `main` → PR → CI verde.

---

## Architecture

### Sistema bajo prueba (capas)

```mermaid
flowchart TD
    Cliente[curl / cliente HTTP] -->|Bearer JWT| Guards
    subgraph API[NestJS - dist/main.js]
        Guards[JwtAuthGuard - 401 + PerfilGuard - 403] --> Ctrl[IncidenciasController / ColaboradoresController]
        Ctrl --> Svc[IncidenciasService / PerfilColaboradorService]
        Svc --> Dom[incidencias.domain.ts - puro]
        Svc --> Prisma[(PrismaService)]
        Svc --> Notif[NotificacoesService]
    end
    Prisma --> PG[(PostgreSQL real)]
    Notif --> PG
```

- El arranque **no ejecuta migraciones**: `bootstrap()` solo crea la app,
  aplica `helmet`, CORS (`origensCorsDoAmbiente()`), `ValidationPipe` global
  (`whitelist`, `forbidNonWhitelisted`, `transform`) y escucha en
  `0.0.0.0:PORT`. Esto satisface el **Req 1.4** (la API arranca aunque el
  esquema esté incompleto, porque no gatea el arranque contra el estado de las
  migraciones).
- Guards globales (`seguranca.module.ts`): `JwtAuthGuard` (autenticación,
  lanza `UnauthorizedException` → **401** cuando falta/expira el token) y
  `PerfilGuard` (autorización, lanza `PermissaoInsuficienteError` → **403**
  cuando el perfil no tiene la funcionalidad). El `ThrottlerGuard` global
  aplica rate-limit; el login añade `@Throttle(8/min)`.

### Flujo de validación (de extremo a extremo)

```mermaid
sequenceDiagram
    participant QA
    participant DB as PostgreSQL
    participant API as node dist/main.js
    QA->>DB: 1. prisma migrate deploy (hasta 9w_incidencia_escala)
    QA->>DB: 2. prisma db seed (fiscais, gerentes, escalas...)
    QA->>DB: 3. Backfill colaboradores + fixtures de prueba
    QA->>API: 4. npm run build && node dist/main.js
    QA->>API: 5. POST /acessos/login -> JWT por perfil
    QA->>API: 6. Ejecutar matriz E2E (por endpoint y permiso)
    API->>DB: lecturas/escrituras reales
    QA->>QA: 7. Registrar cada caso en el Informe QA
```

### Preparación del Entorno Real (Req 1)

**Variables de entorno mínimas** (basadas en `backend/.env.example`):

| Variable | Valor sugerido (local) | Notas |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/checkout_pro?schema=public` | Obligatoria (Prisma). |
| `JWT_SECRET` | `openssl rand -hex 32` (valor fijo) | En dev es opcional (genera efímero por proceso), pero **fijarlo** permite reusar el mismo JWT entre reinicios. |
| `JWT_EXPIRES_IN` | `30d` | Por defecto ya es 30d. |
| `PORT` | `3000` | Base URL `http://localhost:3000`. |
| `NODE_ENV` | `development` | |
| `SENHA_INICIAL` | (opcional) | Solo la usa el seed para gerentes sin senha propia. |
| `CORS_ORIGINS` | vacío | En dev refleja la origen; irrelevante para curl. |

**Levantar PostgreSQL local en el sandbox** (Docker si está disponible, o el
binario `postgres` instalado). Ejemplo con Docker:

```bash
docker run --name pg-checkout -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=checkout_pro -p 5432:5432 -d postgres:16
```

Si no hay Docker, iniciar el `postgres` del sistema y crear la base
`checkout_pro`. Verificar la conectividad con `pg_isready -h localhost -p 5432`
antes de continuar.

**Secuencia de arranque** (todos los comandos desde `backend/`):

```bash
# 1. Dependencias (si no están instaladas)
npm ci

# 2. Aplicar TODAS las migraciones hasta 9w_incidencia_escala (Req 1.1)
npx prisma migrate deploy

# 3. Poblar datos base (Req 1.2). Ejecuta prisma/seed.ts vía ts-node
npx prisma db seed        # equivalente a: npm run db:seed

# 4. Compilar backend (prisma generate + nest build; sirve de type-check)
npm run build

# 5. Arrancar la API desde el artefacto compilado (Req 1.3)
node dist/main.js         # equivalente a: npm run start:prod
```

Comprobación de arranque: `curl -s http://localhost:3000/acessos/login -X POST`
(devolverá 400 por body vacío, lo que confirma que la API responde) y,
verificación del esquema, `npx prisma migrate status` (debe reportar todas las
migraciones aplicadas, incluida `9w_incidencia_escala`).

**Qué provee el seed** (`prisma/seed.ts`) — insumos para autenticarse:

| Perfil | login | senha | Uso en la validación |
| --- | --- | --- | --- |
| `GERENTE_DESENVOLVEDOR` (Pedro Munoz) | `232152` | `123456` | Acceso total: cubre todas las rutas (lectura + escritura). |
| `GERENTE` (Arlete) | `arlete.pacheco.fernandes` | `SENHA_INICIAL` (`CheckoutPro@2025`) | Tiene `OPERADORES_AUSENCIAS` y `ESCALA_VISUALIZAR`. |
| `FISCAL` (p. ej. Carmen) | `232150` (matrícula) | `232150` (= matrícula) | Fiscal: también tiene ambos permisos del módulo. |

El seed también crea: 10 `Fiscal` con `Usuario`, sus `EscalaEntry` para los 7
días (`intervaloMin = 120` para todos), operadores/turnos, insumos, metas y
configs.

> **Hallazgo crítico de diseño (fundamenta las fixtures):** el seed **NO crea
> registros `Colaborador`**. La migración de backfill
> `9s_colaboradores_de_fiscais` sí crea la ficha `Colaborador` (funcao FISCAL) a
> partir de cada `Fiscal`, **pero se ejecuta con `migrate deploy` sobre una base
> vacía** (aún no hay fiscais), por lo que no inserta nada; y el seed posterior
> no la re-ejecuta. Resultado: tras `migrate deploy` + `db seed`, la tabla
> `colaboradores` está **vacía**. Como `sugestoes`, `ranking` y
> `GET /colaboradores/:id/perfil` dependen de `Colaborador` (funcao FISCAL), la
> validación E2E **exige** poblar esas fichas antes de probar (ver Fixtures).
> Este comportamiento es en sí mismo un caso del Informe QA (severidad a
> evaluar: ¿debería el seed backfillear colaboradores?).

**Manejo de errores de migración (Req 1.5):** si `migrate deploy` falla, se
captura la salida (`npx prisma migrate status` + log del error) y se registra
en el Informe QA con causa raíz (p. ej. migración pendiente, conflicto de
enum, permiso de `gen_random_uuid()` — requiere la extensión `pgcrypto`/Postgres
≥13). No se aplican fixes destructivos salvo lo previsto en NFR 9.2.

---

## Components and Interfaces

### Contrato de los endpoints y permiso exigido

Permisos resueltos desde `acessos.domain.ts` (fuente única). Nota importante
para el diseño de las pruebas de permisos:

- **Escritura** (POST/PATCH/DELETE `/escala/incidencias`) → `OPERADORES_AUSENCIAS`.
- **Lectura** (GET `/escala/incidencias`, `/sugestoes`, `/ranking`) → `ESCALA_VISUALIZAR`.
- `GET /colaboradores/:id/perfil` → `OPERADORES_AUSENCIAS`.

Perfiles que poseen cada permiso:

| Funcionalidad | GERENTE_DESENVOLVEDOR | GERENTE | SUPERVISOR | FISCAL | IMPORTADOR |
| --- | :--: | :--: | :--: | :--: | :--: |
| `OPERADORES_AUSENCIAS` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `ESCALA_VISUALIZAR` | ✅ | ✅ | ✅ | ✅ | ❌ |

> **Consecuencia para las pruebas de 403:** el único perfil sin acceso al
> módulo es `IMPORTADOR`. El seed **no** crea usuario IMPORTADOR, así que para
> ejercitar el **403** (Req 3.3) hay que crear uno (ver Fixtures). El **401**
> (Req 3.4) se prueba simplemente omitiendo el header `Authorization`.

### Obtención del JWT por perfil

```bash
BASE=http://localhost:3000
TOKEN_DEV=$(curl -s -X POST "$BASE/acessos/login" -H 'Content-Type: application/json' \
  -d '{"login":"232152","senha":"123456"}' | jq -r .token)
```

(El campo exacto del token se confirma con la respuesta real de
`AcessosService.autenticar`; si difiere de `token`, se ajusta el `jq`.)

### Matriz de Pruebas E2E

`{ID}` = id real devuelto por un POST previo; `{COL_FISCAL}` = `Colaborador.id`
de un fiscal (tras backfill); `{DATA}` en formato ISO `YYYY-MM-DD`.

| # | Caso | Método / Request (curl) | Fixture / Precondición | Esperado | Req |
| --- | --- | --- | --- | --- | --- |
| E1 | Crear incidencia válida | `POST /escala/incidencias -d '{"colaboradorId":"{COL_FISCAL}","tipo":"NAO_RETORNO_INTERVALO","data":"{DATA}","horaSaida":"12:00"}'` (dev) | Colaborador FISCAL existe; EscalaEntry del día con `intervaloMin=120` | **201**; body con `id`, `origem="MANUAL"`, `horaEsperadaRetorno="14:00"` (derivada) | 2.1, 2.5 |
| E2 | Hora con formato inválido | `POST ... -d '{...,"horaSaida":"25:99"}'` | — | **400** (mensaje HH:mm del DTO) | 2.2 |
| E3 | Fecha inválida | `POST ... -d '{...,"data":"no-es-fecha"}'` | — | **400** (`IsDateString`); si pasa el DTO pero es NaN → `DadosIncidenciaInvalidosError` 400 | 2.2, 2.3 |
| E4 | Colaborador inexistente | `POST ... -d '{"colaboradorId":"inexistente",...}'` | — | Código de error + mensaje descriptivo (evaluar: hoy crea igual porque `colaboradorId` es String sin FK → **candidato a bug**, ver Error Handling) | 2.3 |
| E5 | Duplicado (colaborador+tipo+data) | Repetir E1 idéntico | E1 ya creada | **409** (`IncidenciaDuplicadaError`, P2002) | 2.4 |
| E6 | PATCH inexistente | `PATCH /escala/incidencias/nope -d '{"motivo":"x"}'` | — | **404** (`IncidenciaNaoEncontradaError`) | 2.6 |
| E7 | PATCH válido | `PATCH /escala/incidencias/{ID} -d '{"motivo":"atestado"}'` | E1 creada | **200**; `motivo` actualizado | 2.6 |
| E8 | DELETE inexistente | `DELETE /escala/incidencias/nope` | — | **404** | 2.6 |
| E9 | DELETE válido | `DELETE /escala/incidencias/{ID}` | incidencia existe | **204** sin body | 2.6 |
| E10 | GET con filtros | `GET /escala/incidencias?colaboradorId={COL}&tipo=NAO_RETORNO_INTERVALO&inicio={D1}&fim={D2}` | varias incidencias en/fuera del rango | **200**; solo las que cumplen filtros, orden `data desc` | 2.7 |
| E11 | GET ranking | `GET /escala/incidencias/ranking?inicio={D1}&fim={D2}` | incidencias de ≥2 colaboradores | **200**; array ordenado desc por `total`, con `nome` resuelto | 2.8 |
| E12 | GET sugestoes (detectado) | `GET /escala/incidencias/sugestoes?data={DATA}` | Ponto DISPONIVEL→INTERVALO→FORA_EXPEDIENTE sin retorno; EscalaEntry `intervaloMin=120`; Colaborador FISCAL | **200**; 1 sugestión `origem="DETECTADO_PONTO"` con `horaSaida`/`horaEsperadaRetorno` | 4.1, 4.2, 4.3 |
| E13 | Sugestoes con retorno (excluida) | idem con INTERVALO→DISPONIVEL→FORA | ponto con retorno | **200**; sin sugestión para ese fiscal | 4.5 |
| E14 | Sugestoes con intervaloMin=0 | idem no-retorno pero `EscalaEntry.intervaloMin=0` | escala con intervalo 0 | **200**; sin sugestión (omitida) | 4.4 |
| E15 | Sugestoes ya registrada | idem no-retorno pero ya existe IncidenciaEscala del día | incidencia + ponto | **200**; sin sugestión (excluida) | 4.6 |
| E16 | Umbral = 3 notifica una vez | 3 POST del mismo colaborador+tipo en el mismo mes (fechas distintas) | gestores existen (Pedro/Arlete); notificaciones activas | Tras el 3.º: exactamente **1** `Notificacao` a gestores en `notificacoes` | 5.1, 5.2 |
| E17 | Umbral ≠ 3 no notifica | 1.º, 2.º y 4.º POST | — | Sin `Notificacao` de umbral en 1/2/4 | 5.3 |
| E18 | Perfil enriquecido | `GET /colaboradores/{COL_FISCAL}/perfil` | Colaborador FISCAL + incidencias | **200**; sección `incidencias` con `totalNaoRetorno`, `ultimoNaoRetorno`, `diasConsecutivosSemIncidencia`, `risco`, `tendencia`, `porDiaSemana`, `frequenciaMensal`, `percentualSobreEscalados` | 6.1, 6.3 |
| E19 | Perfil timeline unificado | idem | faltas (`Ausencia`) + incidencias del colaborador | `timeline` combinando FALTA + NAO_RETORNO_INTERVALO, orden `data desc` | 6.2, 6.3 |
| P1 | 401 sin token | Cualquier endpoint sin `Authorization` | — | **401** | 3.4 |
| P2 | 403 escritura sin permiso | `POST /escala/incidencias` con token IMPORTADOR | usuario IMPORTADOR creado | **403** | 3.1, 3.3 |
| P3 | 403 lectura sin permiso | `GET /escala/incidencias` con token IMPORTADOR | usuario IMPORTADOR | **403** | 3.2, 3.3 |
| P4 | Escritura autorizada | `POST` con token GERENTE/FISCAL | — | **201/200** (no 403) | 3.1 |
| P5 | Lectura autorizada | `GET` con token GERENTE/FISCAL | — | **200** (no 403) | 3.2 |

Cada fila se ejecuta con `curl -sS -o /tmp/body -w '%{http_code}'` para capturar
código HTTP + cuerpo, y se traslada al Informe QA.

---

## Data Models

Modelos Prisma implicados (todos ya existen en `schema.prisma`):

- **`IncidenciaEscala`** (`incidencias_escala`) — `@@unique([colaboradorId, tipo, data])`;
  índices `(colaboradorId, data)`, `(tipo, data)`, `(data)`; enum
  `TipoIncidenciaEscala = NAO_RETORNO_INTERVALO`; `origem` (`MANUAL` |
  `DETECTADO_PONTO`). `colaboradorId` es `String` **sin FK** a `Colaborador`.
- **`RegistroPontoFiscal`** (`registros_ponto_fiscal`) — `fiscalId` (FK a
  `Fiscal`), `status` (`DISPONIVEL`|`INTERVALO`|`FORA_EXPEDIENTE`), `data`
  (medianoche del día), `em` (instante de la transición; ordena el log).
- **`EscalaEntry`** (`escala_entries`) — `funcionarioId` (= `Fiscal.id`),
  `diaSemana` (0..6), `intervaloMin`, `especial`.
- **`Colaborador`** (`colaboradores`) — ficha canónica; `funcao=FISCAL`,
  `usuarioId`, `matricula`. Enlaza con `Fiscal` por `usuarioId` o por
  matrícula (`mapearFiscalColaborador`).
- **`Notificacao`** (`notificacoes`) — destino del aviso de umbral.
- **`Ausencia`** (`ausencias`) — faltas que alimentan el `timeline`.

### Fixtures / datos de prueba

Las fixtures deben crearse por **vías soportadas** y **solo-inserción**
(respetando NFR 9.1 — migraciones/operaciones aditivas). Orden recomendado:

**F0 — Backfill de `Colaborador` FISCAL (imprescindible).** Re-ejecutar, tras el
seed, el mismo SQL insert-only de la migración `9s_colaboradores_de_fiscais`
(es idempotente y solo inserta). Esto crea la ficha `Colaborador` (funcao
FISCAL) y su `ColaboradorIdentificador` MATRICULA para cada fiscal sembrado:

```sql
INSERT INTO "colaboradores" ("id","matricula","nome","funcao","usuarioId")
SELECT gen_random_uuid(), u."login", f."nome", 'FISCAL'::"FuncaoColaborador", f."usuarioId"
FROM "fiscais" f JOIN "usuarios" u ON u."id" = f."usuarioId"
WHERE f."usuarioId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "colaboradores" c WHERE c."usuarioId"=f."usuarioId")
  AND NOT EXISTS (SELECT 1 FROM "colaboradores" c WHERE c."matricula"=u."login");
-- (+ el INSERT de colaborador_identificadores MATRICULA de la misma 9s)
```

Alternativa soportada por API: `POST /colaboradores` (perfil GERENTE_DESENVOLVEDOR)
con `funcao=FISCAL`, `usuarioId` del fiscal, matrícula = login. Se prefiere el
SQL insert-only por ser fiel al backfill oficial. Tras F0, obtener el
`{COL_FISCAL}` con `GET /colaboradores?funcao=FISCAL` (o `SELECT id,nome`).

**F1 — Usuario IMPORTADOR (para 403).** Crear una cuenta con `perfil=IMPORTADOR`
vía `POST /colaboradores` con `gerenteDesenvolvedor=false`... o, más directo,
insertar un `Usuario` IMPORTADOR con `senhaHash` conocido (bcrypt) mediante SQL
insert-only, y loguearse para obtener su JWT.

**F2 — `RegistroPontoFiscal` con transiciones.** Insertar (SQL o vía API
`POST /fiscais/eu/status` autenticado como el fiscal) las transiciones del día,
con `data` = medianoche UTC del día objetivo y `em` crecientes:

- **No-retorno (detecta):** `DISPONIVEL(08:00)` → `INTERVALO(12:00)` →
  `FORA_EXPEDIENTE(17:00)` **sin** `DISPONIVEL` entre el `INTERVALO` y el
  `FORA_EXPEDIENTE`. `detectarNaoRetorno` lo marca como incidencia.
- **Con retorno (no detecta):** `... INTERVALO(12:00)` → `DISPONIVEL(14:00)` →
  `FORA_EXPEDIENTE(17:00)`.

> Nota de fidelidad temporal: `sugestoes` formatea `em` a `HH:mm` en
> `America/Sao_Paulo` y filtra `RegistroPontoFiscal.data = inicioDoDia(data)`.
> Por eso las fixtures deben fijar `data` a la medianoche del día y `em` a
> instantes cuyo `HH:mm` en Brasília sea el deseado. La vía API
> (`POST /fiscais/eu/status`) sella `em = now()` y `data = hoy`, así que para
> fechas/instantes controlados se prefiere el **INSERT SQL directo**.

**F3 — `EscalaEntry` para umbral e intervalo 0.** El seed ya deja
`intervaloMin=120` en los 7 días de cada fiscal. Para el caso E14 (Req 4.4) se
actualiza (o inserta una entrada `especial`) con `intervaloMin=0` para el
`diaSemana` del día objetivo. Recordar que `sugestoes` toma el intervalo
`especial` sobre el general.

**F4 — Incidencias para umbral/ranking/perfil.** Crear 3 incidencias del mismo
`{COL_FISCAL}` en 3 fechas del mismo mes (E16), y ≥2 colaboradores con
incidencias para el ranking (E11). Para el timeline (E19), insertar además
`Ausencia` (`pessoaId={COL_FISCAL}`) en fechas del período.

**F5 — Gestores para el aviso de umbral.** Ya sembrados (Pedro, Arlete). El aviso
usa `NotificacoesService.gestores()`; verificar que devuelve ≥1.



---

## Correctness Properties

*Una propiedad es una característica o comportamiento que debe cumplirse en
todas las ejecuciones válidas del sistema — esencialmente, una afirmación
formal sobre lo que el software debe hacer. Las propiedades son el puente entre
las especificaciones legibles por humanos y las garantías de corrección
verificables por máquina.*

El módulo tiene una capa de dominio **pura** (`incidencias.domain.ts`) que ya se
ejercita con `fast-check`. Estas propiedades formalizan los criterios de
aceptación que son universales; los criterios de wiring HTTP, permisos,
persistencia y proceso se validan por E2E/example/smoke (ver Testing Strategy).
Tras el análisis de reflexión, quedan **5 propiedades no redundantes** (la
detección de no-retorno consolida los Req 4.1/4.3/4.5 en una sola).

### Property 1: Derivación de la hora esperada de retorno

*Para toda* `horaSaida` en formato `HH:mm` válido y todo `intervaloMin` finito
`>= 0`, `derivarHoraEsperadaRetorno(horaSaida, intervaloMin)` es igual a
`min(minutos(horaSaida) + floor(intervaloMin), 23*60+59)` formateado como
`HH:mm`; y para toda `horaSaida` con formato inválido o `intervaloMin`
negativo/no finito, el resultado es la cadena vacía.

**Validates: Requirements 2.5, 2.2, 4.4**

### Property 2: Detección de no-retorno del intervalo

*Para toda* secuencia de transiciones de ponto (`DISPONIVEL` | `INTERVALO` |
`FORA_EXPEDIENTE`) ordenada en el tiempo, `detectarNaoRetorno` devuelve una
detección **si y solo si** existe al menos una transición a `INTERVALO` que no
sea seguida por un `DISPONIVEL` antes del siguiente `FORA_EXPEDIENTE` (o antes
del fin del log); y, de forma metamórfica, insertar un `DISPONIVEL` inmediatamente
después de ese `INTERVALO` (antes del `FORA_EXPEDIENTE`) hace que ese intervalo
deje de contar como no-retorno.

**Validates: Requirements 4.1, 4.3, 4.5**

### Property 3: Orden y conservación del ranking de incidencias

*Para toda* lista de entradas por colaborador (`colaboradorId`, `nome`, `total`),
`rankingIncidencias` devuelve una permutación de la entrada (mismos elementos y
totales) ordenada de forma **descendente por `total`**, con desempate
**ascendente por `nome`**.

**Validates: Requirements 2.8**

### Property 4: Invariantes de la analítica de incidencias

*Para toda* lista de incidencias y todo `diasEscalados >= 0`,
`analisarIncidencias` cumple: `total` es igual al número de incidencias y a la
suma de `porTipo` y a la suma de `porDiaSemana`; `percentualSobreEscalados` está
en `[0, 100]`; `risco` pertenece a `{BAIXO, MEDIO, ALTO}`; `tendencia`
pertenece a `{MELHORANDO, ESTAVEL, PIORANDO}`; y `diasConsecutivosSemIncidencia`
es `>= 0`.

**Validates: Requirements 6.1**

### Property 5: Timeline unificado ordenado y completo

*Para todo* conjunto de faltas (`Ausencia`) e incidencias, `timelineUnificada`
devuelve un array ordenado de forma **descendente por fecha** cuya longitud es
exactamente `faltas.length + incidencias.length` (no pierde ni duplica
eventos).

**Validates: Requirements 6.2**

---

## Error Handling

### Mapeo de errores a HTTP (comportamiento esperado)

Todos los errores del módulo extienden `IncidenciasError` → `ErroDominio` y
declaran su `statusHttp`; el `DominioExceptionFilter` global los traduce.

| Situación | Error / mecanismo | HTTP | Criterio |
| --- | --- | --- | --- |
| DTO inválido (HH:mm, `IsDateString`, `whitelist`) | `ValidationPipe` global | **400** | 2.2 |
| Fecha que resulta `NaN` en el servicio | `DadosIncidenciaInvalidosError` | **400** | 2.2/2.3 |
| Colaborador inválido | `ColaboradorIncidenciaInvalidoError` | **400** | 2.3 |
| Duplicado `(colaboradorId,tipo,data)` (P2002) | `IncidenciaDuplicadaError` | **409** | 2.4 |
| PATCH/DELETE sobre id inexistente | `IncidenciaNaoEncontradaError` | **404** | 2.6 |
| Sin token | `JwtAuthGuard` → `UnauthorizedException` | **401** | 3.4 |
| Token válido sin permiso | `PerfilGuard` → `PermissaoInsuficienteError` | **403** | 3.1–3.3 |

> **Candidato a bug ya identificado en el diseño (caso E4):** `POST` con un
> `colaboradorId` inexistente **no falla hoy**, porque `IncidenciaEscala.colaboradorId`
> es `String` **sin clave foránea** y `registrar()` no valida la existencia del
> colaborador antes del `create`. El Req 2.3 espera un código de error con
> mensaje descriptivo. Se documentará en el Informe QA; si se confirma como
> defecto, el fix acotado sería validar la existencia del `Colaborador` en
> `IncidenciasService.registrar` y lanzar `ColaboradorIncidenciaInvalidoError`
> (ya existe, mapea a 400), respetando controller→service→domain y sin cambio
> de esquema.

### Estrategia de corrección de bugs

Cada bug detectado en la matriz E2E sigue este protocolo acotado (NFR 9, Req 8):

1. **Documentar** en el Informe QA: caso, esperado, obtenido, severidad, archivo.
2. **Causa raíz**: localizar la capa responsable (controller / service / domain
   / DTO / migración) leyendo el código; no parchear síntomas.
3. **Fix acotado**, respetando las reglas del proyecto:
   - Mantener el patrón **controller→service→domain**: la validación/regla de
     negocio va al **service** o al **domain puro**, no al controller.
   - Todo error nuevo **extiende `ErroDominio`** con su `statusHttp`.
   - Los permisos se leen de la **fuente única** `acessos.domain.ts` (no
     hardcodear roles en el guard/controller).
   - Cambios de esquema **solo aditivos** (NFR 9.1); una migración destructiva
     requiere la salvaguarda documentada de NFR 9.2 y solo para defecto crítico
     o vulnerabilidad.
   - Si se toca el dominio puro, **añadir/ajustar la property test** (`fast-check`
     ≥100 corridas) correspondiente.
4. **Re-ejecución**: repetir el caso E2E que falló hasta verlo conforme.
5. **Regresión**: correr la Suite_Regresion completa (abajo) para descartar
   efectos colaterales.

---

## Testing Strategy

### Enfoque dual

- **Property-based tests** (dominio puro) — validan las 5 propiedades
  universales de arriba. Biblioteca: **`fast-check`** (ya en
  `backend/devDependencies`). Mínimo **100 corridas** por propiedad. Ubicación:
  `backend/src/incidencias/incidencias.properties.spec.ts` (ya existe; se
  amplía si un fix toca el dominio). Cada test se etiqueta con un comentario:
  `// Feature: validacao-e2e-incidencias-escala, Property {n}: {texto}`.
- **Tests E2E / integración** (contra Postgres real) — ejecutan la matriz de
  pruebas (E1–E19, P1–P5) vía `curl`, capturando código HTTP + cuerpo. Cubren
  wiring HTTP, permisos, persistencia, zona horaria y notificaciones — los
  criterios clasificados como EXAMPLE/EDGE_CASE/INTEGRATION/SMOKE en el prework.
- **Smoke tests** — arranque del entorno (Req 1.1–1.3): `migrate deploy`,
  `db seed`, `node dist/main.js` responden sin error.

### Suite de Regresión (comandos exactos)

**Backend** (`cd backend`) — scripts reales de `package.json`:

```bash
npm run build     # prisma generate && nest build (compila TS => sirve de type-check)
npm run lint      # eslint "{src,test}/**/*.ts" --fix
npm test          # jest (incluye las property tests de fast-check)
```

> El backend no tiene un script `type-check` separado; `nest build` compila con
> `tsc` y falla ante errores de tipos. Opcionalmente, para un type-check puro:
> `npx tsc --noEmit -p tsconfig.json`.

**Mobile** (`cd mobile`) — scripts reales de `package.json`:

```bash
npm run type-check   # tsc --noEmit
npm run lint         # eslint "src/**/*.{ts,tsx}" App.tsx index.ts
npm test             # jest (jest-expo)
```

> Mobile no tiene build de producción por CLI (Expo); el equivalente a "build"
> es `type-check`. Si cualquier comando de la suite falla, se registra en el
> Informe QA con archivo y causa raíz (Req 7.3).

### Ejecución E2E: verificación mínima por caso

Patrón para capturar resultado (código + cuerpo) de cada fila de la matriz:

```bash
curl -sS -o /tmp/body.json -w '%{http_code}\n' \
  -X POST "$BASE/escala/incidencias" \
  -H "Authorization: Bearer $TOKEN_DEV" -H 'Content-Type: application/json' \
  -d '{"colaboradorId":"'"$COL_FISCAL"'","tipo":"NAO_RETORNO_INTERVALO","data":"2026-06-15","horaSaida":"12:00"}'
cat /tmp/body.json
```

Para las notificaciones (E16/E17) y el filtrado (E10), la verificación del
efecto se hace consultando la BD (`SELECT` de solo lectura) o el endpoint de
lectura correspondiente.

### Formato del Informe QA (entregable — Req 8)

Documento en Markdown (`INFORME_QA.md` o sección al final de este spec) con una
**tabla ordenada por severidad descendente** (Req 8.3):

| Caso | Esperado | Obtenido | Severidad | Archivo | Causa raíz | Fix propuesto |
| --- | --- | --- | --- | --- | --- | --- |
| E4 | 400 + mensaje | 201 (crea igual) | Alta | incidencias.service.ts | `colaboradorId` sin FK ni validación | Validar existencia de Colaborador y lanzar `ColaboradorIncidenciaInvalidoError` |
| E1 | 201 | 201 | Sin defecto | — | | |

- **Severidad**: `Alta` / `Media` / `Baja` / `Sin defecto`.
- Los casos **conformes** se marcan `Sin defecto` con causa raíz y fix
  **vacíos** (Req 8.4).
- El Plan_Validacion se considera **completo** solo cuando el Informe QA se ha
  presentado (Req 8.2).

### Flujo de entrega (Req 10)

```mermaid
flowchart LR
    A[Rama nueva desde main] --> B[Fixes + verificacion local: build/lint/test + E2E]
    B --> C[Push a rama + Pull Request contra main]
    C --> D[CI verde]
```

1. **Rama** a partir de `main` (nunca push directo a `main`).
2. **Verificación local** completa (Suite_Regresion + E2E contra Postgres cuando
   el cambio afecte a la BD) antes de abrir la integración.
3. **Pull Request** contra `main` mediante las herramientas de push/PR.
4. Confirmar **CI en verde** (workflow `.github/workflows/ci.yml`).

### Trazabilidad criterios → estrategia (resumen del prework)

| Criterio | Clasificación | Cómo se valida |
| --- | --- | --- |
| 1.1–1.3, 7.1–7.2 | SMOKE | Comandos de entorno / regresión |
| 1.4, 5.2 | INTEGRATION | Arranque con esquema parcial / fila en `notificacoes` |
| 2.1, 2.3, 2.4, 2.6, 2.7, 3.1–3.4, 4.2, 4.6, 5.1, 5.3, 6.3, 8.x, 10.x | EXAMPLE | Casos E2E de la matriz |
| 2.2, 4.4 | EDGE_CASE | E2E + Property 1 (dominio) |
| 2.5 | PROPERTY | Property 1 |
| 4.1, 4.3, 4.5 | PROPERTY | Property 2 |
| 2.8 | PROPERTY | Property 3 |
| 6.1 | PROPERTY | Property 4 |
| 6.2 | PROPERTY | Property 5 |
