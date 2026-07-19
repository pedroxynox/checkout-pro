# Regra de Documentação (obrigatória)

Esta regra vale para **toda alteração** feita neste repositório — por qualquer
sessão do Kiro ou pessoa. Documentar faz parte da tarefa, não é um extra.

## Idioma

- **Toda a documentação é escrita em português padrão (profissional).**
- A conversa direta com o dono do projeto é em espanhol; os documentos, não.

## Onde a documentação mora

Tudo em `docs/`, organizado por seções numeradas. O mapa completo está em
[`docs/README.md`](../../docs/README.md). Resumo:

- `docs/00-visao-geral/` · `docs/01-produto/` · `docs/02-arquitetura/`
- `docs/03-atlas-backend/` — 1 documento por módulo do backend
- `docs/04-atlas-mobile/` — 1 documento por área de tela do app
- `docs/05-referencia-dados/` · `docs/06-qualidade/` · `docs/07-operacao/` · `docs/08-gestao/`

## O que fazer ao mudar código

1. **Se mudou um módulo do backend** (`backend/src/<modulo>/`), atualize
   `docs/03-atlas-backend/<modulo>.md` no mesmo conjunto de alterações.
2. **Se mudou uma área do app** (`mobile/src/screens/<area>/`), atualize
   `docs/04-atlas-mobile/<area>.md`.
3. **Se mudou rotas, tabelas (Prisma), migrações ou testes**, rode
   `npm run docs:gen` e faça commit dos documentos de referência regenerados.
4. **Se tomou uma decisão de arquitetura relevante**, adicione um ADR em
   `docs/02-arquitetura/decisoes/`.
5. **Nunca** edite à mão os arquivos marcados com o aviso
   "GERADO AUTOMATICAMENTE" — eles são reescritos por `npm run docs:gen`.

## Números e métricas

- A **fonte única** de números (linhas, testes, rotas, tabelas, migrações) é
  `docs/08-gestao/estado-e-metricas.md`, gerado automaticamente.
- Nenhum outro documento deve repetir esses números; deve apontar para lá.

## Garantia automática

O guardião (`npm run docs:check`, também rodando no CI em
`.github/workflows/docs.yml`) barra o merge quando:

- a documentação de referência está defasada em relação ao código; ou
- um módulo/área mudou e o documento do Atlas correspondente não foi atualizado.

Escape de emergência (usar só em casos justificados): incluir `[skip-docs]` na
mensagem do último commit.
