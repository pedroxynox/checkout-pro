# Fase 4 · Passo 1 — Inventário dos modelos legados de pessoas

> **Natureza deste passo:** apenas **leitura e documentação**. Nenhum dado é
> alterado, nenhuma tabela é migrada e nenhum comportamento muda. É o **mapa**
> que orienta os passos seguintes (4.2 a 4.6), que serão feitos um a um, em PRs
> próprios e reversíveis.

## 1. Objetivo

Mapear **quem** ainda depende dos modelos legados de pessoas
(`Operador`, `OperadorTurno`, `Fiscal`) e o que já existe no **Cadastro
Unificado de Colaboradores** (`Colaborador`), para retirar o legado de forma
segura, gradual e sem perda de histórico.

## 2. Resumo executivo (o que descobrimos)

1. **Dois dos três modelos legados já estão "mortos" no código.** `Operador`,
   `OperadorTurno` e o `RegistroOperacional` associado **não são mais lidos nem
   escritos** por nenhum serviço — sobraram apenas como tabelas com dados
   históricos. Retirá-los é de **baixo risco**.
2. **O legado que ainda pesa é o `Fiscal`** (39 usos no backend). É o verdadeiro
   trabalho desta fase.
3. **A escrita do `Fiscal` já está centralizada.** Só há dois pontos que gravam
   `Fiscal` no sistema inteiro, e ambos ficam **dentro do Cadastro Unificado**
   (`colaboradores.service.ts`). Ou seja: a "fonte de escrita" já é única.
4. **A ponte de dados já existe.** As tabelas que amarram ponto e escala ao id
   do fiscal (`RegistroPontoFiscal`, `EscalaEntry`) **já possuem uma coluna
   `colaboradorId`** em paralelo ao id legado. A transição já foi preparada;
   falta completá-la e cortar a dependência antiga.
5. **Achado de qualidade (bug do login) — JÁ RESOLVIDO.** A promoção de operador
   → fiscal exige a senha **antes** de alterar o cadastro (`colaboradores.service`
   `editar()`), evitando o estado em que o colaborador virava fiscal sem login. O
   registro `Fiscal` é criado/vinculado por `garantirFiscal()` a partir da conta.
   Nada mais a fazer aqui.

> **Progresso (Passo 4.2 — fase *expand*, concluída):** o `RegistroPontoFiscal`
> agora grava o `colaboradorId` em **registros novos** (dual-write), tanto pela
> ponte das batidas quanto pelo `definirStatus`. É aditivo (coluna anulável, já
> existente) e **não** toca dados históricos nem muda nenhuma leitura. Desbloqueia
> o backfill dos registros antigos (Passo 4.4).

## 3. Modelos legados e o seu estado

| Modelo (tabela) | Papel legado | Usos no código | Equivalente canônico | Risco de retirada |
|---|---|---|---|---|
| `Operador` (`operadores`) | Operador "só nome" do fluxo antigo de importação CSV/XLSX | **0** | `Colaborador` (funcao `OPERADOR`) | Baixo |
| `OperadorTurno` (`operador_turnos`) | Escala fixa do operador (horários/folga) | **0** | `Colaborador` (turno/horários/folga) | Baixo |
| `RegistroOperacional` (`registros_operacionais`) | Lançamentos do fluxo antigo de importação | **0** | `RegistroArrecadacao` | Baixo |
| `Fiscal` (`fiscais`) | Fiscal com turno, "especial" e vínculo de login | **39** | `Colaborador` (funcao `FISCAL`) | **Alto** (é o foco) |

### 3.1 O que o `Fiscal` guarda hoje e onde isso já existe no `Colaborador`

| Campo em `Fiscal` | Já existe em `Colaborador`? | Observação |
|---|---|---|
| `nome` (único) | Sim (`nome` + `matricula` única) | — |
| `turno` (`TurnoFiscal`) | Sim (`turno` `TurnoColaborador`) | Enums diferentes; há um adaptador (`turnoFiscalDe`). |
| `usuarioId` (login) | Sim (`usuarioId`, único) | Mesmo conceito de conta de acesso. |
| `especial` (Boolean) | **Não** | **Pendência**: decidir onde mora o "fiscal especial" ao migrar. |
| Relação `RegistroPontoFiscal` | Ponte via `colaboradorId` já criada | Ver seção 5. |
| Relação `RegistroOperacional` | — (fluxo antigo, morto) | Sai junto com o legado. |

## 4. Consumidores do `Fiscal` no backend

Total: **39 referências** a `prisma.fiscal` em **12 arquivos**. Destes, **apenas
2 são escrita** (ambos no Cadastro Unificado); o resto é **leitura**.

### 4.1 Escrita (fonte única — já centralizada)

| Arquivo | Operação | Função | O que faz |
|---|---|---|---|
| `colaboradores/colaboradores.service.ts` | `create` | `garantirFiscal()` | Cria o registro `Fiscal` quando o colaborador é fiscal e tem conta. |
| `colaboradores/colaboradores.service.ts` | `update` | `garantirFiscal()` | Vincula a conta a um `Fiscal` de mesmo nome já existente. |

