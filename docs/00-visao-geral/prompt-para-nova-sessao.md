> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-10-27 · **Cobre:** prompt de abertura para novas sessões do Kiro e skills instaladas (`.kiro/skills/`)

# Prompt para uma nova sessão do Kiro

Este documento guarda o **prompt de abertura** a ser colado no início de qualquer
sessão nova do Kiro (ou de outra IA/pessoa) que for **mexer no código**. Ele faz
a sessão entender o projeto pela documentação e seguir as regras — sem precisar
ler todos os documentos um a um (a documentação é em camadas: primeiro o mapa,
depois o detalhe do que se vai tocar).

> A regra completa que a sessão deve seguir vive em
> [`.kiro/steering/documentacao.md`](../../.kiro/steering/documentacao.md) e é
> lida automaticamente pelo Kiro. O prompt abaixo apenas **reforça** e orienta a
> leitura.

---

## Prompt completo (copiar e colar)

```text
Vais trabalhar no projeto checkout-pro (monorepo: backend NestJS + app Expo/React Native).

1. Antes de mexer em qualquer coisa, entende o projeto lendo a documentação nesta ordem:
   - docs/README.md (índice mestre)
   - docs/00-visao-geral/resumo-executivo.md e docs/00-visao-geral/mapa-do-projeto.md
   - docs/02-arquitetura/visao-geral.md
   - E, conforme o que fores modificar, o documento do atlas correspondente:
     docs/03-atlas-backend/<módulo>.md (backend) ou docs/04-atlas-mobile/<área>.md (app).

2. Segue OBRIGATORIAMENTE a regra de documentação em .kiro/steering/documentacao.md:
   - Se mudares um módulo do backend, atualiza o seu docs/03-atlas-backend/<módulo>.md.
   - Se mudares uma tela do app, atualiza o seu docs/04-atlas-mobile/<área>.md.
   - Se mudares rotas, tabelas, migrações ou testes, roda `npm run docs:gen` e commita a referência.
   - Nunca edites à mão os arquivos marcados como "GERADO AUTOMATICAMENTE".
   - Antes de terminar, roda `npm run docs:check` e garante que passa.

3. Idioma: toda a documentação em português padrão (profissional). Fala comigo em espanhol.

4. Forma de trabalhar: trabalha numa branch nova e abre um Pull Request; não publiques
   direto na main. Não sacrifiques qualidade por velocidade: primeiro entende, depois
   planeja, depois implementa e verifica.

No final, me dá um resumo curto: o que entendeste, o que fizeste, o que atualizaste na
documentação e qual é o próximo passo.
```

---

## Versão curta (quando já se confia no fluxo)

```text
Lê docs/00-visao-geral/prompt-para-nova-sessao.md e segue as regras de .kiro/steering/documentacao.md.
Documentação em português; fala comigo em espanhol; trabalha em branch + PR; roda `npm run docs:check` antes de terminar.
```

---

## Observações

- **Perguntas/exploração (sem mudar código):** pode pular o PR e o `docs:check`.
- **Reforço, não obrigação:** o Kiro já lê `.kiro/steering/` sozinho; repetir no
  prompt apenas dá segurança extra.
- **Ao receber o Pull Request:** confira que o check **"Guardião da Documentação"**
  está verde antes de aprovar.

---

## Skills instaladas

O repositório traz skills de terceiros, no padrão aberto
[Agent Skills](https://agentskills.io), em `.kiro/skills/`. O Kiro (IDE, CLI e
Web) lê os nomes e descrições no início de cada sessão e ativa a skill que
combina com o pedido; no IDE e no CLI, também dá para chamá-la por `/<nome>`. As
regras de uso ficam em [`.kiro/steering/skills.md`](../../.kiro/steering/skills.md).

| Pacote | Pastas em `.kiro/skills/` | Origem (commit) | Licença |
|---|---|---|---|
| Caveman 4.0.1 | `caveman`, `ultracave`, `megacave`, `caveman-commit`, `caveman-review`, `caveman-help` | [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) `9b68f7e` | Apache-2.0 |
| Humanizer 3.1.0 | `humanizer` | [blader/humanizer](https://github.com/blader/humanizer) `8c307f3` | MIT |
| Superpowers 7.0.1 | as 15 pastas de `skills/` (`brainstorming`, `writing-plans`, `systematic-debugging`, `test-driven-development`…) | [obra/superpowers](https://github.com/obra/superpowers) `2ce8aa1` | MIT |
| Emil Kowalski | as 15 pastas de `skills/` (`emil-design-eng`, `animate`, `animate-expo`, `review-animations`…) | [emilkowalski/skills](https://github.com/emilkowalski/skills) `2d22863` | MIT |
| Impeccable 4.8.0 | `impeccable` (build própria do upstream para o Kiro: `.kiro/skills/impeccable`) | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) `d34c87e` | Apache-2.0 |
| Taste Skill 2.1.5 | `design-taste-frontend` (no upstream, pasta `skills/taste-skill`; o Kiro exige pasta igual ao nome) | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) `12af471` | MIT |

Cada pasta é cópia fiel do upstream, acrescida apenas dos arquivos de licença do
pacote (`LICENSE` e, quando o upstream os tem, `NOTICE`/`NOTICE.md` e
`LICENSE-MIT`).

**Ficaram de fora (Caveman):** `caveman-compress` (envia o arquivo à API de um
modelo, com chave própria), `caveman-stats` e `cavecrew` (feitos para o Claude
Code), as skills do proxy/Caveman Cloud e os padrões de trabalho
(`investigate-first`, `lean-build`, `surgical-patch`, `safe-refactor`,
`migration`, `verify-and-stop`), que se sobrepõem às skills de processo do
Superpowers e disputariam a ativação.

**Pontos de atenção**

- O Kiro não lê o campo `disable-model-invocation`: `ultracave`, `megacave`,
  `pick-ui-library`, `prototype` e `review-animations` podem ser ativadas sem `/`.
- `impeccable`: na primeira execução, baixa do GitHub o motor (binário conferido
  por checksum) para `~/.impeccable/bin/`. Ao iniciar um design novo, sempre
  consulta a API de impeccable.style e, salvo opt-out, registra as escolhas de
  forma anônima (`DO_NOT_TRACK=1` ou `"telemetry": false` em
  `.impeccable/config.json` desligam o registro).
- `design-taste-frontend`: os scripts exigem Node 22+ e Chrome/Chromium; a busca
  de imagens usa a internet.
- `brainstorming` (companheiro visual): carrega o logotipo do Superpowers de
  primeradiant.com (desligar com `SUPERPOWERS_DISABLE_TELEMETRY=1`).

**Atualizar ou remover:** copie de novo a pasta do repositório de origem (no
Impeccable, a pasta `.kiro/skills/impeccable`), mantendo o nome da pasta acima e
os arquivos de licença; atualize o commit nesta tabela e abra um PR. Para remover uma skill, apague a pasta. Skills pessoais, válidas em
todos os repositórios, são cadastradas no Kiro Web em **Agent Config > Skills**.
