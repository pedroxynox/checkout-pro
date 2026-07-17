# Arquitetura — Check-out PRO

> Mapa técnico rápido. Snapshot funcional completo: `PROJECT_UNDERSTANDING.md`. Estado/pendientes: `.kiro/steering/estado-e-pendientes.md`. Atualizado: **16/07/2026**.

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

`ADMINISTRADOR`, `GERENTE`, `SUPERVISOR`, `FISCAL`, `IMPORTADOR`. Cadastro Unificado (`Colaborador`) é a fonte de pessoas; operadores não precisam de login.

## Módulos backend

| Grupo | Módulos/responsabilidade |
| --- | --- |
| Identidade | `acessos`, `usuarios`, `colaboradores` |
| Comercial | `arrecadacao`, `vendas`, `metas`, `fechamento` |
| Estoque | `insumos`, `requisicoes`, `lote-apae` |
| Rotinas | `checklist`, `alertas`, `notificacoes` |
| Pessoas | `operadores`, `fiscais`, `incidencias`, `advertencias`, `contratos`, `feedforward` |
| Jornada | `ponto`, `central-jornada`, `feriados`, `escala-domingo`, `ciclo-folha` |
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
1. Batida manual ou por leitor (OCR no APK) entra em `ponto`. A leitura da imagem no servidor está desativada: o Android lê no aparelho (ML Kit) e a web registra manualmente; o usuário sempre confirma antes de persistir.
2. `ponto.domain` classifica as batidas pela ordem e calcula a jornada (genérico sobre `RegrasContrato`; ver "Regras de jornada").
3. Batida e cron `* * * * *` avaliam etapas de TAC com dedupe PERSISTENTE (tabela `AlertaTacEnviado`, reserva atômica por índice único): sobrevive a reinícios e coordena instâncias.
4. Corrigir/excluir uma batida **recalcula** o alerta de TAC: se saiu de uma etapa já avisada, marca CORRIGIDO e libera para reavisar; um novo excesso depois vira REINCIDENTE. A trilha fica em `EventoAlertaTac` (endpoint `GET /ponto/alertas-tac/historico`).
5. `central-jornada` consolida o ciclo 26→25 para operador/supervisor/fiscal, sinaliza conflito ponto↔ausência e atraso, e expõe um painel de inconsistências (`GET /central-jornada/inconsistencias`) e a revisão do ciclo (`/exportacao`).
6. `feriados` altera carga e percentual de extras (feriado = domingo).
7. `ciclo-folha` fecha/reabre o ciclo (ver "Ciclo de folha").

Regras TAC:
- 1h30 risco; 1h40 risco alto; `>1h50` TAC.
- Intervalo `<1h` ou `>3h` também TAC.
- Destino: supervisão/gerência; falha de aviso nunca bloqueia o ponto.
- Dedupe é PERSISTENTE e diária (`AlertaTacEnviado`), com trilha de eventos (`EventoAlertaTac`).

### Regras de jornada (Relógio Ponto)
Parâmetros do contrato vigente 6x1–2x1 (`REGRAS_SEIS_X_UM_DOIS_X_UM` em `ponto.domain`; catálogo extensível em `contrato-regras.ts`). Carga base: 7h (seg–qui), 8h (sex–sáb), 7h20 (domingo/feriado).

- **Batidas por dia:** máximo 4 (a 5ª é recusada). O tipo é derivado da ordem, não editável à mão.
  - 1 batida: hoje = trabalhando; dia passado = incompleta (não acumula).
  - 2 batidas: até 4h50 = jornada válida sem intervalo (encerrada); acima = saída para intervalo (incompleta se não voltou).
  - 3 batidas: hoje = de volta do intervalo; dia passado = incompleta.
  - 4 batidas: jornada completa com intervalo.
- **Datas:** rejeita hora futura, fora do dia e anterior à data inicial do sistema. Cada jornada fica limitada ao dia; turnos que cruzam a meia-noite não são tratados.
- **Duplicados:** batidas iguais ou a menos de 2 min são recusadas; o registro é idempotente por `clienteId` (a fila offline reenvia sem duplicar).
- **Folga:** bloqueia bater ponto em dia de folga (folga fixa da semana ou domingo pelo rodízio de grupos).
- **Ausências:** cruza batidas com faltas/atestados; sinaliza conflito quando há ponto e ausência no mesmo dia.
- **Leitor (OCR):** a memória "nome lido → pessoa" é apoio, não confirmação: uma seleção isolada não substitui uma associação já aprendida (exige confirmações repetidas). A busca de pessoas para bater ponto inclui fiscais e operadores ativos.
- **Sem conexão:** a batida é guardada na fila offline do app e sincronizada ao reconectar, preservando a hora do comprovante e sem duplicar (idempotência por `clienteId`).

