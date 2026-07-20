> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-20 · **Cobre:** operação — publicação (deploy) do backend e do app

# Deploy — Check-out PRO

Como publicar o backend (API NestJS + PostgreSQL) no **Render** e gerar o app
**Android** (APK/App Bundle) pelo **EAS Build**.

> Antes de liberar um deploy, percorra o [Checklist de produção](checklist-producao.md)
> (itens bloqueantes e cuidados de infra). O significado de cada variável está
> em [`variaveis-de-ambiente.md`](variaveis-de-ambiente.md). Quando algo falhar
> em produção, veja o [runbook de incidentes](runbook-incidentes.md).

---

## 1. Backend no Render (API + PostgreSQL)

A infraestrutura é declarada no `render.yaml` (Blueprint do Render). Ele cria
automaticamente três recursos:

1. **`stok-center-db`** — banco PostgreSQL gerenciado (plano pago
   `basic-256mb`; persistente, sem a expiração de ~30 dias do plano free).
2. **`checkout-pro-api`** — serviço web Node com o backend NestJS (plano pago
   `starter`, que **não** hiberna — sem cold start).
3. **`checkout-pro-web`** — site estático com a versão web do app (Expo Web),
   útil para revisar layout no navegador. Sites estáticos são gratuitos e
   **não dormem**.

### 1.1 Ciclo de vida do serviço `checkout-pro-api`

Definido no `render.yaml`:

| Fase | Comando | O que faz |
|---|---|---|
| **Build** | `npm install --include=dev && npx prisma generate && npm run build` | `--include=dev` força as devDependencies (NestJS CLI, Prisma, ts-node) mesmo com `NODE_ENV=production`. Gera o Prisma Client e compila. |
| **Pre-Deploy** | `npx prisma migrate deploy` | Aplica as migrações **antes** de a nova versão subir — evita timeout de porta por causa do *advisory lock* do Prisma segurar a partida. |
| **Start** | `node dist/main.js` | Sobe a API já compilada, ouvindo em `0.0.0.0` na `PORT` fornecida pelo Render. |
| **Health check** | `GET /health` | Liveness simples (200 se o processo está de pé). |

> **Migrações no deploy:** rodam sempre no *Pre-Deploy Command* (`migrate
> deploy`, que aplica migrações já criadas — nunca `migrate dev`). O **seed
> NÃO roda automaticamente** de propósito: assim uma pessoa excluída em "Acesso"
> não "ressuscita" a cada deploy.

### 1.2 Variáveis de ambiente no Render

Já declaradas no `render.yaml`:

| Variável | Como é definida |
|---|---|
| `NODE_ENV` | `production` (fixo) |
| `DATABASE_URL` | injetada do banco `stok-center-db` (`connectionString`) |
| `DATABASE_CONNECTION_LIMIT` | `10` (teto do pool do Prisma; ver [`variaveis-de-ambiente.md`](variaveis-de-ambiente.md)) |
| `JWT_SECRET` | `generateValue: true` (gerado automaticamente pelo Render) |
| `JWT_EXPIRES_IN` | `30d` |
| `HORARIO_FIM_DO_DIA` | `22:50` |
| `GEMINI_MODEL` | `gemini-2.5-flash` |
| `SENHA_INICIAL` | `sync: false` → **definir manualmente no painel** (secreta) |
| `GEMINI_API_KEY` | `sync: false` → **definir manualmente no painel** (secreta) |

E no serviço estático `checkout-pro-web`: `EXPO_PUBLIC_API_URL =
https://checkout-pro-api.onrender.com`.

### 1.3 Passo a passo — primeiro deploy

1. No Render, crie um **Blueprint** apontando para este repositório; ele lê o
   `render.yaml` e provisiona banco, API e site estático.
2. No painel do serviço `checkout-pro-api`, defina os segredos marcados como
   `sync: false`: **`SENHA_INICIAL`** e **`GEMINI_API_KEY`**.
3. Aguarde o build e o deploy. Confirme a saúde em
   `https://checkout-pro-api.onrender.com/health` e a prontidão do banco em
   `/health/ready`.
