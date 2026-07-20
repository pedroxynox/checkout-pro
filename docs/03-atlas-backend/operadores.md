> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-20 · **Cobre:** `backend/src/operadores/`

# Módulo: `operadores`

## 1. Propósito
Gestão da operação de frente de caixa: **ausências** (faltas) dos operadores e
fiscais, com justificativa e auditoria, o **Quadro de Operadores** (escala fixa
visual, turnos e cobertura) e a **analítica inteligente de faltas**.

## 2. Responsabilidades e limites
- **Faz:** registra/remove ausências com unicidade por pessoa/dia; ausência a
  prazo (período, gera faltas justificadas dia a dia); justifica/reabre/marca
  como injustificada; lista faltas com nome e justificativa; relatório de
  ausências por período; classifica e conta operadores por turno; monta a grade
  semanal, o roster do dia e o tablero "ao vivo"; analítica de faltas e de
  não-retornos (taxa, padrões, tendência, risco); avisos automáticos.
- **Não faz:** cadastro das pessoas em si (agora vive no Cadastro Unificado de
  [`colaboradores`](colaboradores.md), função `OPERADOR`; o `Operador` simples
  foi removido); jornada/ponto (fica em [`ponto`](ponto.md) e
  [`central-jornada`](central-jornada.md)); a escala dos fiscais/domingo
  (fica em [`fiscais`](fiscais.md)/[`escala-domingo`](escala-domingo.md)).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `operadores.controller.ts` | Rotas de ausências/justificativa/contagem | 197 |
| `operadores.service.ts` | Regras de aplicação: ausências, avisos, período | 624 |
| `operadores.domain.ts` | Regras puras: unicidade, turno, relatório, analítica | 529 |
| `operadores.errors.ts` | Erros de domínio (mapeados para HTTP) | 104 |
| `operadores.module.ts` | Ligações (DI) do módulo | 32 |
| `operador-turno.controller.ts` | Rotas do Quadro de Operadores | 70 |
| `operador-turno.service.ts` | Grade semanal, roster do dia, ao vivo, analítica | 908 |
| `dto/operadores.dto.ts` | Validação de entrada das rotas | 121 |

## 4. Endpoints (rotas HTTP)
> Lista canônica em [API HTTP → `operadores`](../05-referencia-dados/api-http.md).

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `GET /quadro-operadores/grade` | `OPERADORES_AUSENCIAS` | Grade semanal (Seg–Sáb) com status por dia e cobertura. |
| `GET /quadro-operadores/dia` | `OPERADORES_AUSENCIAS` | Roster de um dia (status TRABALHA/FOLGA/FALTA/**ATESTADO** + contagem de atestados). |
| `GET /quadro-operadores/ao-vivo` | `OPERADORES_AUSENCIAS` | Quem deveria estar no caixa agora. |
| `GET /quadro-operadores/faltas/analitica` | `OPERADORES_AUSENCIAS` | Analítica de faltas do período (ranking, dia recorrente, risco). |
| `GET /quadro-operadores/nao-retornos/analitica` | `OPERADORES_AUSENCIAS` | Analítica de não-retornos do intervalo (mesma inteligência). |
| `GET /quadro-operadores/turnos` | `OPERADORES_AUSENCIAS` | Lista os operadores (turno fixo) do Cadastro Unificado. |
| `POST /operadores/ausencias` | `OPERADORES_AUSENCIAS` | Registra uma falta numa data (futura exige gerente/supervisor). |
| `POST /operadores/ausencias/periodo` | `OPERADORES_AUSENCIAS` | Ausência a prazo: falta justificada dia a dia (futura exige gestão). |
| `DELETE /operadores/ausencias/periodo` | `OPERADORES_AUSENCIAS` | Anula uma ausência a prazo inteira no período (só gerente/supervisor). |
| `DELETE /operadores/ausencias/:id` | `OPERADORES_AUSENCIAS` | **Exclui** (rejeita) uma falta lançada por engano — só gerente/supervisor/administrador. |
| `PATCH /operadores/ausencias/:id/justificativa` | `OPERADORES_AUSENCIAS` | Justifica/reabre/injustifica (com auditoria). |
| `GET /operadores/ausencias` | `OPERADORES_AUSENCIAS` | Lista faltas do período (nome + justificativa + marca de **atestado**/CID); `?pendentes=true`. |
| `GET /operadores/ausencias/relatorio` | `OPERADORES_AUSENCIAS` | Relatório por pessoa, filtrado e ordenado. |
| `POST /operadores/contagem-turno` | `OPERADORES_AUSENCIAS` | Conta os operadores por turno na escala informada. |

> **Atestados:** os atestados médicos são um módulo próprio
> ([`atestados`](atestados.md)). Ao lançar um atestado, ele grava faltas
> JUSTIFICADAS (motivo `ATESTADO_MEDICO`, `aPrazo`) carimbadas com `atestadoId`
> e `cid`. Por isso o roster do dia (`GET /quadro-operadores/dia`) distingue o
> status **ATESTADO** de **FALTA**, e a lista de faltas expõe `atestado`/`cid`.

