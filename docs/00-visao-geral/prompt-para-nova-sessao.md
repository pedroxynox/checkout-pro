> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** prompt de abertura para novas sessões do Kiro

# Prompt para uma nova sessão do Kiro

Este documento guarda o **prompt de abertura** a ser colado no início de qualquer
sessão nova do Kiro (ou de outra IA/pessoa) que for **mexer no código**. Ele faz
a sessão entender o projeto pela documentação e seguir as regras — sem precisar
ler os 122 documentos um a um (a documentação é em camadas: primeiro o mapa,
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
