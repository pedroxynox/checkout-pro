# Tarefas — Jornada 5x2 (fim do 6x1)

Executar **na ordem das fases**. Cada fase sai em **branch + PR próprio** a partir
da `main` atualizada, termina com `npm run verify` e `npm run docs:check` verdes e
atualiza este arquivo (`[x]` ao concluir, com o número do PR).

Requisitos: [`requirements.md`](requirements.md) · Design: [`design.md`](design.md).

> **Para a sessão que continuar:** leia as "Decisões do dono" e as "Decisões
> pendentes" em `requirements.md`. Nada do que está pendente pode ser inventado:
> use o valor proposto só como padrão editável e registre a pergunta na resposta
> ao dono.

## Regras da transição (valem até a Fase 7)

- A pausa (`PAUSA_TRANSICAO_JORNADA=true`) fica ligada em produção até as Fases
  1–4 estarem publicadas **e** as vigências de 23/11 carregadas.
- **Não fechar o ciclo 26/10–25/11** antes das vigências de 23/11.
- **Não editar o contrato 6x1** nem as fichas pelo app até a Fase 4.
- Antes de cada migração em produção: Render ▸ banco ▸ Recovery ▸ **Create export**.
- Ordem de publicação: Fases 1 → 2 → 3 → 4 podem ir a produção uma a uma (cada
  uma sem mudança visível de números para o passado). As pessoas só são passadas
  para o 5x2 depois da Fase 4.

## Fase 0 — Proteger a operação (22/11/2026)

- [x] 0.1 Spec `jornada-5x2` (requirements, design, tasks) e steering apontando
  para ele. _(RT.5)_ — PR #437.
- [x] 0.2 Interruptor `PAUSA_TRANSICAO_JORNADA` (design §8): função pura,
  validação no boot, guarda em cada ponto da tabela, log ao subir, testes. _(R0.1–R0.3)_
  — PR #438 (mergeado e publicado em 22/11/2026).
- [x] 0.3 Documentar a variável em `docs/07-operacao/variaveis-de-ambiente.md`,
  `backend/.env.example` e no Atlas dos módulos tocados. _(RT.5)_ — PR #438.
- [x] 0.4 (Dono) Ligar `PAUSA_TRANSICAO_JORNADA=true` no Render e confirmar no log
  "Pausa de transição da jornada ATIVA". _(R0.1)_ — **ativa em produção desde
  22/11/2026 às 16:06 (Brasília)**, confirmada no log de boot.

## Fase 1 — Vigência da jornada (sem mudança visível)

Dois PRs. Nenhum muda número algum: enquanto ninguém tiver vigência, a jornada
prevista é o código de hoje com os dados de hoje (design §1).