> O controller de ausências declara `@Funcionalidade('OPERADORES_CRUD')` na
> classe, mas **cada rota** relaxa para `OPERADORES_AUSENCIAS` (que o fiscal
> possui), como consta na referência canônica.

## 5. Serviços e funções

### `OperadoresService`

#### `registrarAusencia(pessoaId, data, autor?, opcoes?)`
- **Efeitos:** valida data permitida e ciclo de folha aberto; rejeita duplicata
  (pessoa/dia); cria a `Ausencia` (nasce `PENDENTE`, com autor e flag
  `automatica`, e já com o vínculo `colaboradorId` = `pessoaId`, pois para
  operador o `pessoaId` é a própria ficha — Fase 4 · Opção A); avisa todos e
  checa o limite de faltas do mês (best-effort).
- **Erros:** `AusenciaDuplicadaError` (além dos de data/ciclo).

#### `registrarAusenciaPeriodo(pessoaId, inicio, fim, input, autor?)`
- **Efeitos:** marca **falta justificada** em cada dia corrido do intervalo
  (inclusive folga), numa transação atômica; dias que já tinham falta são
  convertidos (não duplica); marca `aPrazo: true` **e grava `colaboradorId`**
  (= `pessoaId`, pois a a prazo é sempre lançada escolhendo um Colaborador),
  para a busca por ficha encontrar esses dias; envia um único aviso.
- **Erros:** `JustificativaInvalidaError` (motivo obrigatório),
  `PeriodoAusenciaInvalidoError` (data final antes da inicial ou > 186 dias).

#### `removerAusenciaPeriodo(pessoaId, inicio, fim)`
- **Efeitos:** anula uma **ausência a prazo inteira** — `deleteMany` dos dias
  `aPrazo` da pessoa no intervalo, casando as duas chaves (`pessoaId` **e**
  `colaboradorId`, cobrindo registros novos e legados); preserva as faltas
  comuns/automáticas; exige ciclo de folha aberto; envia um único aviso. Retorna
  `{ removidas }`. A autorização (gerente/supervisor/administrador) é feita no
  controller, como no registro do período.
- **Erros:** `PeriodoAusenciaInvalidoError` (data final antes da inicial).

#### `removerAusencia(ausenciaId, perfil?)`
**Exclui** a falta de vez — é o caminho para **rejeitar uma falta lançada por
engano** (ex.: escala desatualizada que marcou falta indevida), para que não
pese no colaborador. Diferente de justificar/abonar (que mantém a falta com peso
reduzido — 2%/10%): aqui a ocorrência é apagada. A exclusão é **restrita a
gerente/supervisor/administrador** (guarda de perfil no controller); o serviço
ainda bloqueia o **fiscal** de desmarcar um dia `aPrazo`
(`AusenciaAPrazoProtegidaError`) e impede remoção em ciclo de folha fechado.
- ⚠️ Se a falta era **automática** e o colaborador continua escalado no dia sem
  bater ponto, a detecção pode remarcá-la; por isso a escala do dia deve estar
  corrigida antes (ex.: marcar a folga) para a exclusão ser definitiva.

#### `justificarAusencia(ausenciaId, input, autor?)`
Abona (`JUSTIFICADA`, exige motivo), reabre (`PENDENTE`, limpa tudo) ou marca
`INJUSTIFICADA`, gravando quem justificou e quando. `AusenciaNaoEncontradaError`
se não existir; bloqueia ciclo fechado.

#### `listarAusencias(periodo, apenasPendentes?)`
Lista as faltas do período com nome e os dados da justificativa; pendentes no
topo, mais recentes primeiro. O nome é resolvido pela **ficha canônica**
(`Colaborador`), via `pessoaId` (operador) ou `colaboradorId` (fiscal); o modelo
legado `Fiscal` só é consultado como fallback para faltas antigas sem vínculo
(Fase 4 · Opção A · A.3).

#### `relatorioAusencias(periodo)` · `classificarTurnoOperador(entrada)` · `contagemPorTurno(operadores)`
Delegam às funções puras homônimas do domínio.

### `OperadorTurnoService`
- `listar()` — operadores (turno fixo) a partir do Cadastro Unificado (função
  `OPERADOR` ativa).
- `grade(dataRef?)` — grade semanal (Seg–Sáb) com trabalha/folga/falta e
  cobertura por dia.
- `diaOperadores(dataRef?)` — roster de um dia, ordenado por entrada (folga ao
  fim); propaga o turno do cadastro.
- `aoVivo()` — quem deveria estar no caixa agora (fuso de Brasília).
- `analiticaFaltas(inicio, fim)` / `analiticaNaoRetornos(inicio, fim)` —
  analítica inteligente (taxa, padrões, tendência e risco) via `analisarFaltas`.