> Nenhum outro serviço grava `Fiscal`. Isso torna o **Passo 4.3 (redirecionar a
> escrita)** curto: a escrita já é única; falta garantir que **toda** promoção/
> edição passe por aqui (incluindo o disparo após criar a senha).

### 4.2 Leitura (pontes a redirecionar para `Colaborador` funcao = `FISCAL`)

| Arquivo | Nº de leituras | Propósito |
|---|---|---|
| `fiscais/fiscais.service.ts` | 14 | Painel, jornada, ranking, "eu", equipe do dia (núcleo dos fiscais). |
| `colaboradores/colaboradores.service.ts` | 6 (4 leitura + 2 escrita) | Sincronizar/vincular o `Fiscal` a partir do cadastro. |
| `ponto/ponto.service.ts` | 4 | Resolver o fiscal do ponto (jornada do dia, batidas). |
| `fiscais/fiscais-alertas.service.ts` | 3 | Alertas de atraso/falta dos fiscais (cron). |
| `central-jornada/central-jornada.service.ts` | 2 | Incluir fiscais no ciclo de jornada. |
| `fiscais/escala.service.ts` | 2 | Escala consolidada/efetiva dos fiscais. |
| `assistente/assistente.service.ts` | 2 | Listar fiscais para o assistente. |
| `incidencias/incidencias.service.ts` | 2 | Incidências de escala por fiscal. |
| `alertas/saudacao-diaria.service.ts` | 1 | Saudação diária (busca o fiscal pela conta). |
| `fiscais/fiscais-horario.service.ts` | 1 | Horário/escala do fiscal. |
| `operadores/operadores.service.ts` | 1 | Leitura pontual de fiscal. |
| `ponto/ponto-ocr.service.ts` | 1 | Ligar o comprovante lido ao fiscal. |

## 5. Vínculos por id — o ponto mais delicado

Duas tabelas amarram registros ao **id do `Fiscal`**, e são o que exige mais
cuidado ao migrar:

| Tabela | Campo legado | Ponte já existente | Situação |
|---|---|---|---|
| `RegistroPontoFiscal` | `fiscalId` → `Fiscal.id` | `colaboradorId` (nullable) | **Vínculo completo:** dual-write nos novos (4.2) + backfill dos históricos (migração `9zzf`, 4.4). |
| `EscalaEntry` | `funcionarioId` → `Fiscal.id` | `colaboradorId` (nullable) | Sincronização do cadastro + backfill (`9zzf`) cobrem os históricos por conta/matrícula. |

> **Verificador (T.3):** `npm run integridade` (em `backend/`) cruza fiscais,
> contas e fichas e lista os vínculos órfãos (fiscal sem ficha, ficha sem
> registro, ponto/escala sem `colaboradorId`). Lógica pura em
> `src/fiscais/integridade-vinculo.ts`, coberta por testes.

**Consequência prática:** a migração **não** precisa "trocar ids no escuro". A
coluna `colaboradorId` já convive com o id legado; o Passo 4.4 é **completar o
preenchimento** dessa coluna (backfill) e **verificar a integridade** antes de
cortar a leitura por `fiscalId`/`funcionarioId`.

## 6. Consumidores no mobile

| Serviço/tela | Endpoints | Situação |
|---|---|---|
| `api/services/operadores.ts` + telas de operadores | `/operadores/ausencias`, `/quadro-operadores/*` | Já derivam do **Cadastro de Colaboradores** (não usam o modelo `Operador` legado). Sem ação. |
| `api/services/fiscais.ts` + `escalaService` + telas de fiscais | `/fiscais/*`, `/escala/*` | Servidos por `fiscais.service`, que hoje lê o modelo `Fiscal`. Acompanham a migração do backend de forma transparente (mesmos endpoints). |

Não há uso dos modelos `Operador`/`OperadorTurno` legados no aplicativo.

## 7. Ordem segura de retirada (roteiro dos próximos passos)

Cada item vira **um PR próprio**, com `npm run verify` + `npm run docs:check`
verdes, e só avança quando o anterior estiver estável.

1. **Retirar o legado morto (baixo risco) — parte do 4.5.** Remover `Operador`,
   `OperadorTurno` e `RegistroOperacional` (modelos, tabelas e tipos), depois de
   uma última confirmação de "zero leituras" e preservando um backup/histórico.
2. **Pontes de leitura (4.2).** Fazer os 11 arquivos de leitura obterem o fiscal
   a partir de `Colaborador` (funcao `FISCAL`), começando pelos de menor uso e
   deixando `fiscais.service.ts` (14 usos) por último.
3. **Escrita única + correção do login (4.3).** Garantir que toda promoção/
   edição de fiscal passe por `garantirFiscal()` **após** criar a conta;
   resolver a pendência do campo `especial`.
4. **Backfill + verificação de integridade (4.4 / T.3).** Completar
   `colaboradorId` em `RegistroPontoFiscal` e `EscalaEntry`; rodar um
   `verificar-integridade` que liste vínculos órfãos (fiscal sem colaborador e
   vice-versa) antes de cortar a dependência do id legado.
