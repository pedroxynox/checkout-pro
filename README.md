# Gestão de Frente de Caixa — Stok Center

Aplicativo de gestão de frente de caixa do supermercado **Stok Center**, voltado ao
gerente e aos fiscais de frente de caixa. Centraliza sete módulos funcionais:
importações de arquivos diários, indicadores e metas (KPIs), controle de insumos,
monitoramento de fiscais em tempo real com escala, checklists de abertura/fechamento,
cadastro de operadores e ausências, e acessos/perfis com notificações.

Todo o produto é escrito em Português do Brasil.

## Layout do monorepo

Este repositório é um monorepo gerenciado por **npm workspaces**:

```
.
├── backend/   # API NestJS (Node.js + TypeScript) — domínio, REST, WebSocket, cron
└── mobile/    # Aplicativo móvel React Native + Expo (a ser construído na Task 17)
```

### `backend/`

API construída com **NestJS**, **TypeScript**, **Prisma/PostgreSQL** (tarefas futuras),
com validação global de DTOs via `class-validator`, configuração de ambiente via
`@nestjs/config`, testes com **Jest** e testes de propriedade com **fast-check**.

### `mobile/`

Aplicativo **React Native + Expo**. Atualmente é um placeholder; a fundação do app
será implementada na Task 17 do plano de implementação.

## Scripts (raiz)

| Comando | Descrição |
| --- | --- |
| `npm run build` | Compila o backend |
| `npm run start` | Inicia o backend |
| `npm run lint`  | Lint do backend |
| `npm run test`  | Executa os testes do backend |

> Os comandos da raiz delegam para o workspace `backend`. Veja `backend/package.json`
> para os scripts específicos (incluindo `start:dev` e `test:watch`).

## Especificação

A especificação completa (requisitos, design e plano de tarefas) está em
`.kiro/specs/gestao-frente-de-caixa/`.
