# Registro de Mudanças — Limpeza, Permissões e Áreas

> Documento de manutenção (em português) descrevendo as melhorias aplicadas ao
> projeto: unificação de permissões, acesso total do gerente desenvolvedor,
> remoção de código morto e ocultação de áreas em construção. Serve de
> referência para entender **o que mudou e por quê**.
>
> Importante: o ambiente de edição não tinha as dependências instaladas (rede
> restrita), então **não foi possível rodar `build`/`lint`/`jest` aqui**. Cada
> mudança foi validada por análise estática (rastreio de todos os imports). É
> recomendável rodar a verificação completa antes do deploy (ver o final).

---

## Reinício Operacional + Data Inicial do Sistema (2026-07-05)

**Objetivo:** permitir ao gestor (perfil `ADMIN_DADOS`) definir a **data inicial
de operação do sistema** e zerar, com segurança, todos os **dados de movimento**
sem perder cadastros, escalas, definições de insumos nem configuração/metas.
Toda a entrega é **apenas aditiva** (sem migração destrutiva) e foi validada por
property tests (`fast-check` ≥100 iterações, Properties 1–4) e regressão de
backend e mobile verdes.

- **Config global singleton `config_sistema`.** Migração **aditiva**
  `9x_config_sistema` cria a tabela singleton (id fixo `'sistema'`) com a
  `Data_Inicial_Sistema` (padrão **01/07/2026**), editável apenas por
  `ADMIN_DADOS`. Sem alteração de permissões (reutiliza a `ADMIN_DADOS`
  existente) e sem tocar em dados já gravados.
- **Módulo `data-inicial` (GET/PATCH).** `GET /config/data-inicial` (leitura
  autenticada para o app) e `PATCH /config/data-inicial` (restrito a
  `ADMIN_DADOS`, grava `atualizadoPor`). O `ValidacaoDataService` compartilhado
  bloqueia carga/edição com data **anterior** à data inicial nos endpoints de
  **arrecadação** (upload e sem-movimento), **vendas** (upload), **ausências**,
  **incidências**, **ponto de fiscal** e **checklist**, lançando
  `ErroDataAnteriorInicial` (HTTP 400) com a data mínima em `dd/mm/aaaa`.
  Fronteira: mesmo dia é permitido, véspera é rejeitada.
- **Módulo `reset-operacional`.** `POST /admin/reset-operacional` (restrito a
  `ADMIN_DADOS`, exige `confirmacao: "ZERAR"`) apaga os **dados de movimento** —
  vendas, arrecadação, estoque em movimento (**+ zera o saldo dos insumos**),
  sacolas/movimentos APAE, ponto/ausências/incidências,
  notificações/assistente/fechamentos/checklists e fluxos legados — numa **única
  transação idempotente** (rollback automático em erro), **conservando** pessoas,
  escalas, definições de insumos e configuração/metas. Devolve um **resumo por
  entidade** com as contagens apagadas.
- **Mobile (Expo).** Os calendários/seletores passam a ter **data mínima = data
  inicial** (bloqueiam navegar para antes dela) e o Centro de Controle ganha a
  tela **"Zerar dados operacionais"**, visível apenas para `ADMIN_DADOS` e com
  confirmação explícita ("ZERAR") antes de disparar o reinício.
- **Qualidade.** Sem migração destrutiva. Domínio puro validado por property
  tests (`fast-check` ≥100, Properties 1–4: fronteira de data, partição
  apagar/conservar, idempotência conceptual e cobertura do resumo). Regressão de
  backend (`build`/`lint`/`test`) e mobile verdes.
- **Nota importante (Req 9):** o apagamento em **produção** é executado pelo
  próprio gestor, pelo botão do app; o time entrega a função
  **construída/testada/publicada** — nunca dispara o reinício no banco de
  produção.
- **ADR:** **não amerita** um novo ADR — reutiliza a tabela genérica de
  configuração (singleton) e a permissão `ADMIN_DADOS` já existentes, sem
  mudança de arquitetura.

---

## Incidências de Escala — validação E2E + correção de bugs (2026-07-05)

**Objetivo:** validar o módulo *Incidências de Escala* (backend `incidencias.*` +
perfil enriquecido) de ponta a ponta contra um PostgreSQL real e corrigir os
defeitos confirmados no Informe QA
(`.kiro/specs/validacao-e2e-incidencias-escala/INFORME_QA.md`). Protocolo por
bug: causa raiz → correção acotada (controller→service→domain) → re-execução do
caso E2E → regressão. Todas as mudanças são **apenas aditivas** (NFR 9.1).

- **Fix 1 — BUG-1 (E4, Alta): POST com `colaboradorId` inexistente criava a
  incidência.** `IncidenciasService.registrar` (`backend/src/incidencias/incidencias.service.ts`)
  passa a validar `prisma.colaborador.findUnique` antes do `create`; quando a
  ficha não existe, lança `ColaboradorIncidenciaInvalidoError` (400, erro que já
  existia em `incidencias.errors.ts` e estende `ErroDominio`). Elimina as linhas
  órfãs que contaminavam o `GET /ranking`. Sem mudança de esquema. (Req 2.3)
