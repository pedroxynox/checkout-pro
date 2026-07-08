# Arquitetura — Check-out PRO (Check-out PRO)

Guia rápido para humanos e IA entenderem o projeto sem reler tudo.

## Visão geral
App de gestão de frente de caixa de supermercado. Monorepo:
- `backend/` — NestJS + Prisma + PostgreSQL (API REST).
- `mobile/` — React Native + Expo (roda como app Android e como **web** estática).

Deploy (Render):
- API: `https://checkout-pro-api.onrender.com`
- Web: `https://checkout-pro-web.onrender.com`
- O `mobile` usa `EXPO_PUBLIC_API_URL` para falar com a API.

## Autenticação e perfis
- Login por **matrícula** + senha (JWT). Ex.: gerente `232152`. Senha mínima: **6**.
- Perfis: `GERENTE_DESENVOLVEDOR` (acesso total) | `GERENTE` | `SUPERVISOR` |
  `FISCAL` | `IMPORTADOR` (só *Importações*) — `backend/src/acessos/acessos.domain.ts`.
- Autorização por **funcionalidade**: decorator `@Funcionalidade('X')` + `PerfilGuard`
  (método sobrepõe classe via `getAllAndOverride`). No mobile, `funcionalidades.ts`
  + `useAuth().podeAcessar(...)` controla o que aparece.
- **Cadastro Unificado de Colaboradores** é a fonte única de pessoas. O login do
  app é criado no próprio cadastro do colaborador quando a função é
  fiscal/supervisor/gestor; **operadores não têm acesso ao app**.

## Módulos principais do backend (`backend/src/*`)
- `acessos` — login, identidade, mapa de permissões por perfil.
- `usuarios` — CRUD de logins/acessos do app.
- `colaboradores` — **Cadastro Unificado** (fonte única de pessoas): cadastro/
  edição com unicidade de matrícula/login, criação do login no cadastro,
  `resolverColaboradorId` (matrícula/login) e **perfil inteligente**
  (`perfil-colaborador.*`).
- `arrecadacao` — **indicadores** a partir de arquivos .txt (ver fluxo abaixo).
- `vendas` — **vendas por hora** a partir de .txt (ver fluxo abaixo).
- `metas` — metas mensais por indicador (`MetaMensal`), exibidas no Centro de
  Controle ▸ Metas (vendas, cancelamentos, recargas, devoluções, Sacolas APAE).
- `incidencias` — incidências de escala / sanções (domínio puro genérico por
  `tipo`, ADR 0007): linha do tempo unificada (faltas + incidências), ranking e
  analítica de risco. Rota `escala/incidencias`.
- `advertencias` — solicitações de advertência (ex.: falta não justificada);
  cron com janela retroativa. Rota `advertencias`.
- `contratos` — contrato de experiência (45+45). Estado SEMPRE derivado de
  `dataAdmissao` + decisões (ADR 0008); domínio puro testado. Rota `contratos`.
- `data-inicial` — `Data_Inicial_Sistema` (config global singleton). Rota
  `config/data-inicial`.
- `reset-operacional` — plano de reinício administrativo (apagar/zerar dados
  operacionais). Rota `admin/reset-operacional`.
- Os fluxos ANTIGOS `indicadores`/`importacoes` (CSV/XLSX) foram REMOVIDOS. A
  única função viva (`parseValor`) foi movida para `common/numeros.ts` (usada
  pelos parsers de `arrecadacao` e `vendas`).
- `fiscais` — status dos fiscais (gateway WebSocket) e **escala** de trabalho
  (a escala do fiscal vem do cadastro do colaborador — Opção A).
- `operadores` — Quadro de Operadores (escala + ausências). A **escala lê de
  `Colaborador`** (funcao OPERADOR); o model `OperadorTurno` está `[DEPRECADO]`
  (não é mais lido nem escrito).
- `insumos`, `lote-apae`, `checklist`, `notificacoes`.

## Fluxo 1 — Indicadores (arrecadação por operador)
Arquivos .txt que o fiscal sobe em "Importações" alimentam os indicadores.
- Tipos (`arrecadacao.domain.ts` / mobile `rotulos.ts` `ARRECADACAO`):
  TROCO_SOLIDARIO, RECARGAS_CELULAR (meta FIXA R$2000),
  CANCELAMENTO_ITENS (0,75%), CANCELAMENTO_CUPOM (0,5%), DEVOLUCOES (0,05%) — os
  três últimos são % sobre as **vendas**.