### Ciclo de folha (fechamento)
- `ciclo-folha` guarda o estado por ciclo (âncora no dia 26) e uma trilha (`CicloFolhaEvento`).
- Fechar (após revisão) bloqueia modificações ordinárias do período — batidas (registrar/corrigir/excluir), faltas/ausências (criar/justificar/remover) e débito. Erro 409 `CicloFechadoError`.
- Fechar/ver exige `CENTRAL_JORNADA`; reabrir exige autorização de administrador (`ADMIN_DADOS`). Cada fechamento/reabertura fica registrado (quem/quando). Como a apuração é sob demanda, reabrir já reflete as correções.

### Feriados/contrato
- Nacionais automáticos; estaduais/municipais manuais.
- Carnaval/Corpus Christi não automáticos.
- A API permite cadastrar e remover feriados manuais; correção exige remover e cadastrar novamente.
- Feriado = domingo: 7h20, extras 100%.
- `SEIS_X_UM_DOIS_X_UM` é o único tipo de contrato hoje e governa as regras de jornada. As regras vivem numa estrutura `RegrasContrato` (carga base, intervalos, limites de TAC); um novo contrato é adicionado no catálogo `contrato-regras.ts` sem duplicar o cálculo.
- O contrato de experiência é outro conceito: aplica-se a operadores ativos, dura até 90 dias, alerta nos 5 dias anteriores e efetiva no dia 91.
- O cron de experiência notifica hoje `FISCAL`, `SUPERVISOR`, `GERENTE` e `ADMINISTRADOR`.

### Notificações
1. `NotificacoesService.enviar` persiste a notificação.
2. Publica via WebSocket/in-app.
3. Se há token, chama Expo Push Service.
4. Falha push é capturada e não desfaz o fluxo principal.

Para Android fechado, FCM + APK recompilado continuam obrigatórios.

## Banco e migrations

- Prisma schema: `backend/prisma/schema.prisma`.
- Última migration: `9zx_ciclo_folha`.
- Próxima deve ordenar depois de `9zx` (o prefixo `9zu` foi usado por duas migrations — Check-Outs e eventos de TAC —, o que é inofensivo: o Prisma ordena pelo nome completo).
- Preferir migrations aditivas e compatíveis durante rolling deploy.
- `prisma migrate deploy` deve rodar no Pre-Deploy, não no Start Command.
- `reset-operacional` é função de negócio controlada; não substitui migration nem deve ser executada automaticamente em produção.

## Integrações e configuração

- Backend: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `JWT_EXPIRES_IN`, `HORARIO_FIM_DO_DIA`, `SENHA_INICIAL`, `RETENCAO_INATIVOS_MESES`.
- Mobile: `EXPO_PUBLIC_API_URL`.
- Android push: credenciais FCM no Expo/EAS.
- Render DB deve estar em plano persistente para operação real.

## Qualidade atual

- Backend: build OK; 76 suítes / 514 testes.
- Mobile: type-check + lint OK; 25 suítes / 97 testes.
- CI normaliza formatação via `eslint --fix`. Ver steering de estado.

## Áreas deliberadamente incompletas

- Alertas de Fila, Normativas e Indicador de Quebra: ocultas por `emBreve`.
- Normativas em escala: requerem RAG + pgvector + object storage.
- Multi-tenancy: parqueado (feriados por localização/unidade dependem disso).
- Push Android: backend pronto; falta FCM + novo APK.
- Retirada completa da tabela fiscal legada (`RegistroPontoFiscal`): a unificação com as batidas foi feita no cálculo de horas extras; a remoção total da tabela segue como follow-up.

## Checklist de mudança

1. Identificar regra fonte e perfis afetados.
2. Preservar separação controller/service/domain.
3. Atualizar espelhos de tipo/permissão backend↔mobile.
4. Se houver schema, criar migration posterior a `9zx` e validar em PostgreSQL.
5. Rodar build/tests/type-check/lint focalizado.
6. Revisar diff e atualizar docs canônicas.
7. Publicar por branch/PR; confirmar deploy separadamente.
