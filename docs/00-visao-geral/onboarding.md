> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** primeiros passos de quem entra no projeto

# Onboarding — seus primeiros 30 minutos

Bem-vindo(a) ao **Check-out PRO**. Este guia leva você do zero ao "entendi o
projeto e consigo rodá-lo" em cerca de 30 minutos. Siga na ordem; cada bloco tem
um tempo estimado e um resultado esperado.

> Antes de começar, tenha em mãos: **Node.js 18+** e um **PostgreSQL** acessível
> (local ou em contêiner). Termos desconhecidos? Deixe o [Glossário](glossario.md)
> aberto numa aba.

---

## Minuto 0–5 · Entenda o que é o projeto

- Leia o [Resumo executivo](resumo-executivo.md) — o que o sistema faz e para
  quem, em linguagem de negócio.
- Passe os olhos no [Mapa do projeto](mapa-do-projeto.md) — como **App ↔ Backend
  ↔ Banco** se conectam.

**Resultado esperado:** você consegue explicar, em uma frase, o que o Check-out
PRO faz e quais são suas três peças.

## Minuto 5–12 · Entenda a arquitetura

- Leia a [Visão de arquitetura](../02-arquitetura/visao-geral.md) e o mapa
  técnico rápido em [`.kiro/steering/arquitetura.md`](../../.kiro/steering/arquitetura.md).
- Fixe o padrão do backend: **controller → service → domain/Prisma**, com as
  regras puras isoladas em `*.domain.ts`.

**Resultado esperado:** você sabe onde procurar uma regra de negócio (no
`*.domain.ts` do módulo) e onde ficam as rotas (no `*.controller.ts`).

## Minuto 12–22 · Rode o projeto localmente

Siga o passo a passo completo em
[Instalação local](../07-operacao/instalacao-local.md). Em resumo:

```bash
# na raiz do repositório
npm install

# backend
cd backend
cp .env.example .env          # ajuste DATABASE_URL e JWT_SECRET
npm run prisma:generate
npm run prisma:migrate
npm run seed
npm run start:dev

# em outro terminal — app (web/mobile)
cd mobile
EXPO_PUBLIC_API_URL=http://localhost:3000 npm run start
```

**Resultado esperado:** a API sobe (confira `/health` e `/health/ready`) e o app
abre no navegador, permitindo o login com o usuário criado pelo seed.

## Minuto 22–30 · Navegue pelo Atlas e faça sua primeira leitura profunda

O **Atlas** é a documentação fina, um documento por módulo/tela:

- [Atlas do backend](../03-atlas-backend/) — um documento por módulo do backend.
- [Atlas do mobile](../04-atlas-mobile/) — um documento por área de tela do app.

Escolha um módulo pequeno para "furar o poço" e entender o padrão de ponta a
ponta. Sugestão: [`ponto`](../03-atlas-backend/ponto.md) (regras de jornada e
TAC) e a tela [`ponto`](../04-atlas-mobile/ponto.md) correspondente.

**Resultado esperado:** você consegue seguir uma funcionalidade da tela até a
rota, o service, o domínio e a tabela.

---

## Checklist prático dos primeiros 30 minutos

- [ ] Li o [Resumo executivo](resumo-executivo.md) e sei o que o produto faz.
- [ ] Vi o [Mapa do projeto](mapa-do-projeto.md) e entendi App ↔ Backend ↔ Banco.
- [ ] Li a [Visão de arquitetura](../02-arquitetura/visao-geral.md) e reconheço o padrão controller → service → domain.
- [ ] Deixei o [Glossário](glossario.md) por perto para as siglas (TAC, ciclo 26→25, arrecadação…).
- [ ] Instalei as dependências (`npm install` na raiz).
- [ ] Configurei o `.env` do backend (`DATABASE_URL`, `JWT_SECRET`).
- [ ] Rodei `prisma:generate`, `prisma:migrate` e `seed`.
- [ ] Subi a API (`npm run start:dev`) e conferi `/health/ready`.
- [ ] Subi o app apontando `EXPO_PUBLIC_API_URL` para a API local.
- [ ] Fiz login e naveguei por uma ou duas telas.
- [ ] Escolhi um módulo no [Atlas do backend](../03-atlas-backend/) e li do controller ao domínio.

---

## Como manter a documentação em dia

Documentar faz parte da tarefa. As regras estão em
[`.kiro/steering/documentacao.md`](../../.kiro/steering/documentacao.md). Em resumo:

- Mudou um módulo do backend? Atualize o `docs/03-atlas-backend/<modulo>.md`.
- Mudou uma área do app? Atualize o `docs/04-atlas-mobile/<area>.md`.
- Mudou rotas, tabelas, migrações ou testes? Rode `npm run docs:gen` (nunca edite
  à mão os arquivos marcados como "GERADO AUTOMATICAMENTE").
- O guardião no CI barra o merge quando a documentação fica defasada.

---

## Próximos passos depois do onboarding

| Se você vai trabalhar com… | Comece por |
|---|---|
| Testes/qualidade | [Estratégia de testes](../06-qualidade/estrategia-de-testes.md) |
| Operação/deploy | [Checklist de produção](../07-operacao/checklist-producao.md) |
| Prioridades do produto | [Roadmap e pendências](../08-gestao/roadmap-e-pendencias.md) |
| Dados e API | [Modelo de dados](../05-referencia-dados/modelo-de-dados.md) · [API HTTP](../05-referencia-dados/api-http.md) |