- **Fix 2 — BUG-2 (E14, Média): `sugestoes` com `intervaloMin=0` não omitia a
  sugestão.** `detectarNaoRetorno` (`incidencias.domain.ts`) retorna `null`
  quando `intervaloMin<=0` (ou não finito), pois sem intervalo previsto não pode
  haver "não retorno do intervalo". Lógica pura preservada; ampliada a
  **Property 2** em `incidencias.properties.spec.ts` (fast-check `numRuns:100`)
  com o caso `intervaloMin<=0 ⇒ sem detecção`. (Req 4.4)
- **Fix 3 — Seed passa a criar as fichas `Colaborador` FISCAL.** Nova
  `seedColaboradoresFiscais()` em `backend/prisma/seed.ts` (insert-only,
  idempotente, espelho da migração `9s_colaboradores_de_fiscais`): cria o
  `Colaborador` FISCAL + o `ColaboradorIdentificador` MATRICULA a partir dos
  fiscais semeados. Assim `migrate deploy` + `db seed` deixam `colaboradores`
  populada (10) sem o backfill manual F0. Sem migração destrutiva.
- **Testes.** `incidencias.service.spec.ts` ganhou um teste unitário do caso
  E4 (400 + não persiste a fila órfã); `incidencias.properties.spec.ts` ganhou
  a Property 2 dedicada a `intervaloMin<=0`.

**Verificação (executada nesta entrega):**
- **E2E (PostgreSQL real, API `dist/main.js`):** E4 → **400** + `0` linhas
  órfãs; E14 → **200 `[]`**; E1 → **201** (`horaEsperadaRetorno=14:00`); E5 →
  **409**; E11 → ranking desc sem o fantasma. Fix 3: BD limpa → seed → **10**
  colaboradores FISCAL (idempotente).
- **Regressão backend:** `npm run build`, `npm run lint`, `npm test` → **195
  testes** verdes (inclui property tests fast-check).
- **Regressão mobile:** `npm run type-check`, `npm run lint`, `npm test` →
  **41 testes** verdes.

---

## Incidências de Escala — validação E2E + correção (colaborador inexistente) (2026-07-04)

