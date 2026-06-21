# Check-out PRO — Gestão de Frente de Caixa (Stok Center)

Aplicativo de gestão da operação de supermercado da rede **Stok Center**, voltado a
gerentes, supervisores, fiscais e operadores. Centraliza a operação de frente de
caixa e do mercado num só lugar, com uma assistente de IA (**Cluby**) que orienta a
equipe e mostra o passo a passo das normativas com fotos.

> Produto 100% em Português do Brasil. Web (navegador) + Android (APK via Expo).

---

## Sumário

- [Arquitetura](#arquitetura)
- [Stack tecnológico](#stack-tecnológico)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Instalação local](#instalação-local)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Scripts disponíveis](#scripts-disponíveis)
- [Deploy no Render](#deploy-no-render)
- [Geração do APK (Expo)](#geração-do-apk-expo)
- [Convenções de desenvolvimento](#convenções-de-desenvolvimento)

---

## Arquitetura

Monorepo **npm workspaces** com dois pacotes independentes:

```
┌─────────────────────────┐         ┌──────────────────────────────┐
│  mobile/ (Expo / RN)     │  HTTPS  │  backend/ (NestJS)           │
│  - App Android (APK)     │ ───────▶│  - REST + WebSocket + Cron   │
│  - App Web (estático)    │  Bearer │  - Prisma → PostgreSQL       │
└─────────────────────────┘   JWT   │  - Gemini (assistente IA)    │
                                     └──────────────────────────────┘
```

- **backend/** — API NestJS modular por domínio (um módulo por área: acessos,
  arrecadação, fechamento, fiscais, importações, indicadores, insumos, requisições,
  lote APAE, notificações, vendas, checklist, assistente). Autenticação JWT global;
  autorização por perfil/funcionalidade via guards. WebSocket (status de fiscais em
  tempo real) e cron jobs (alertas, limpeza) no fuso `America/Sao_Paulo`.
- **mobile/** — App React Native + Expo, também exportável como site estático para a
  web. Organizado por camadas (`api`, `screens`, `components`, `navigation`,
  `hooks`, `offline`, `theme`, `utils`). Suporte offline com fila de sincronização.

Separação de responsabilidades no backend, por módulo: `*.controller.ts` (HTTP) →
`*.service.ts` (regra de negócio) → Prisma (persistência); `*.domain.ts` para regras
puras, `dto/` para validação de entrada, `*.errors.ts` para erros de domínio
traduzidos a HTTP por um filtro global (`common/filters`).

## Stack tecnológico

| Camada | Tecnologias |
| --- | --- |
| Backend | Node.js, NestJS, TypeScript, Prisma, PostgreSQL, JWT, WebSocket, `@nestjs/schedule` |
| IA | Google Gemini (`gemini-2.5-flash`) via REST |
| Mobile | React Native, Expo SDK 52, TypeScript, React Navigation (native-stack) |
| Testes | Jest (backend e mobile), fast-check (property-based), Testing Library |
| Qualidade | ESLint, Prettier, TypeScript em modo `strict` (ambos os pacotes) |
| Infra | Render (API + Web + PostgreSQL), EAS Build (APK) |

## Estrutura de pastas

```
.
├── backend/
│   ├── prisma/                 # schema, migrations, seed
│   ├── assets/procedimentos/   # fotos das normativas (servidas em /assets)
│   └── src/
│       ├── <dominio>/          # módulo por área (controller/service/module/dto)
│       ├── assistente/         # chat IA (Cluby) + procedimentos guiados
│       ├── common/             # guards, decorators, filtros, utilidades
│       ├── config/             # validação de env
│       └── main.ts
└── mobile/
    └── src/
        ├── api/                # client HTTP, services por domínio, types
        ├── auth/               # contexto de autenticação e permissões
        ├── components/         # UI compartilhada
        ├── navigation/         # navegadores e rotas
        ├── hooks/ offline/     # hooks e suporte offline
        ├── screens/            # telas por área
        ├── theme/ utils/       # tema, formatação, diálogos
        └── ...
```

## Instalação local

Pré-requisitos: **Node.js ≥ 18**, **PostgreSQL** (para o backend) e, para o mobile,
o app **Expo Go** ou um emulador.

```bash
# 1. Instalar dependências de todo o monorepo (na raiz)
npm install

# 2. Backend
cd backend
cp .env.example .env            # ajuste DATABASE_URL e JWT_SECRET
npm run prisma:generate
npm run prisma:migrate          # aplica as migrations no banco local
npm run seed                    # (opcional) popula dados iniciais
npm run start:dev               # API em http://localhost:3000

# 3. Mobile (em outro terminal)
cd mobile
EXPO_PUBLIC_API_URL=http://localhost:3000 npm run start
```

## Variáveis de ambiente

### Backend (`backend/.env`)

| Variável | Obrigatória | Padrão | Descrição |
| --- | --- | --- | --- |
| `DATABASE_URL` | sim | — | String de conexão PostgreSQL (Prisma) |
| `JWT_SECRET` | **sim em produção** | `dev-secret-trocar` (inseguro) | Segredo de assinatura dos tokens JWT. Use algo longo e aleatório (`openssl rand -hex 32`) |
| `JWT_EXPIRES_IN` | não | `30d` | Expiração do token de acesso (a equipe fica logada ~1 mês) |
| `PORT` | não | `3000` | Porta HTTP (o Render injeta automaticamente) |
| `NODE_ENV` | não | `development` | `development` \| `test` \| `production` |
| `HORARIO_FIM_DO_DIA` | não | `18:00` | Horário (HH:mm) para alertas de importações pendentes |
| `GEMINI_API_KEY` | não | — | Chave do Google Gemini (assistente Cluby). Sem ela, o assistente responde "não configurado" |
| `GEMINI_MODEL` | não | `gemini-2.5-flash` | Modelo Gemini usado pela Cluby |

> ⚠️ **Segurança:** defina `JWT_SECRET` em produção. Sem ele, a API usa um segredo
> padrão conhecido e os tokens podem ser forjados. A aplicação registra um alerta no
> startup quando isso ocorre em produção.

### Mobile

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | sim | URL base da API (ex.: `https://stok-center-api.onrender.com`) |

## Scripts disponíveis

### Raiz (delegam ao backend)

| Comando | Descrição |
| --- | --- |
| `npm run build` | Compila o backend |
| `npm run start` | Inicia o backend |
| `npm run lint` / `npm run test` | Lint / testes do backend |

### Backend (`backend/`)

| Comando | Descrição |
| --- | --- |
| `npm run start:dev` | API em modo watch |
| `npm run start:prod` | Inicia a build de produção (`dist/main.js`) |
| `npm run build` / `lint` / `test` | Build / lint / testes |
| `npm run test:cov` | Testes com cobertura |
| `npm run prisma:generate` | Gera o Prisma Client |
| `npm run prisma:migrate` | Aplica migrations (dev) |
| `npm run prisma:validate` | Valida o schema Prisma |
| `npm run seed` | Popula dados iniciais |

### Mobile (`mobile/`)

| Comando | Descrição |
| --- | --- |
| `npm run start` | Inicia o Expo (dev) |
| `npm run android` / `ios` / `web` | Abre na plataforma |
| `npm run type-check` | Checagem de tipos (`tsc --noEmit`) |
| `npm run lint` / `test` | Lint / testes |

## Deploy no Render

São três serviços no Render, todos com deploy automático ao dar push na `main`:

1. **API (`stok-center-api`)** — Web Service, root directory `backend/`.
   - Build: `npm install && npm run build && npm run prisma:generate`
   - Start: `npm run start:prod`
   - Variáveis: `DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY`, etc.
   - Migrations: aplicar via `prisma migrate deploy` no banco de produção.
2. **Web (`stok-center-web`)** — site estático gerado com:
   `EXPO_PUBLIC_API_URL=<url-da-api> npx expo export --platform web --output-dir dist`
   (publish directory `dist`).
3. **PostgreSQL** — banco gerenciado do Render (fornece o `DATABASE_URL`).

> No plano gratuito do Render, a API "dorme" após inatividade; a primeira chamada
> pode levar ~30–60s para acordar.

## Geração do APK (Expo)

```bash
cd mobile
npm install -g eas-cli      # se ainda não tiver
eas login
eas build -p android --profile preview   # gera um APK instalável
```

Defina `EXPO_PUBLIC_API_URL` apontando para a API de produção no perfil de build
(`eas.json`) para que o APK fale com o backend correto.

## Convenções de desenvolvimento

- **Idioma:** domínio, identificadores e UI em **Português do Brasil**.
- **TypeScript `strict`** habilitado nos dois pacotes; evitar `any` (use tipos
  compartilhados em `types.ts` / DTOs).
- **Backend:** um módulo NestJS por domínio, com a separação
  controller → service → domínio/Prisma; erros de domínio tipados + filtro global.
- **Mobile:** UI em `components/`, chamadas de rede em `api/services/`, telas em
  `screens/`, tipos espelhando os contratos do backend em `api/types.ts`.
- **Documentação:** JSDoc em funções públicas, services, hooks e utilidades; evitar
  comentários redundantes.
- **Qualidade:** rodar `lint` + `test` antes de commitar. Backend: também
  `prisma validate` e `build`. Mobile: `type-check` + export web para validar a build.
- **Git:** commits descritivos; push direto à `main` aciona o redeploy no Render.
