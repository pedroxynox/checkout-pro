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
- Login por **matrícula** + senha (JWT). Ex.: gerente `232152`.
- Perfis: `GERENTE` | `SUPERVISOR` | `FISCAL` (`backend/src/acessos/acessos.domain.ts`).
- Autorização por **funcionalidade**: decorator `@Funcionalidade('X')` + `PerfilGuard`
  (método sobrepõe classe via `getAllAndOverride`). No mobile, `funcionalidades.ts`
  + `useAuth().podeAcessar(...)` controla o que aparece.

## Módulos principais do backend (`backend/src/*`)
- `acessos` — login, identidade, mapa de permissões por perfil.
- `usuarios` — CRUD de pessoas (gerente).
- `arrecadacao` — **indicadores** a partir de arquivos .txt (ver fluxo abaixo).
- `vendas` — **vendas por hora** a partir de .txt (ver fluxo abaixo).
- `indicadores` — fluxo ANTIGO (cálculo de %/cor, rankings, registro manual de
  venda). Endpoints existem, mas a UI atual NÃO os usa. Mantido por compat.
- `importacoes` — fluxo ANTIGO de importação CSV/XLSX. Idem: não usado pela UI.
- `fiscais` — status dos fiscais (gateway WebSocket) e **escala** de trabalho.
- `insumos`, `lote-apae`, `checklist`, `operadores`, `notificacoes`.

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

## Banco de dados
- Prisma (`backend/prisma/schema.prisma`). Migrações numeradas em
  `backend/prisma/migrations/`. No deploy roda `prisma migrate deploy` + seed.
- Só guardamos dados essenciais (não os arquivos .txt).

## Verificação (rodar antes de qualquer push)
- Backend: `npm run build` + `npm test` (159 testes) + `npm run lint`.
- Mobile: `npm run type-check` + `npm run lint` + `npm test` + `npx expo export --platform web`.
- Banco: `npx prisma validate` + `npx prisma generate` (gerar o client ANTES do build).

## Convenções
- Mensagens de UI em **português**; conversa com o usuário em **espanhol**.
- Commits descritivos em português.
- Push direto na `main` (autorizado); Render redeploya automaticamente.
- TAREFA PENDENTE: push real de dispositivo (Expo push tokens) para o aviso de
  "Fechamento concluído" aos gerentes — só funciona no APK, a fazer no próximo APK.
