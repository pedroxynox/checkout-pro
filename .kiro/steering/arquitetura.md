# Arquitetura — Check-out PRO

> Mapa técnico rápido. Snapshot funcional completo: `PROJECT_UNDERSTANDING.md`. Estado/pendientes: `.kiro/steering/estado-e-pendientes.md`. Atualizado: **15/07/2026**.

## Visão geral

Monorepo npm workspaces:

```text
mobile/  Expo SDK 52 + React Native 0.76 + web estática
   │     REST/JWT + Socket.IO
backend/ NestJS 10 + Prisma 5 + cron
   │
   ├── PostgreSQL
   ├── Google Gemini
   └── Expo Push Service (Android exige FCM no projeto EAS)
```

Deploy conhecido: API e web no Render. Código mergeado não equivale a deploy confirmado; validar logs e `/health/ready`.

## Padrões obrigatórios

### Backend
- `controller`: HTTP, DTO e autorização.
- `service`: orquestração, transação, Prisma e integrações.
- `domain`: lógica pura/determinística; usar testes de propriedade quando adequado.
- Erros estendem a base de domínio e carregam status HTTP.
- Autorização: `@Funcionalidade(...)` + `PerfilGuard`.
- Funcionalidades: fonte em `backend/src/acessos/acessos.domain.ts`; mobile mantém espelho.
- Notificações externas são best-effort quando não fazem parte da transação principal.

### Mobile
- `api/services`: rede; `api/types`: contratos espelhados.
- `auth`: sessão e permissões.
- `navigation`: rotas e allowlist de áreas.
- `screens`: composição de fluxo; `components`: UI reutilizável.
- `offline`: SQLite/fila; `utils/dialogos.ts`: diálogos compatíveis com web.

## Perfis

`GERENTE_DESENVOLVEDOR`, `GERENTE`, `SUPERVISOR`, `FISCAL`, `IMPORTADOR`. Cadastro Unificado (`Colaborador`) é a fonte de pessoas; operadores não precisam de login.

## Módulos backend

| Grupo | Módulos/responsabilidade |
| --- | --- |
| Identidade | `acessos`, `usuarios`, `colaboradores` |
| Comercial | `arrecadacao`, `vendas`, `metas`, `fechamento` |
| Estoque | `insumos`, `requisicoes`, `lote-apae` |
| Rotinas | `checklist`, `alertas`, `notificacoes` |
| Pessoas | `operadores`, `fiscais`, `incidencias`, `advertencias`, `contratos`, `feedforward` |
| Jornada | `ponto`, `central-jornada`, `feriados`, `escala-domingo` |
| Administração | `data-inicial`, `reset-operacional` |
| IA/infra | `assistente`, `common`, `config`, `prisma`, `storage` |

## Fluxos principais

### Importação → indicadores/fechamento
1. App envia `.txt` a `arrecadacao` ou `vendas`.
2. Parser valida e normaliza; serviços persistem apenas dados essenciais.
3. `VendaHora` alimenta painel e total em `VendaDiaria`.
4. Indicadores atribuem por identificadores de `Colaborador`; desconhecidos continuam no total.
5. `fechamento` agrega cinco arrecadações + vendas + checklists e conclui de forma idempotente.

### Ponto → alertas → Central de Jornada
1. Batida manual ou OCR entra em `ponto`.
2. OCR sugere; usuário confirma antes de persistir.
3. `ponto.domain` classifica batidas e calcula jornada.
4. Batida e cron `* * * * *` avaliam etapas TAC com dedupe compartilhado em memória.
5. `central-jornada` consolida ciclo 26→25 para operador/supervisor/fiscal.
6. `feriados` altera carga e percentual de extras.

Regras TAC:
- 1h30 risco; 1h40 risco alto; `>1h50` TAC.
- Intervalo `<1h` ou `>3h` também TAC.
- Destino: supervisão/gerência; falha de aviso não bloqueia ponto.
- Dedupe não persiste entre reinícios.

### Feriados/contrato
- Nacionais automáticos; estaduais/municipais manuais.
- Carnaval/Corpus Christi não automáticos.
- A API permite cadastrar e remover feriados manuais; correção exige remover e cadastrar novamente.
- Feriado = domingo: 7h20, extras 100%.
- `SEIS_X_UM_DOIS_X_UM` é o tipo de contrato que governa as regras de jornada.
- O contrato de experiência é outro conceito: aplica-se a operadores ativos, dura até 90 dias, alerta nos 5 dias anteriores e efetiva no dia 91.
- O cron de experiência notifica hoje `FISCAL`, `SUPERVISOR`, `GERENTE` e `GERENTE_DESENVOLVEDOR`.

### Notificações
1. `NotificacoesService.enviar` persiste a notificação.
2. Publica via WebSocket/in-app.
3. Se há token, chama Expo Push Service.
4. Falha push é capturada e não desfaz o fluxo principal.

Para Android fechado, FCM + APK recompilado continuam obrigatórios.

## Banco e migrations

- Prisma schema: `backend/prisma/schema.prisma`.
- Última migration: `9zp_tipo_contrato_colaborador`.
- Próxima deve ordenar depois de `9zp`.
- Preferir migrations aditivas e compatíveis durante rolling deploy.
- `prisma migrate deploy` deve rodar no Pre-Deploy, não no Start Command.
- `reset-operacional` é função de negócio controlada; não substitui migration nem deve ser executada automaticamente em produção.

## Integrações e configuração

- Backend: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `JWT_EXPIRES_IN`, `HORARIO_FIM_DO_DIA`, `SENHA_INICIAL`, `RETENCAO_INATIVOS_MESES`.
- Mobile: `EXPO_PUBLIC_API_URL`.
- Android push: credenciais FCM no Expo/EAS.
- Render DB deve estar em plano persistente para operação real.

## Qualidade atual

- Backend: build OK; 71 suítes / 406 testes.
- Mobile: type-check + lint OK; 23 suítes / 85 testes.
- Últimos arquivos TAC: ESLint OK.
- Prettier: quatro arquivos legados já formatados em PR isolado. Dívida residual: 9 arquivos de domínio marcados pelo Prettier 3.9.5 por deriva de versão; CI normaliza via `eslint --fix`. Ver steering de estado.

## Áreas deliberadamente incompletas

- Alertas de Fila, Normativas e Indicador de Quebra: ocultas por `emBreve`.
- Normativas em escala: requerem RAG + pgvector + object storage.
- Multi-tenancy: parqueado.
- Dedupe TAC persistente: opcional/futuro.
- Push Android: backend pronto; falta FCM + novo APK.

## Checklist de mudança

1. Identificar regra fonte e perfis afetados.
2. Preservar separação controller/service/domain.
3. Atualizar espelhos de tipo/permissão backend↔mobile.
4. Se houver schema, criar migration posterior a `9zp` e validar em PostgreSQL.
5. Rodar build/tests/type-check/lint focalizado.
6. Revisar diff e atualizar docs canônicas.
7. Publicar por branch/PR; confirmar deploy separadamente.