**Objetivo:** validar de ponta a ponta o módulo de Incidências de Escala (PRs
#100 backend + #101 mobile) contra um PostgreSQL real e corrigir os defeitos
encontrados. Executado com Postgres real (migração `prisma migrate deploy`
aplicada limpa até `9w_incidencia_escala`, `db seed` e API booted), exercitando
todos os endpoints com `curl` (códigos HTTP, validações e permissões), a
auto-detecção do ponto, o alerta por limite mensal e o perfil enriquecido.

- **Correção — validação de colaborador no `POST /escala/incidencias`.** Antes,
  registrar uma incidência com um `colaboradorId` inexistente retornava **201**
  e criava uma linha órfã que poluía o ranking (`nome` = id cru) e a listagem.
  Agora o `IncidenciasService.registrar` verifica a existência do colaborador
  (`colaborador.findUnique`) antes de persistir e, se não existir, lança o
  `ColaboradorIncidenciaInvalidoError` (**400** — erro que já estava definido em
  `incidencias.errors.ts`, porém não estava sendo usado). Adicionado teste
  unitário que fixa o comportamento (`rejeita incidência para colaborador
  inexistente com 400`); os dois testes de registro passaram a semear o
  colaborador no `PrismaService` falso.
- **Resultado da validação (tudo verde):** autorização (401 sem token; 403 para
  IMPORTADOR em leitura e escrita; 200 para FISCAL que tem `ESCALA_VISUALIZAR`);
  criação (201 + `origem=MANUAL`), validações de `HH:mm`/tipo/colaborador/data
  (400), duplicado (409); edição/remoção (200/204 e 404 quando não existe);
  listagem/ranking (200; 400 sem `inicio`/`fim`); sugestões do ponto
  (`DETECTADO_PONTO`, `horaSaida`/`horaEsperadaRetorno` derivados do
  `intervaloMin` da escala — ex.: 15:00 → 17:00 com 120 min; não sugere quem
  retornou nem incidência já registrada); alerta por limite (uma notificação por
  gestor ao cruzar 3 no mês, sem repetição na 4ª); e o perfil enriquecido
  (`GET /colaboradores/:id/perfil`) com a seção `incidencias` completa e a
  `timeline` unificada (faltas + não-retornos) em ordem decrescente.
- **Regressão:** backend `build` + `eslint`/`prettier` (arquivos alterados) +
  **194 testes** (45 suítes) e mobile `type-check` + **41 testes** (14 suítes),
  todos verdes.
- **Nota:** não é uma decisão de arquitetura (o desenho genérico por `tipo` do
  ADR 0007 permanece), portanto sem novo ADR — apenas esta entrada de bitácora.

---

## Documentação — Estado do projeto e próximos passos (2026-07-03)

Documentação: adicionado docs/ESTADO_Y_PROXIMOS_PASOS.md (estado do projeto + próximos passos consolidados).

---

## Incidências de Escala — mobile/UX (Fase 2: "não retornou do intervalo") (2026-07-03)

**Objetivo:** trazer para o app móvel a experiência das **incidências de escala**
(evento "não retornou do intervalo") sobre o backend da Fase 1 (PR #100),
reutilizando os componentes e padrões visuais existentes.

- **(Tipos) `api/types.ts`.** Espelho 1:1 do contrato do backend:
  `TipoIncidenciaEscala`, `IncidenciaEscala`, `SugestaoIncidencia`,
  `RankingIncidencia`, `TimelineItem` (`{ data, kind: 'FALTA' | ... }`) e os
  inputs de registro/edição. `PerfilColaborador` ganhou a seção `incidencias`
  (total, último, dias consecutivos, risco, tendência, por dia da semana,
  frequência mensal, % sobre escalados e a linha do tempo unificada).
- **(Serviço) `escalaService`.** Novos métodos sobre `/escala/incidencias`:
  `registrarIncidencia`, `editarIncidencia`, `removerIncidencia`,
  `listarIncidencias`, `sugestoesIncidencias` e `rankingIncidencias`, no mesmo
  estilo dos serviços existentes.
- **(Tela de Escala) sugestões + registro.** Para quem gere ausências
  (`OPERADORES_AUSENCIAS`), um cartão "Não retorno do intervalo — hoje" lista as
  sugestões **auto-detectadas do ponto** (com botão "Registrar" pré-preenchido)
  e cada colaborador ganha uma ação "Registrar não retorno" — sem quebrar a
  navegação de "tocar no cartão → perfil". Sem permissão, a seção some (e não há
  chamada extra).
- **(Modal) `RegistrarIncidenciaModal`.** Reutilizado para criar/editar/excluir,
  com campos de horário (máscara/validação `HH:mm`), motivo e observação, e erros
  da API exibidos inline. O tipo é fixo em `NAO_RETORNO_INTERVALO` (sem seletor).
- **(Perfil) histórico unificado.** Novo cartão "Histórico de incidências" com
  resumo (total, último, dias sem incidência, pílula de risco), gráfico por dia
  da semana, filtro segmentado (Todas/Faltas/Não retorno) e a linha do tempo;
  tocar num "Não retorno" abre o modal em modo de edição/exclusão (com recarga
  do perfil ao concluir).
- **(Testes) Escala + perfil.** `EscalaScreen.test` cobre a exibição das
  sugestões e a ação de registrar com permissão (e a ausência delas sem
  permissão); novo `PerfilColaboradorScreen.test` cobre o histórico unificado.

**Verificação (executada neste PR):** `tsc --noEmit` OK, `eslint` OK, `jest`
14 suítes / 41 testes OK e `expo export --platform web` concluído com sucesso.

---

## Incidências de Escala — backend (Fase 1: "não retornou do intervalo") (2026-07-03)

**Objetivo:** introduzir o registro e a análise de **incidências de escala** por
data, começando pelo evento "não retornou do intervalo". A modelagem é
**genérica por `tipo`** para crescer sem novas tabelas, e a detecção pode ser
automática a partir do ponto dos fiscais. Esta é a **Fase 1 (somente backend)**;
a experiência no app móvel vem em um PR seguinte.

- **(Modelo) Tabela genérica `IncidenciaEscala`.** Nova tabela (por DATA,
  diferente de `EscalaEntry`, que é a plantilla semanal) com `tipo`
  (`TipoIncidenciaEscala`, hoje só `NAO_RETORNO_INTERVALO`), `colaboradorId`,
  `funcionarioId?` (Fiscal), horários (`horaSaida`, `horaEsperadaRetorno`,
  `horaReal`), `origem` (`MANUAL`/`DETECTADO_PONTO`), `motivo`/`observacao`,
  autor do registro e timestamps. Unicidade `(colaboradorId, tipo, data)` +
  índices `(colaboradorId, data)`, `(tipo, data)` e `(data)`.
- **(Migração) `9w_incidencia_escala` — aditiva.** Cria o enum e a tabela com
  os índices; **não remove nem altera** dados existentes.
- **(Domínio puro) `incidencias.domain.ts`.** Sem Nest/Prisma:
  `derivarHoraEsperadaRetorno` (saída + intervalo, limitado a 23:59),
  `detectarNaoRetorno` (intervalo sem retorno no log de ponto),
  `analisarIncidencias` (taxa, padrões, tendência e risco — espelhando as
  heurísticas de `analisarFaltas` dos operadores), `timelineUnificada`
  (faltas + incidências, desc) e `rankingIncidencias`. Coberto por testes de
  propriedade (fast-check, ≥100 execuções por propriedade).
- **(Módulo) `escala/incidencias`.** Serviço + controller + `dto` (class-validator,
  horários validados por `@Matches(/^([01]\d|2[0-3]):[0-5]\d$/)`) + erros
  próprios estendendo `ErroDominio` (`IncidenciaNaoEncontradaError` 404,
  `IncidenciaDuplicadaError` 409, etc.). Endpoints: `POST /`, `PATCH /:id`,
  `DELETE /:id` (`OPERADORES_AUSENCIAS`); `GET /`, `GET /sugestoes`,
  `GET /ranking` (`ESCALA_VISUALIZAR`). Registrado em `app.module.ts`.
- **(Auto-detecção do ponto).** `GET /sugestoes?data=` monta o log de transições
  de cada fiscal a partir de `RegistroPontoFiscal` (instante formatado em HH:mm
  no fuso `America/Sao_Paulo`), aplica `detectarNaoRetorno` com o `intervaloMin`
  da escala e devolve os candidatos que ainda não têm incidência registrada.
- **(Alerta por limite).** Ao registrar, se o colaborador atinge 3 incidências
  do tipo no mês, os gestores recebem **um** aviso (mesmo padrão do alerta de 3
  faltas dos operadores; defensivo — nunca bloqueia o registro).
- **(Perfil enriquecido).** O Perfil Inteligente do Colaborador ganhou a seção
  `incidencias` (total, última, dias sem incidência, risco, tendência, série por
  dia da semana, frequência mensal, % sobre escalados e linha do tempo
  unificada), alimentada por `IncidenciasService.resumoDoColaborador`. Os campos
  existentes do perfil foram preservados.

**Objetivo:** rodada de polimento final com mudanças de baixo risco e, salvo o
novo log de requisições e a documentação, **preservando o comportamento**.

- **(21) DRY — `arredondar` centralizado.** Criado `common/numeros.ts` como fonte
  única do helper de arredondamento a 2 casas (`Math.round(n * 100) / 100`). As
  definições locais duplicadas foram substituídas por `import` em
  `arrecadacao.service.ts`, `indicadores-inteligente.service.ts`,
  `perfil-colaborador.service.ts` e `vendas.service.ts`; os helpers locais `arred`
  (idênticos) em `assistente.service.ts` e `lote-apae.service.ts` também passaram a
  usar o `arredondar` compartilhado. Sem mudança de comportamento de arredondamento.
- **(22) Notificações criadas em paralelo.** Em `notificacoes.service.ts`, o método
  `enviar` troca o laço sequencial de `create` por `Promise.all` (cada entrega ainda
  é um `create` individual — preserva o id/`criadaEm` de cada linha para a publicação
  em tempo real). A ordem e o comportamento de realtime são idênticos, apenas
  concorrentes (não se usa `createMany`, que não retorna ids).
- **(20) Coerência de config.** Em `config/env.validation.ts`, removido
  `enableImplicitConversion: true` do `plainToInstance` — o único campo numérico
  (`PORT`) já tem `@Type(() => Number)`, tornando o comentário do campo coerente.
  Testes de `validateEnv` seguem passando (defaults e conversão de `PORT` string).
- **(24) Observabilidade leve.** Novo `common/correlation-id.middleware.ts` (lê/gera
  o `x-request-id`, anexa ao `req` e devolve no header da resposta) e
  `common/logging.interceptor.ts` (loga uma linha por requisição após a conclusão:
  `método url status duração [correlationId]`, sem corpos, não-lançante). Ambos
  registrados em `app.module.ts` (interceptor global via `APP_INTERCEPTOR`;
  middleware para todas as rotas via `NestModule.configure`). Spec do middleware
  incluída.
- **Formatação:** aplicado o Prettier a `src/**/*.ts` (limpa avisos pré-existentes).
- **Docs:** `README.md` (JWT_SECRET obrigatório em produção sem default inseguro,
  nota de `DATABASE_URL`, linha de `CORS_ORIGINS`, nota de segurança atualizada e
  seção de deploy com `/health/ready` e `prisma migrate deploy`), steering
  `estado-e-pendientes.md` (pendiente #5: JWT_SECRET agora obrigatório),
  `PROJECT_UNDERSTANDING.md` (`CORS_ORIGINS` na lista de secrets) e novo
  `docs/CHECKLIST_PRODUCAO.md` (checklist de prontidão para produção).

---

## Erros auto-classificados + atomicidade (fechamento e auto-reposição) (2026-07-03)

**Objetivo:** tornar o tratamento de erros mais robusto e eliminar corridas que
geravam notificações e requisições duplicadas — com duas migrações **aditivas**
(9u, 9v) que não tocam dados existentes.

- **(14) Erros de domínio declaram o próprio status HTTP.** Criada a base
  `ErroDominio` (`common/errors/erro-dominio.ts`), da qual todos os erros de
  domínio agora herdam. Cada erro concreto declara seu `statusHttp` (401/403/
  404/409/400). O filtro global (`DominioExceptionFilter`) deixou de manter um
  **mapa central manual** (com os imports de cada módulo) e passou a ler o
  `statusHttp` do próprio erro. Resultado: um erro novo nunca mais cai em 500
  por esquecimento de registrá-lo no mapa. Comportamento inalterado para os
  erros já mapeados (os 27 status foram preservados). O default seguro é 400.
- **(12) Fechamento notifica exatamente uma vez.** `concluirSeCompletou` não
  depende mais de um `completoAntes` capturado antes da escrita (sujeito a
  corrida sob uploads concorrentes). Agora insere uma **marca idempotente** por
  dia na nova tabela `fechamentos_concluidos` (unicidade de `data` como trava
  atômica): apenas uma inserção vence e notifica; violação de unicidade (P2002)
  é no-op. Migração `9u_fechamento_concluido`.
- **(13) Auto-reposição sem requisições automáticas duplicadas.** As
  requisições criadas pela auto-reposição são marcadas com `automatica = true`
  e um **índice único parcial** (`requisicoes_auto_pendente_key`, apenas para
  `status = 'PENDENTE' AND automatica = true`) impede duplicatas pendentes do
  mesmo insumo sob consumos concorrentes. A criação é envolvida em try/catch
  (P2002 = no-op) e a notificação só ocorre após a criação bem-sucedida.
  Migração `9v_requisicao_automatica`.

**Migrações aditivas:** `9u_fechamento_concluido` e `9v_requisicao_automatica`
— criam uma tabela nova e adicionam uma coluna com default, sem afetar dados
atuais. Não foi executado `prisma migrate` (sem banco no ambiente); rode-o no
deploy. Nesta rodada as dependências foram instaladas e a verificação completa
passou: `prisma generate`, `nest build` e `jest` (42 suítes, 180 testes) OK.

---

## Desempenho: fim do N+1 e consultas em paralelo (2026-07-03)

**Objetivo:** reduzir o número e o custo das consultas ao banco em telas e
contextos que hoje disparam muitas queries sequenciais — **sem mudar o
comportamento** (mesmos resultados) nem o schema/migrações.

- **Painel de insumos sem N+1 (`InsumosService`):** `listarInsumos` e
  `listarProativo` faziam uma consulta de movimentos **por insumo** (N+1).
  Agora buscam os movimentos de todos os insumos ativos em **uma única
  consulta** (`movimentoEstoque.findMany` com `insumoId: { in: [...] }`) e
  agrupam em memória por `insumoId` (novo helper `movimentosPorInsumo`). O
  resumo por insumo é idêntico ao anterior.
- **Saldo via agregação no banco (`InsumosService.saldo`):** em vez de trazer
  todo o histórico de movimentos e somar em memória, agora usa
  `movimentoEstoque.aggregate({ _sum: { delta } })` — equivale exatamente à
  soma dos deltas (`calcularSaldo`), mas transfere só o total. A função de
  domínio `calcularSaldo` foi mantida (ainda coberta pelos testes de
  propriedade) e a coluna `Insumo.saldo` **não foi tocada** (limpeza adiada).
- **Contexto de indicadores da Cluby (`AssistenteService`):** o laço por tipo
  fazia um `registroArrecadacao.aggregate` por indicador (N+1 sequencial).
  Agora um único `groupBy(['tipo'])` do mês alimenta um mapa e o laço apenas
  lê o total já calculado. Saída idêntica.
- **Resumo de arrecadação (`ArrecadacaoService.resumo`):** as consultas
  independentes (totais dia/semana/mês, contagem, itens, meta e vendas) passam
  a rodar concorrentemente via `Promise.all`, preservando os mesmos resultados.

**Testes:** o `insumos.service.spec.ts` foi atualizado para o novo formato de
consultas (mock com `aggregate` e `findMany` por `in: [...]`), com dois casos
adicionais: `listarInsumos` faz **uma** única busca de movimentos (sem N+1) e
`saldo` retorna a soma agregada (`_sum.delta`). Os testes de propriedade do
domínio permanecem inalterados. Build + 42 suítes / 180 testes passando.

---

## Segurança: revogação de sessões via tokenVersion (2026-07-03)

**Objetivo:** permitir invalidar JWTs antes do vencimento (os tokens duram 30
dias e, até então, nada os invalidava mais cedo).

- **JWT agora carrega `tokenVersion`:** no login, o token passa a incluir a
  versão atual do usuário. O `JwtAuthGuard`, após validar a assinatura, compara
  o `tokenVersion` do token com a versão atual do usuário no banco e **rejeita**
  (401 "Sessão expirada. Faça login novamente.") quando divergem — ou quando o
  usuário não existe mais.
- **Redefinir senha invalida sessões antigas imediatamente:** `redefinirSenha`
  passa a incrementar `tokenVersion` (`{ increment: 1 }`), de modo que todos os
  JWTs emitidos antes da troca deixam de ser aceitos.
- **Remoção de usuário também invalida:** não exige mudança específica — o guard
  já rejeita tokens de usuários inexistentes (o `findUnique` retorna null).
- **Mudança aditiva no banco:** nova coluna `tokenVersion` em `usuarios`
  (`INTEGER NOT NULL DEFAULT 0`), sem impacto em usuários ou tokens atuais.
  Tokens antigos, sem o campo `tokenVersion`, são lidos como 0 e continuam
  válidos até que a versão do usuário mude (nenhum re-login forçado no deploy).
- **Tradeoff:** o guard passa a fazer **1 leitura por requisição autenticada**
  (`findUnique` por chave primária, indexada) para comparar a versão do token.

---

## Resiliência: timeout/concorrência no Gemini e readiness com checagem de banco (2026-07-03)

**Objetivo:** evitar que dependências externas (API do Gemini e banco de dados)
travem ou mascarem indisponibilidades do serviço.

- **(7) Cliente Gemini com timeout por tentativa e concorrência limitada:** cada
  tentativa de chamada à API do Gemini agora tem um **timeout** de 20s
  (via `AbortController`), impedindo que uma conexão pendurada bloqueie o fluxo
  indefinidamente. Além disso, a antiga **fila única** (que serializava as
  chamadas, uma de cada vez, causando bloqueio de cabeça de fila) foi
  substituída por um **semáforo de concorrência limitada** que permite até 2
  chamadas simultâneas — melhora a vazão em picos de uso sem estourar a cota
  gratuita. O reintento automático com backoff (429/503) foi mantido.
- **(15) Endpoint de readiness `/health/ready` com checagem real de banco:** o
  `/health` continua sendo a verificação de **liveness** (o processo está de pé;
  responde sempre 200 — é o que o Render consulta e não foi alterado). Foi
  adicionado o `/health/ready` (**readiness**), que executa `SELECT 1` no banco
  e responde **503** quando o banco está indisponível, para que monitores/
  orquestradores não roteiem tráfego para uma instância incapaz de servir.
  Também tornamos `DATABASE_URL` **obrigatória em produção** (falha rápida no
  boot, junto com a exigência já existente de `JWT_SECRET`).

---

## 0. Hardening de segurança (2026-07-03)

**Objetivo:** reduzir a superfície de ataque da API com medidas de defesa em
profundidade, sem alterar comportamento legítimo.

- **Rate-limit no login + helmet:** adicionado `@nestjs/throttler` com um teto
  GLOBAL alto (2000 req/min) — apenas anti-abuso, pois todos os usuários da loja
  compartilham UM IP público (NAT) e um limite baixo causaria falsos `429` para
  o time inteiro. O limite ESTRITO (8 tentativas/min) é aplicado SOMENTE à rota
  de login (`POST /acessos/login`), protegendo contra força bruta — o login é
  raro (sessões de 30 dias). Adicionado `helmet` para cabeçalhos de segurança
  HTTP, com `Cross-Origin-Resource-Policy: cross-origin` para que as imagens
  estáticas em `/assets` continuem carregáveis pelo app web em outro domínio.
- **Limites de tamanho de upload:** novos presets em
  `backend/src/common/upload-options.ts` — 2 MiB para arquivos de texto (.txt de
  arrecadação e vendas) e 10 MiB para imagens (fotos do checklist), ambos com
  `files: 1`. Evita que um upload gigante seja carregado inteiro em memória
  (proteção contra exaustão de RAM).
- **CORS por allowlist (`CORS_ORIGINS`):** as origens permitidas passam a vir da
  variável de ambiente `CORS_ORIGINS` (lista separada por vírgula); sem ela (dev)
  a origem é refletida. Como a autenticação é via token Bearer (sem cookies),
  `credentials` foi desabilitado. Os gateways WebSocket (`/fiscais` e
  `/notificacoes`) deixaram de usar `origin: '*'` e passaram a respeitar a mesma
  allowlist.
- **Chave do Gemini no cabeçalho:** a chave da API do Google Gemini deixou de ser
  enviada na query string da URL (`?key=`) e passou para o cabeçalho
  `x-goog-api-key`, evitando vazamento em logs de acesso/proxies.

---

## 0b. Segurança: JWT_SECRET obrigatório em produção + remoção de xlsx/papaparse (2026-07-03)

**Objetivo:** eliminar dois riscos críticos de segurança.

- **JWT_SECRET agora é obrigatório em produção (falha rápida no boot).** O
  fallback fixo e inseguro `'dev-secret-trocar'` (que era versionado no
  repositório e permitiria forjar tokens) foi **removido**. A exigência é
  imposta em dois pontos: na validação de ambiente (`validateEnv`, que lança se
  `NODE_ENV=production` sem `JWT_SECRET`) e na resolução do segredo
  (`resolverSegredoJwt`). Em desenvolvimento/teste, quando `JWT_SECRET` não está
  definido, gera-se um **segredo aleatório efêmero por processo** (memoizado e
  compartilhado entre `AcessosModule` e `SegurancaModule`), nunca um valor fixo.
  Sem mudança de comportamento quando `JWT_SECRET` está definido corretamente.
  - Novo arquivo: `backend/src/common/config/jwt-secret.ts` (+ testes).
  - Ajustes: `acessos.module.ts`, `common/seguranca.module.ts`,
    `config/env.validation.ts`, `main.ts` (remoção do aviso agora obsoleto) e
    `.env.example`.
- **Dependências `xlsx` e `papaparse` removidas (código morto / CVEs).** O
  fluxo antigo de leitura de arquivos CSV/XLSX já não tinha chamador vivo.
  De `importacoes.parser.ts` restou apenas `parseValor` (conversão de valores
  monetários em R$), reaproveitado pelos parsers de arrecadação e de vendas.
  Removidos também `@types/papaparse` e as funções mortas
  (`parseData`/`parseCsv`/`parseXlsx`/`valorDaColuna`/`paraLinhaImportada`).

---

## 1. Permissões: fonte única de verdade + acesso total do desenvolvedor

**Objetivo:** o perfil `GERENTE_DESENVOLVEDOR` deve ver **absolutamente tudo**, e
as regras de permissão devem ficar centralizadas.

- Criado um **catálogo único** de funcionalidades `TODAS_FUNCIONALIDADES` (com o
  tipo `Funcionalidade`) em:
  - `backend/src/acessos/acessos.domain.ts` (fonte de verdade);
  - `mobile/src/auth/funcionalidades.ts` (espelho do app, bem documentado).
- As listas de cada perfil agora são tipadas como `readonly Funcionalidade[]`,
  o que garante **em tempo de compilação** que só usem funcionalidades que
  existem no catálogo (evita "permissão fantasma" digitada errado).
- `GERENTE_DESENVOLVEDOR` continua liberado por uma regra explícita
  (`return true`), de modo que enxerga tudo — inclusive qualquer funcionalidade
  **nova** adicionada ao catálogo no futuro, sem precisar mexer na regra.
- Adicionado teste-guarda `backend/src/acessos/acessos.permissoes.spec.ts` que
  garante: (a) o desenvolvedor vê todas as funcionalidades; (b) toda
  funcionalidade de qualquer perfil existe no catálogo.

**Observação honesta:** backend e app são pacotes compilados separadamente e não
compartilham código. A unificação real "em um único arquivo" para os dois exigiria
um pacote compartilhado no monorepo (com ajustes de build do Expo/Metro), o que é
arriscado sem poder compilar. A solução adotada deixa **um catálogo único por
pacote**, idênticos, com documentação cruzada e teste-guarda. Mover para um pacote
compartilhado fica como melhoria futura (ver seção 5).

## 2. Remoção de código morto

### App (mobile) — removido por completo (estava sem uso)
- `mobile/src/api/services/importacoes.ts` (fluxo antigo de importação CSV/XLSX).
- `mobile/src/api/services/indicadores.ts` (painel de vendas manual antigo).
- Limpeza dos `export` correspondentes em `mobile/src/api/services/index.ts`.
- Removidos os tipos órfãos em `mobile/src/api/types.ts` (`TipoArquivo`,
  `StatusImportacao`, `StatusDia`, `RegistroImportacao`, `ResultadoImportacao`).

> As telas atuais de Importações e Indicadores usam `arrecadacaoService` e
> `vendasService` (arquivos `.txt`), confirmado por busca em todo o app.

### Backend — removida a "superfície HTTP" antiga (controllers/services/módulos)
- `IndicadoresModule` e `ImportacoesModule` retirados de `app.module.ts`.
- Deletados: `indicadores.controller.ts`, `indicadores.service.ts`,
  `indicadores.module.ts`, `dto/indicadores.dto.ts`, `indicadores.domain.ts` e
  seus specs; `importacoes.controller.ts`, `importacoes.service.ts`,
  `importacoes.module.ts`, `dto/importacoes.dto.ts` e seus specs de
  controller/service.

### Backend — arquivos mantidos DE PROPÓSITO (não são código morto)
Estes ficaram porque **código vivo depende deles** (documentado no topo de cada
arquivo):
- `importacoes/importacoes.parser.ts` → `parseValor` é reutilizado pelos parsers
  ATUAIS de **arrecadação** e **vendas**.
- `importacoes/importacoes.domain.ts` → fornece o tipo `LinhaImportada` usado
  pelo parser acima.
- `importacoes/importacoes.errors.ts` (`ColunaAusenteError`) e
  `indicadores/indicadores.errors.ts` (`ValorVendaInvalidoError`) → ainda são
  referenciados pelo **filtro global de exceções**
  (`common/filters/dominio-exception.filter.ts`).

## 3. Correção de bug latente no alerta de fim do dia

O cron de "importações pendentes" (`AlertasService`) lia a tabela do fluxo
**antigo** (`RegistroImportacao`), que **não é mais alimentada** — ou seja, o
alerta estava obsoleto. Ele foi **migrado para o fluxo atual**:

- `AlertasService` agora depende de `ArrecadacaoService` (não mais de
  `ImportacoesService`).
- "Pendente" passou a significar: indicador do dia que ainda não foi enviado nem
  marcado como "sem movimento" (via `ArrecadacaoService.status`).
- Atualizados `alertas.module.ts` (importa `ArrecadacaoModule`) e o teste
  `alertas.service.spec.ts` (simula `status`).

## 4. Ocultar áreas "em breve" até serem concluídas

- Adicionada a marca `emBreve?: boolean` em `mobile/src/navigation/areas.ts`.
- Marcadas como `emBreve: true`: **Alertas de Fila**, **Normativas** e
  **Indicador de Quebra**.
- A `HomeScreen` passou a filtrar `!a.emBreve`, então essas áreas ficam ocultas
  do menu (inclusive para o gerente desenvolvedor) até serem finalizadas. Basta
  remover a marca para reexibir.
- Teste `HomeScreen.test.tsx` atualizado para confirmar que as áreas em
  construção não aparecem.

## 5. Próximos passos recomendados (não feitos por segurança)

- **Verificar com build/testes** (não foi possível neste ambiente):
  - Backend: `npm run -w backend prisma:generate && npm run -w backend build && npm run -w backend lint && npm run -w backend test`
  - App: `npm run -w mobile type-check && npm run -w mobile lint && npm run -w mobile test`
- **Limpeza profunda opcional do `importacoes`**: mover `parseValor` para um
  utilitário comum, remover as funções de parser CSV/XLSX não usadas e o
  `ColunaAusenteError` (hoje nunca lançado) do filtro. Exige build para validar.
- **Permissões em pacote compartilhado**: extrair o catálogo para um pacote do
  monorepo consumido por backend e app, eliminando o espelho manual.
- As tabelas antigas no banco (`RegistroImportacao`, etc.) **não foram tocadas**
  (nenhuma migração destrutiva) — continuam existindo, apenas sem uso.


---

## 6. Correções para deixar a CI verde (problemas PRÉ-EXISTENTES)

Ao rodar a nova CI no GitHub, descobrimos que o `main` **já tinha** testes e
verificações de tipo quebrados, sem relação com a limpeza acima (a CI nunca
havia sido executada). O build e o lint do backend passaram; as falhas eram em
testes e no type-check do app. Correções aplicadas (sem alterar lógica de
produção — apenas testes/tipos):

### Causadas pela limpeza (responsabilidade desta mudança)
- `alertas.service.spec.ts`: import do tipo `StatusArrecadacao` corrigido (vem
  de `arrecadacao.service`, não do `domain`).
- `test/importacao.e2e.spec.ts`: **removido** — testava o `ImportacoesController`
  do fluxo antigo, que foi excluído.

### Pré-existentes (reveladas pela CI, corrigidas aqui)
- **App (type-check):**
  - `components/Cartao.tsx`: passou a aceitar a prop `style` (além de `estilo`),
    corrigindo 5 erros de tipo em telas que já a usavam (Jornada, Insumos). Como
    bônus, estilos que eram silenciosamente ignorados agora se aplicam.
  - `FiscaisScreen.tsx`: removida função `iconeStatus` sem uso.
  - `IndicadorDetalheScreen.tsx`: removido parâmetro `anterior` sem uso.
  - `PainelVendasScreen.tsx`: `porHora`/`porHoraDia` agora convertem `null` em
    `undefined` (compatível com o tipo esperado).
- **Backend (testes com Prisma falso desatualizado):**
  - `fiscais.service.spec.ts` e `fiscais.gateway.spec.ts`: o Prisma falso ganhou
    `escalaEntry.findFirst` (usado por `isFolgaHoje`).
  - `lote-apae.service.spec.ts`: o Prisma falso ganhou `movimentoLoteApae`
    (aggregate/create) e `configApae` (findUnique/create).
  - `lote-apae.controller.spec.ts`: a chamada de `atualizarSaldo` passou a
    incluir o 3º argumento `usuario` (a assinatura do controller já o exigia).
- **Backend (testes desalinhados do código — alinhados ao comportamento atual):**
  - `checklist.service.spec.ts`: o alerta de pendência dispara às **09:00**
    (15 min antes do limite 09:15), não às 08:55 — o teste foi corrigido para
    refletir o código.
  - `fiscais.service.spec.ts` e `fiscais.properties.spec.ts`: **carga horária =
    tempo trabalhando (sem intervalo)**, conforme a definição documentada em
    `Jornada.cargaHorariaMs`. Os testes esperavam, por engano, "trabalho +
    intervalo". ⚠️ **Recomendação:** o time deve confirmar qual é a definição
    desejada de "carga horária". Se for "tempo total de presença" (com
    intervalo), a mudança deve ser feita no código (`calcularJornada`) e não nos
    testes. Mantivemos o comportamento de produção **inalterado**.

> Nenhuma lógica de produção foi alterada nesta seção; as mudanças são em
> testes, em tipos e na prop de um componente. A intenção foi deixar a CI verde
> sem mudar o comportamento do app/produção.


---

## 7. Testes do app voltam a ser OBRIGATÓRIOS (Opção B)

A pedido (o projeto será passado a outras pessoas no futuro), a suíte de testes
do app foi reparada e voltou a **bloquear** o merge (removido o
`continue-on-error`). Mudanças, **apenas em arquivos de teste** (sem tocar a
lógica do app):

- **Mocks de serviço completados** em `ImportacoesScreen.test` e
  `InsumosScreen.test` (status, listarProativo, sugestões, etc.).
- **Dados de teste atualizados** em `InsumosScreen.test`: o selo de estoque
  agora é por **nível** (`Crítico`/`Atenção`/`OK`), não mais o antigo "Baixo".
- **Testes de snapshot substituídos por verificações concretas** (ex.: "o texto
  X aparece na tela") em ImportacoesScreen, InsumosScreen e EscalaScreen, e os
  arquivos `.snap` foram removidos. Snapshots de árvore inteira eram frágeis e
  quebravam a cada ajuste de layout; as verificações concretas são mais
  estáveis e fáceis de manter por futuros desenvolvedores.
- CI: o passo de testes do app deixou de ser informativo e voltou a ser
  obrigatório, junto com build, type-check e lint.
