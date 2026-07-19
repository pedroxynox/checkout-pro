# Check-out PRO — Gestão Inteligente de Supermercado

Aplicação **web e Android** para gestão da frente de caixa de supermercado.
Reúne operação diária, pessoas, ponto e jornada, escala, indicadores, vendas,
estoque, checklists, contratos, disciplina, APAE, notificações e a assistente de
IA **Cluby** — num **monorepo** com backend **NestJS** e app **Expo/React
Native**.

> UI, domínio e código em **português do Brasil**.

---

## 📚 Documentação

Toda a documentação vive em [`docs/`](docs/README.md) — comece pelo índice
mestre:

### **➡️ [docs/README.md](docs/README.md)**

Atalhos por papel:

- **Dono / gestão:** [Resumo executivo](docs/00-visao-geral/resumo-executivo.md) ·
  [Estado e métricas](docs/08-gestao/estado-e-metricas.md) ·
  [Roadmap e pendências](docs/08-gestao/roadmap-e-pendencias.md)
- **Desenvolvimento:** [Onboarding (30 min)](docs/00-visao-geral/onboarding.md) ·
  [Arquitetura](docs/02-arquitetura/visao-geral.md) ·
  [Atlas do backend](docs/03-atlas-backend/) ·
  [Atlas do mobile](docs/04-atlas-mobile/)
- **Operação:** [Instalação local](docs/07-operacao/instalacao-local.md) ·
  [Deploy](docs/07-operacao/deploy.md) ·
  [Runbook de incidentes](docs/07-operacao/runbook-incidentes.md)
- **Qualidade:** [Estratégia de testes](docs/06-qualidade/estrategia-de-testes.md) ·
  [Guia de QA manual](docs/06-qualidade/guia-qa-manual.md)

> **Números do projeto** (linhas, testes, rotas, tabelas): fonte única em
> [Estado e métricas](docs/08-gestao/estado-e-metricas.md) — gerada a partir do
> código, nunca copiada em outros documentos.

---

## Início rápido

Pré-requisitos: **Node.js 20+** e **PostgreSQL**. Passo a passo completo em
[Instalação local](docs/07-operacao/instalacao-local.md).

```bash
# na raiz do repositório (monorepo com workspaces)
npm install

# backend
cd backend
cp .env.example .env          # ajuste DATABASE_URL (e JWT_SECRET em produção)
npm run prisma:generate && npm run prisma:migrate && npm run seed
npm run start:dev

# em outro terminal — app (web/mobile)
cd mobile
EXPO_PUBLIC_API_URL=http://localhost:3000 npm run start
```

---

## Estrutura do repositório

```text
backend/        # API NestJS + Prisma (prisma/ = schema, migrations, seed)
mobile/         # App Expo / React Native (roda como APK e web)
docs/           # Documentação (índice em docs/README.md)
scripts/        # Gerador (docs:gen) e guardião (docs:check) da documentação
.kiro/steering/ # Handoff técnico e regras (inclui a regra de documentação)
```

Arquitetura em uma linha: o app fala com a API por **HTTPS + JWT** (e Socket.IO
para tempo real); a API acessa o **PostgreSQL** via Prisma e integra **Gemini**
e **push**. Detalhe em [Arquitetura](docs/02-arquitetura/visao-geral.md).

---

## Verificação

```bash
npm run verify        # build + testes (backend) e type-check + lint + testes (app)
npm run docs:check    # guardião da documentação (regenera a referência e valida)
```

O CI ([`.github/workflows/`](.github/workflows/)) roda essas verificações a cada
push/PR. O **guardião da documentação** barra o merge quando a referência fica
defasada ou quando um módulo muda sem atualizar o seu documento no Atlas — ver a
regra em [`.kiro/steering/documentacao.md`](.kiro/steering/documentacao.md).

---

## Convenções

- **Documentação em português padrão**; toda mudança de código atualiza a
  documentação correspondente (o guardião no CI garante isso).
- TypeScript `strict`; regras de negócio em domínio puro + testes.
- Trabalhar em **branch e PR**; não publicar direto em `main` sem pedido
  explícito.
- Migrações **aditivas** por padrão.