5. **Remover o `Fiscal` (4.5).** Depois que ninguém mais lê por `fiscalId`,
   remover o modelo, as rotas e telas que dele dependiam — um corte por vez, com
   testes.
6. **Atlas (4.6).** Atualizar os Atlas de
   [`operadores`](../../../docs/03-atlas-backend/operadores.md) e
   [`fiscais`](../../../docs/03-atlas-backend/fiscais.md).

## 8. Riscos e pendências identificados

- ⚠️ **`especial` não tem equivalente** no `Colaborador` — decidir o destino
  antes de migrar (campo novo, flag derivada ou descontinuar).
- ⚠️ **Enums de turno diferentes** (`TurnoFiscal` vs `TurnoColaborador`) — já há
  adaptador (`turnoFiscalDe`); confirmar cobertura de todos os valores.
- ⚠️ **Bug do login (promoção operador → fiscal)** — sincronização condicionada a
  já existir conta; alvo do Passo 4.3.
- ✅ **Baixo risco geral de dados** — a ponte `colaboradorId` já existe nas duas
  tabelas críticas; a migração completa, e não inicia, a transição.

## 8.1 Mapa completo do identificador `fiscal.id` (achado ao preparar o 4.3)

Ao preparar a redireção das leituras, confirmou-se que o `Fiscal.id` **é a
identidade da pessoa** em todo o subsistema de ponto/jornada — o `pessoaId`
polimórfico "solto" do ADR 0005. Isto é mais profundo do que "11 leitores": para
aposentar o `Fiscal`, essa identidade precisa migrar para `Colaborador.id` nas
tabelas abaixo.

| Tabela | Campo que hoje guarda `Fiscal.id` | Já tem coluna `colaboradorId`? |
|---|---|---|
| `registros_ponto_fiscal` | `fiscalId` | ✅ (dual-write + backfill `9zzf`) |
| `escala_entries` | `funcionarioId` | ✅ (sincronização + backfill `9zzf`) |
| `batidas_ponto` | `pessoaId` (tipoPessoa FISCAL) | ✅ (gravado em `registrarBatida`) |
| `ausencias` | `pessoaId` | ✅ (coluna existe) |
| `alertas_tac_enviados` | `pessoaId` | ❌ (só dedup diário — efêmero) |
| `eventos_alerta_tac` | `pessoaId` | ❌ (trilha append-only de alertas) |

**Leitura do achado:** a fundação de dados (coluna `colaboradorId`) já existe nas
tabelas que importam; as duas sem coluna são bookkeeping de alertas TAC (diário/
histórico, baixo impacto). O que falta é o passo **de código** mais delicado:
trocar, nas leituras, a identidade `fiscalId` por `colaboradorId` — e isso mexe
no **coração da jornada** (batidas, faltas, painel, status, escala).

## 8.2 Decisão de arquitetura (a alinhar antes do 4.3/4.5)

Duas estratégias, cada uma com seu perfil de risco:

- **Opção A — Aposentar o `Fiscal` de vez.** Migrar as leituras e a identidade de
  pessoa de `fiscal.id` → `colaborador.id` em ponto/escala/faltas/alertas e, por
  fim, remover o modelo `Fiscal`. **Ganho:** fonte de verdade única, de verdade.
  **Custo/risco:** alto — mexe no núcleo da jornada; exige migração cuidadosa,
  testes de regressão pesados e passos pequenos.
- **Opção B — Manter o `Fiscal` como "identidade de ponto" e limpar só o morto.**
  Aceitar o `fiscal.id` como o `pessoaId` polimórfico do ponto (ADR 0005) e focar
  em remover o legado **realmente morto** (`Operador`/`OperadorTurno`/
  `RegistroOperacional`, zero usos). **Ganho:** limpeza concreta e imediata.
  **Custo/risco:** baixo em código, mas a remoção **apaga dados históricos** —
  precisa de decisão do dono (hoje esses modelos são mantidos "para histórico").

**Recomendação:** avançar pela **Opção B primeiro** (ganho seguro e imediato,
com backup dos dados históricos antes do drop) e tratar a **Opção A** como um
épico próprio, com sessão dedicada — dado o risco no núcleo da jornada.

> **Decisão do dono:** seguir pela **Opção A** (aposentar o `Fiscal` de vez),
> **sem quebrar nada**, de forma planejada. O épico foi desenhado em sub-passos
> pequenos e reversíveis em
> [`fase4a-plano-aposentar-fiscal.md`](fase4a-plano-aposentar-fiscal.md). O
> Passo **A.1** (completar o vínculo `colaboradorId` nas faltas — escrita +
> backfill `9zzg` + verificador) já está concluído.

## 9. Rastreabilidade

- Requisitos: **R4.1**, **R4.2**, **R4.3** (ver `requirements.md`).
- Tarefas do roteiro: **4.1** (este documento) → **4.2** … **4.6** (ver
  `tasks.md`).
- Transversal: **T.3** (`verificar-integridade`).
