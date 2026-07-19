# Documentação do Check-out PRO

Bem-vindo à central de documentação do **Check-out PRO** — sistema de gestão
inteligente da frente de caixa de supermercado (backend NestJS + app Expo/React
Native). Toda a documentação vive aqui, em `docs/`, em **português padrão**.

> **Números do projeto** (linhas, testes, rotas, tabelas): consulte sempre a
> fonte única [`08-gestao/estado-e-metricas.md`](08-gestao/estado-e-metricas.md).
> Nenhum outro documento repete esses números — eles são gerados a partir do
> código.

---

## Por onde começar (segundo o seu papel)

| Você é… | Comece por |
|---|---|
| **Dono / gestor do negócio** | [Resumo executivo](00-visao-geral/resumo-executivo.md) → [Estado e métricas](08-gestao/estado-e-metricas.md) → [Roadmap e pendências](08-gestao/roadmap-e-pendencias.md) |
| **Pessoa desenvolvedora nova** | [Primeiros 30 minutos](00-visao-geral/onboarding.md) → [Visão de arquitetura](02-arquitetura/visao-geral.md) → [Atlas do backend](03-atlas-backend/) |
| **QA / testes** | [Estratégia de testes](06-qualidade/estrategia-de-testes.md) → [Guia de QA manual](06-qualidade/guia-qa-manual.md) → [Catálogo de testes](06-qualidade/catalogo-de-testes.md) |
| **Operação / suporte** | [Instalação local](07-operacao/instalacao-local.md) → [Deploy](07-operacao/deploy.md) → [Runbook de incidentes](07-operacao/runbook-incidentes.md) |

Não entende um termo? Veja o [Glossário](00-visao-geral/glossario.md).

---

## Mapa da documentação

### 00 · Visão geral
- [Resumo executivo](00-visao-geral/resumo-executivo.md) — o que é e como vai, em linguagem de negócio.
- [Glossário](00-visao-geral/glossario.md) — termos do negócio (TAC, jornada, arrecadação…).
- [Mapa do projeto](00-visao-geral/mapa-do-projeto.md) — como App ↔ Backend ↔ Banco se conectam.
- [Onboarding (primeiros 30 minutos)](00-visao-geral/onboarding.md) — subir o projeto do zero.
- [Prompt para nova sessão do Kiro](00-visao-geral/prompt-para-nova-sessao.md) — o que colar para uma sessão nova entender o projeto e seguir as regras.

### 01 · Produto
- [Visão e alcance](01-produto/visao-e-alcance.md)
- [Perfis e permissões](01-produto/perfis-e-permissoes.md)
- [Regras de negócio](01-produto/regras-de-negocio/) — um documento por grande tema.

### 02 · Arquitetura
- [Visão geral](02-arquitetura/visao-geral.md) — monorepo, camadas, padrões.
- [Backend (NestJS)](02-arquitetura/backend.md) · [Mobile (Expo/RN)](02-arquitetura/mobile.md)
- [Fluxo de dados](02-arquitetura/fluxo-de-dados.md) · [Segurança](02-arquitetura/seguranca.md)
- [Decisões de arquitetura (ADR)](02-arquitetura/decisoes/)

### 03 · Atlas do backend
Um documento por **módulo** do backend (o detalhe fino: função por função,
estado por estado, teste por teste). Índice em
[`03-atlas-backend/`](03-atlas-backend/). Padrão em
[`_modelo-modulo.md`](03-atlas-backend/_modelo-modulo.md).

### 04 · Atlas do mobile
Um documento por **área de tela** do app. Índice em
[`04-atlas-mobile/`](04-atlas-mobile/). Padrão em
[`_modelo-tela.md`](04-atlas-mobile/_modelo-tela.md).

### 05 · Referência de dados _(gerada automaticamente)_
- [Modelo de dados](05-referencia-dados/modelo-de-dados.md) — tabelas e estados.
- [Dicionário de dados](05-referencia-dados/dicionario-de-dados.md) — campo a campo.
- [Migrações](05-referencia-dados/migracoes.md) — histórico do banco.
- [API HTTP](05-referencia-dados/api-http.md) — todas as rotas.

### 06 · Qualidade
- [Estratégia de testes](06-qualidade/estrategia-de-testes.md)
- [Guia de QA manual](06-qualidade/guia-qa-manual.md)
- [Catálogo de testes](06-qualidade/catalogo-de-testes.md) _(gerado)_

### 07 · Operação
- [Instalação local](07-operacao/instalacao-local.md) · [Variáveis de ambiente](07-operacao/variaveis-de-ambiente.md)
- [Deploy](07-operacao/deploy.md) · [Checklist de produção](07-operacao/checklist-producao.md)
- [Runbook de incidentes](07-operacao/runbook-incidentes.md)

### 08 · Gestão
- [Estado e métricas](08-gestao/estado-e-metricas.md) _(gerado — fonte única de números)_
- [Roadmap e pendências](08-gestao/roadmap-e-pendencias.md)
- [Histórico de mudanças](08-gestao/historico-de-mudancas.md)
- [Auditorias](08-gestao/auditorias/)

---

## Como a documentação se mantém sempre em dia

Esta documentação **não desatualiza em silêncio**, por dois mecanismos:

1. **Referência gerada** — os documentos das seções 05/06/08 marcados como
   "GERADO AUTOMATICAMENTE" são produzidos por `npm run docs:gen`, lendo o
   próprio código. Nunca os edite à mão.
2. **Guardião no CI** — `npm run docs:check` (e o workflow
   [`.github/workflows/docs.yml`](../.github/workflows/docs.yml)) barra o merge
   quando a referência está defasada ou quando um módulo mudou sem atualizar o
   seu documento no Atlas.

A regra completa está em [`.kiro/steering/documentacao.md`](../.kiro/steering/documentacao.md).

### Convenção: cabeçalho de estado

Todo documento escrito à mão começa com um cabeçalho que diz o quão confiável
ele é:

```
> **Estado:** ✅ Em dia · **Responsável:** <papel/pessoa> ·
> **Última verificação:** AAAA-MM-DD · **Cobre:** `<caminhos de código>`
```

Estados possíveis: ✅ Em dia · 🟡 Rascunho/parcial · 🔴 A revisar.