4. **Somente em banco novo/vazio**, rode o seed **uma vez** manualmente (Shell
   do serviço, dentro de `backend/`):
   ```bash
   npx prisma db seed
   ```
5. Troque a senha inicial dos usuários após o primeiro login.

### 1.4 Deploys seguintes

Cada push na branch conectada dispara build + *pre-deploy* (migrações) + start
automaticamente. Não é preciso rodar o seed novamente.

### 1.5 Cuidados de produção (ver checklist)

- **Planos pagos (desde jul/2026):** o serviço web usa `starter` (não hiberna,
  sem cold start) e o banco usa `basic-256mb` (persistente). O antigo workflow
  de keep-alive foi **removido** por não ser mais necessário. Ver o ADR
  [0013](../02-arquitetura/decisoes/0013-infra-paga-e-pool-de-conexoes.md).
- **Limite de conexões do banco:** o `basic-256mb` tem um teto de conexões
  modesto. O backend fixa o pool via `DATABASE_CONNECTION_LIMIT` (padrão `10`).
  Ao subir de plano ou escalar horizontalmente, reavalie esse valor.
- **Armazenamento de arquivos ainda é efêmero:** o disco do contêiner do Render
  é apagado a cada deploy mesmo no plano pago (não há *Render Disk* montado).
  As fotos de checklist gravadas por `LocalDiskStorage` se perdem entre deploys
  — migrar para um storage de objetos (S3-compatível) é a próxima prioridade.
- **Cota do Gemini:** a camada gratuita é insuficiente para ~15 fiscais
  simultâneos; avalie faturamento.
- **Serviço web duplicado:** manter apenas um serviço web (ver checklist).
- **Health check de readiness:** opcionalmente apontar o health check do Render
  para `/health/ready` (checa o banco) em vez do liveness simples.

---

## 2. App Android (APK / App Bundle via EAS)

O app é publicado pelo **EAS Build** (servidores do Expo), acionado pelo
workflow `build-apk.yml`.

### 2.1 Perfis de build (`mobile/eas.json`)

| Perfil | Saída | `EXPO_PUBLIC_API_URL` |
|---|---|---|
| `development` | APK (dev client) | `http://localhost:3000` |
| `preview` | **APK** (distribuição interna) | `https://checkout-pro-api.onrender.com` |
| `production` | **App Bundle** (`.aab`, autoincrementa a versão) | `https://checkout-pro-api.onrender.com` |

### 2.2 Build pelo GitHub Actions (recomendado)

O workflow `Build APK (Android)` roda por acionamento manual (aba **Actions**
→ *Run workflow*):

1. Usa Node 20 e configura o EAS com o secret **`EXPO_TOKEN`** do repositório
   (nunca versionado).
2. Instala as dependências na **raiz** (`npm install`), pois o monorepo usa
   workspaces e o `package-lock.json` fica na raiz.
3. Roda `eas build --platform android --profile <preview|production>
   --non-interactive` dentro de `mobile/`.
4. O link do artefato aparece no log do job.

Escolha o **profile** no input do workflow: `preview` (APK) ou `production`
(App Bundle).

### 2.3 Build local (alternativa)

```bash
# Requer estar logado no Expo (eas login) e as dependências instaladas na raiz
npm install
eas build --platform android --profile preview --non-interactive
```
(rode o comando `eas build` dentro de `mobile/`).

### 2.4 Cuidados

- O `projectId` do EAS e o `owner` estão em `mobile/app.json`; não altere sem
  necessidade.
- Ao mudar a URL da API, ajuste o `EXPO_PUBLIC_API_URL` do perfil em
  `mobile/eas.json` (não hardcode no código).
- O App Bundle (`production`) autoincrementa a versão (`appVersionSource:
  remote`); a versão exibida vem de `app.json` (`version`).

---

## 3. Referências

- Instalação e execução local: [`instalacao-local.md`](instalacao-local.md)
- Variáveis de ambiente: [`variaveis-de-ambiente.md`](variaveis-de-ambiente.md)
- Prontidão de produção: [`checklist-producao.md`](checklist-producao.md)
- Falhas em produção: [`runbook-incidentes.md`](runbook-incidentes.md)