- Parser (`arrecadacao.parser.ts`): lê por cabeçalho (cada tipo tem layout
  próprio). Importa NOME + VALOR; CANCELAMENTO_ITENS tem QTD; CANCELAMENTO_CUPOM
  tem "autorizado por" + "motivo"; DEVOLUCOES extrai o nome do fiscal de
  "MATRICULA - NOME". Valor em vírgula decimal.
- Modelo `RegistroArrecadacao`. Endpoints: `/arrecadacao/upload|resumo|ranking|
  detalhes|status`.
- Mobile: `IndicadoresScreen` (menu) → `IndicadorDetalheScreen` (totais, meta,
  gráficos de barras, **pizza interativa**, ranking, detalhe do cupom).

## Fluxo 2 — Vendas por hora (Painel de Vendas)
- Arquivo .txt diário (relatório com muitas colunas). Parser
  (`vendas.parser.ts`) extrai a HORA da coluna "Empresa : Hora" e o valor da
  coluna **"Valor Total Liq"** (venda LÍQUIDA); ignora a linha de TOTAL.
- Modelo `VendaHora` (hora+valor por dia). No upload, o serviço também grava o
  total do dia em **`VendaDiaria`** — que é a fonte usada pelos % dos
  indicadores (acoplamento importante).
- Regras: qualquer perfil envia; após enviado, só o GERENTE reenvia (checado no
  backend, controller `vendas`). Não há ajuste manual.
- Endpoints: `/vendas/upload|resumo|por-hora|status|limpar-sem-hora`.
- Mobile: `PainelVendasScreen` (status, totais dia/semana/mês, período
  dia/semana/mês/personalizado, barras por hora, pizza das horas que mais
  venderam — valor no Dia, % na Semana/Mês).

## Gráficos (mobile)
`mobile/src/components/Graficos.tsx`: `GraficoPizza` (rosca interativa — toque
na fatia mostra rótulo/valor/% no centro; toque no centro limpa) e
`GraficoBarrasVerticais`. `montarFatias()` agrupa o excedente em "Outros".

## Notificações
`NotificacoesService.enviar()` cria registros in-app (campos canalPush/InApp são
apenas marcadores — NÃO há push real de dispositivo ainda). Ao completar os 5
arquivos de indicadores do dia, `ArrecadacaoService` notifica os gerentes
("Fechamento concluído").

## Centro de Controle (mobile)
Área administrativa (gestor) que concentra a configuração que antes ficava
espalhada. Cards atuais:
- **Acesso** — pessoas com login no app (antiga "Pessoas e Acessos"). Os
  acessos são criados no cadastro do colaborador.
- **Metas** — metas mensais por indicador (vendas, cancelamento de itens/cupom,
  recargas, devoluções) e **Sacolas APAE** (preço da sacola + meta mensal).
- **Insumos** — botões de zerar estoque de consumo e limpar histórico de
  requisições.
- **Importações** — saiu da Home (fica só para o perfil IMPORTADOR) e passou
  para cá.
A antiga seção "Gerenciar dados" deixou de existir (seus botões foram
distribuídos nos cards acima e em Sacolas APAE).

## Banco de dados
- Prisma (`backend/prisma/schema.prisma`). Migrações numeradas em
  `backend/prisma/migrations/`. No deploy roda `prisma migrate deploy` + seed.
  A última migração é `9zf_colaborador_desligado_em`; nomear a próxima para
  ordenar DEPOIS dela.
- Só guardamos dados essenciais (não os arquivos .txt).
- **Purga mensal de inativos** (`colaboradores/purga-inativos.service.ts`, cron
  dia 1º 00:00 Brasília): apaga ficha + histórico de RRHH dos colaboradores
  desligados há mais de `RETENCAO_INATIVOS_MESES` meses (env, padrão 12) —
  janela de retenção que protege o histórico disciplinar/trabalhista recente.
  `Colaborador.desligadoEm` marca a data de baixa. Preserva os totais de
  arrecadação e do lote APAE.

## Verificação (rodar antes de qualquer push)
- Backend: `npm run build` + `npm test` (152 testes) + `npm run lint`.
- Mobile: `npm run type-check` + `npm run lint` + `npm test` + `npx expo export --platform web`.
- Banco: `npx prisma validate` + `npx prisma generate` (gerar o client ANTES do build).

## Convenções
- Mensagens de UI em **português**; conversa com o usuário em **espanhol**.
- Commits descritivos em português.
- Push direto na `main` (autorizado); Render redeploya automaticamente.
- TAREFA PENDENTE: push real de dispositivo (Expo push tokens) para o aviso de
  "Fechamento concluído" aos gerentes — só funciona no APK, a fazer no próximo APK.