**PR 1a — base** (PR #440)
- [x] 1.1 Prisma: `JornadaVigencia`, `DisponibilidadeDia` e relações (design
  §2.1). Migração `9zzu_jornada_vigencia` (só cria as tabelas). Ensaiar em
  PostgreSQL descartável. _(R1.1, RT.3)_
- [x] 1.2 Domínio puro `jornada-vigencia.domain.ts`: `vigenciaNoDia`,
  `previstoNoDia` (regime legado delegando às funções atuais; regime SEMANAL com
  folgas fixas e disponibilidade; grupo sem rodízio não afirma),
  `folgasFixasEfetivas`, `avisosDaVigencia`, `validarVigencia`. _(R1.2, R4.6, RT.1)_
- [x] 1.3 Testes: propriedade de regressão (sem vigência == funções atuais para
  fichas e datas aleatórias) e casos do regime SEMANAL e dos avisos. _(RT.2)_
- [x] 1.4 `JornadaVigenciaService.consultor` (carga em lote); "contrato em uso"
  conta as vigências. _(R1.2)_
- [x] 1.5 ADR 0027 "Vigência da jornada"; Atlas `jornada-vigencia` e
  `tipos-contrato`; `docs:gen`. _(RT.5)_

**PR 1b — consumidores** (branch `feat/jornada-vigencia-consumidores`)
- [x] 1.6 `FolgaService` passa a perguntar ao consultor (mudou-se para
  `jornada-vigencia`); `regrasDoColaborador` exige o dia.
- [x] 1.7 Migrar os consumidores (design §10) para o consultor, um módulo por
  commit: ponto, detecção automática, fiscais (escala, alertas, horário,
  saudação), Central de Jornada, compensação, operadores (roster, analítica,
  `contarDiasEscalados`, emenda), incidências, perfil, exportação de escala.
  _(R1.2, R6.4)_ — a Conferência de escala e a sugestão de nova folga ficam para a
  Fase 5 (5.3 e 5.5), como previsto; `jornadaEsperadaMs` e o domingo fixo da
  compensação, para a Fase 2 (2.4).
- [~] 1.8 Comparar a Central numa cópia do banco de produção (`main` × branch):
  diferença vazia (design §9). _(R1.3, R6.1)_ — feito num banco de ensaio
  (PGlite, 8 pessoas, ciclo inteiro com folga fixa, ficha omissa, rodízio,
  feriados, férias, faltas e atestados): 155 leituras idênticas. Falta repetir com
  um export do banco de produção.
- [x] 1.9 Atlas dos módulos tocados; regras de negócio (`contratos-e-jornada`,
  `escala-e-rodizio-domingo`); `docs:gen`. _(RT.5)_

## Fase 2 — Tipo de contrato 5x2

Dois PRs: **2a — backend** (PR #442) e **2b — app**.

- [x] 2.1 Prisma: campos da design §2.2; migração `9zzv_contrato_5x2` com os
  valores do 6x1 (feriado 440, `feriadoAdicional100` true, limite diário null…).
  _(R2.1–R2.3, R2.6, R2.7)_
- [x] 2.2 Adapter e `RegrasContrato`: carga de feriado do banco,
  `feriadoAdicional100`, `limiteTrabalhoDiaMs`; `diaPagaAdicional100` novo. _(R2.1, R2.2)_
- [x] 2.3 TAC: motivo de limite diário; textos a partir dos números (idênticos para
  o 6x1); `etapaAlertaTac` com as regras; mensagens e rótulos dos avisos. _(R2.3–R2.5)_
- [x] 2.4 Remover valores fixos do caminho de cálculo: `CARGA_FERIADO_MS` no
  adapter, `jornadaEsperadaMs`/`isDomingo` em `fiscais.service` e
  `fiscais-alertas`, domingo fixo em `compensacao-horas.service`,
  `INTERVALO_MINIMO_ENTRE_BATIDAS_MS` em `DUPLICADA`. _(R2.10)_ — o domingo fixo
  do app fica para a 2b; o limiar de 7h da "folga sugerida" é decisão pendente 2.
- [x] 2.5 Trava de regras de contrato em uso (`emUso`), `POST /duplicar`,
  `PATCH /padrao`; validação de coerência ampliada (avisos ≤ limite; folgas fixas
  padrão ≤ `folgasPorSemana`; sábado só com permissão). _(R2.8, R2.9)_ — a troca
  do padrão é recusada enquanto houver batida sem ficha (o padrão decide todos os
  dias delas).
- [~] 2.6 `JornadaPontoView.regrasResumo` e textos do `RegistroPontoScreen`. _(R2.5)_
  — `regrasResumo` no backend (2a); os textos do app ficam para a 2b.
- [ ] 2.7 Tela `TiposContratoScreen`: campos novos, chip Feriado, "1º/2º aviso",
  travas, Duplicar, Tornar padrão. _(R2.1–R2.9)_
- [ ] 2.8 (Dono) Criar o(s) contrato(s) 5x2 44h. Valores informados: carga 8h48
  (528 min) por dia, feriado com carga própria, 100% em domingo e feriado, limite
  de extras 70 min, limite diário 600 min, intervalo máximo 170 min, 2 folgas por
  semana; avisos de TAC e intervalo mínimo conforme cada contrato (decisões 14
  e 15). _(R2)_
- [~] 2.9 Atlas `tipos-contrato`, `ponto`; regras `ponto-jornada-e-tac` e
  `contratos-e-jornada`; `docs:gen`. _(RT.5)_ — backend feito na 2a (também
  `fiscais`, `compensacao-horas`, `central-jornada`, `common`,
  `jornada-vigencia`); Atlas do app na 2b.

## Fase 3 — Rodízio de folgas

- [ ] 3.1 Prisma `RodizioFolgasVigencia`; migração `9zzw_rodizio_folgas` semeando
  2026-11-23 com o padrão da decisão 5. _(R3.1, R3.2)_
- [ ] 3.2 Domínio: `segundaDaSemana`, `rodizioNoDia`, `semanaDoCiclo`,
  `folgasDoGrupoNaSemana`, `gruposDeFolgaNoDia`, `validarRodizio`; ligar ao
  `previstoNoDia` (ramo SEMANAL com grupo). Testes: a tabela da decisão 5 dia a
  dia de 23/11 a 03/01, cobertura (um grupo por dia útil e domingo, nenhum no
  sábado), no máximo 5 dias seguidos, continuidade dos domingos. _(R3.3, R3.4, RT.1)_
- [ ] 3.3 `GET/PUT /config/rodizio-folgas` com prévia e avisos. _(R3.5)_
- [ ] 3.4 Tela "Rodízio de folgas" substitui a de domingo no Centro de Controle. _(R3)_
- [ ] 3.5 ADR 0028 "Rodízio de folgas 5x2"; Atlas `escala-domingo` e
  `centroControle`; regra `escala-e-rodizio-domingo`; `docs:gen`. _(RT.5)_

## Fase 4 — Ficha e perfil do colaborador

- [ ] 4.0 Escrita das vigências: `GET/PUT/DELETE /colaboradores/:id/jornada` com
  `exigirCicloAberto`, auditoria, validação e avisos (design §3.2); 409 ao mudar
  campo legado de quem tem vigência. _(R1.3a, R1.4–R1.7)_
- [ ] 4.1 `GestaoColaboradoresScreen`: turno; disponibilidade Seg…Dom com "copiar a
  primeira para todas"; grupo; folgas fixas só sem grupo; contrato; "Vale a partir
  de"; avisos. Tirar folga fixa e os três blocos. _(R4.1–R4.7)_
- [ ] 4.2 `POST /colaboradores` aceita o bloco `jornada`. _(R4.7)_
- [ ] 4.3 `PerfilColaboradorScreen` e `GET /colaboradores/:id/jornada`:
  disponibilidade, grupo, próximas folgas, contrato vigente, histórico. _(R4.8)_
- [ ] 4.4 Testes de tela e espelhos de tipos. _(RT.4)_
- [ ] 4.5 Atlas `colaboradores` (backend e mobile); `docs:gen`. _(RT.5)_
- [ ] 4.6 (Dono) Carregar as vigências de 23/11 perfil por perfil; conferir avisos;
  depois **desligar a pausa** e fechar o ciclo 26/10–25/11. _(R0.4)_

## Fase 5 — Escala, Central e restante

- [ ] 5.1 Backend do dia da escala: grupos de folga em todo dia (`gruposFolga`),
  mantendo `grupoFolgaDomingo` para o APK. _(R5.1, RT.4)_
- [ ] 5.2 `OperadoresScreen` (aba Escalas): selo de folga por dia; horários da
  disponibilidade; **remover** "Faltas do mês" e "Não-retornos do mês". _(R5.1, R5.2)_
- [ ] 5.3 Publicar escala (`EscalaScreen`, `escalaLayout`, exportação) e
  Conferência de escala no modelo novo. _(R5.3)_
- [ ] 5.4 Central: `geraDebito` por dia na resposta; `DetalheJornadaScreen` usa o
  campo; tirar o texto "6x1-2x1"; mostrar o contrato da pessoa no detalhe. _(R6.1–R6.3)_
- [ ] 5.5 Sugestão de nova folga desligada no regime SEMANAL. _(R6.5)_
- [ ] 5.6 Atlas `operadores`, `escala`, `ponto` (mobile), `central-jornada`,
  `escala-exportacao`; `docs:gen`. _(RT.5)_

## Fase 6 — 42 h a partir de 16/12/2026

- [ ] 6.1 `POST /tipos-contrato/:id/transferir` (nova vigência para todos do
  contrato na data, copiando grupo/folgas/disponibilidade) + botão na tela. _(R7.1)_
- [ ] 6.2 (Dono) Duplicar o contrato 44h → 42h (8h24 = 504 min por dia),
  transferir a partir de 16/12/2026 e ajustar a disponibilidade de quem precisar
  (os avisos de R4.6 mostram quem). _(R7.1, R7.2)_

## Fase 7 — Limpeza

- [ ] 7.1 Remover a pausa de transição. _(R0)_
- [ ] 7.2 Tirar da API e das telas os campos legados da ficha (`folgaDiaSemana`,
  blocos, `grupoDomingo`, `tipoContratoJornadaId`) e `trabalhaDomingo`. No banco
  eles continuam: são a história do 6x1 (design §1). _(RT.4)_
- [ ] 7.3 Reduzir `REGRAS_PADRAO`/6x1 em código a fallback de emergência marcado;
  converter `contrato-6x1-congelado.spec.ts` em teste da vigência LEGADO. _(RT.2)_
- [ ] 7.4 Revisar `EscalaEntry` (etapa 3 da ADR 0026) agora que o regime SEMANAL
  não a lê. _(RT.4)_
- [ ] 7.5 Atualizar `.kiro/steering/*` e as regras de negócio para o modelo final. _(RT.5)_

## Notas

- O spec anterior `solidez-contratos-jornada` deixou domingo/escalas fora; este
  spec cobre isso. O `plano-tipos-contrato.md` (steering) continua valendo nas
  decisões de "minutos fixos, nunca porcentagem" e "avisos citam o número do
  contrato"; as fases 1, 3 e 4 dele foram absorvidas pelas Fases 1–2 daqui.