## 6. Lógica de domínio (funções puras)
- `nomeDuplicado(...)` → unicidade de nome de operador (Req 6.1.3).
- `ausenciaDuplicada(...)` → no máximo uma ausência por (pessoa, dia civil UTC).
- `relatorioAusencias(...)` → conta por pessoa dentro do período, ordena
  decrescente (desempate por `pessoaId`).
- `horarioParaMinutos(...)` / `classificarTurnoOperador(...)` → converte "HH:mm"
  e classifica o turno pelas fronteiras 10:00 e 13:00 (partição total/exclusiva).
- `estaTrabalhando(...)` / `contagemPorTurno(...)` → conta só quem trabalha; a
  soma por turno é sempre igual ao total.
- `analisarFaltas(...)` → analítica: taxa bruta e ponderada (justificadas pesam
  menos), dia recorrente, faltas em "emenda", maior sequência, tendência e risco.

## 7. Estados e enums
- `Turno`: `ABERTURA` (< 10:00) · `INTERMEDIARIO` (10:00–12:59) · `FECHAMENTO`
  (≥ 13:00).
- `StatusJustificativa`: `PENDENTE` · `JUSTIFICADA` · `INJUSTIFICADA` (ver
  `common/justificativas`). Transições: registro nasce `PENDENTE`; `PENDENTE →
  JUSTIFICADA` (com motivo) ou `→ INJUSTIFICADA`; reabrir volta a `PENDENTE`
  limpando motivo/auditoria.
- `RiscoFalta`: `BAIXO` · `MEDIO` · `ALTO` (semáforo da analítica).

## 8. Dados que o módulo toca
- **Escreve:** `Ausencia` (cria/atualiza/remove; grava `colaboradorId`).
- **Lê:** `Ausencia`, `Colaborador`, `Fiscal` (apenas fallback de nome),
  `OperadorTurno` (Quadro/roster).
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService`, `NotificacoesService` (avisos, opcional),
  `ValidacaoDataService` (data inicial), `CicloFolhaService` (ciclo aberto),
  `EscalaDomingoModule`, e o domínio de `common/justificativas`.
- **É usado por:** o app (Quadro de Operadores, painel de faltas) e indiretamente
  o Perfil Inteligente do colaborador (que consome assiduidade/faltas).

## 10. Regras de negócio-chave
1. **Uma ausência por pessoa/dia** (unicidade por dia civil).
2. **Ausência futura só com gerente/supervisor** (programação).
3. **Ausência a prazo é atômica** e conta todos os dias corridos (inclusive
   folga); só a gestão desmarca esses dias (fiscal não).
4. **Justificar exige motivo**; reabrir limpa o motivo e a auditoria.
5. **Ciclo de folha fechado bloqueia** registrar/remover/justificar faltas.
6. **Turno pela hora de entrada** (10:00 e 13:00 como fronteiras).
7. **Avisos são best-effort:** nunca impedem o registro da falta.
8. **Excluir ≠ justificar:** justificar/abonar mantém a falta com peso reduzido
   (2%/10%); **excluir** apaga a falta lançada por engano (peso zero, some do
   histórico) e é restrito a gerente/supervisor/administrador.

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `operadores.service.spec.ts` | Ausências, ciclo fechado e ausência a prazo | 10 |
| `ausencia-a-prazo-vinculo.spec.ts` | A prazo grava `colaboradorId` + `aPrazo` em cada dia | 1 |
| `remover-ausencia-periodo.spec.ts` | Anular a prazo por período (só `aPrazo`, ambas as chaves) | 3 |
| `operadores.properties.spec.ts` | Unicidade, relatório e turno (property-based) | 5 |
| `operadores.justificativa.spec.ts` | Taxa ponderada e justificativa com auditoria | 6 |
| `ausencia-a-prazo.spec.ts` | Proteção da falta a prazo (fiscal x gestão) | 3 |
| `operador-turno.roster-turno.spec.ts` | Turno do cadastro no roster do dia | 2 |
| `operadores.controller.spec.ts` | Contagem por turno e exclusão de falta restrita à gestão | 3 |
| `listar-ausencias-ficha.spec.ts` | Nome da falta resolvido pela ficha canônica (A.3) | 1 |

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- 🔧 **Modelo legado em transição:** o `Operador` simples foi removido e os
  operadores agora vêm do Cadastro Unificado (função `OPERADOR`); o
  `OperadorTurno` antigo coexiste — ver [ADR 0004](../02-arquitetura/decisoes/0004-cadastro-unificado-e-escala-opcao-a.md).
- 🔧 `operador-turno.service.ts` (892 linhas) concentra grade, roster, ao vivo e
  analítica; candidato a extrair sub-serviços.
- ⚠️ **`pessoaId` polimórfico:** uma ausência pode referenciar `Colaborador` ou
  `Fiscal`; a resolução do nome prefere a ficha canônica (`colaboradorId`) e usa
  o `Fiscal` só como fallback (Fase 4 · Opção A).
