# Design — Jornada 5x2 (fim do 6x1)

> Requisitos e decisões do dono: [`requirements.md`](requirements.md). Tarefas:
> [`tasks.md`](tasks.md). Mapa do código atual: seção 10.

## 1. Princípio

Quatro peças, cada uma com uma responsabilidade:

| Peça | Responde | Onde vive |
|---|---|---|
| **Tipo de contrato** | *Quais são as regras?* (carga por dia, feriado, 100%, intervalo, TAC, folgas por semana) | `TipoContratoJornada` (já existe; ganha campos) |
| **Vigência da jornada** | *Desde quando esta pessoa tem este contrato, este grupo, estas folgas e esta disponibilidade?* | `JornadaVigencia` + `DisponibilidadeDia` (novas) |
| **Rodízio de folgas** | *Em que dias cada grupo folga em cada semana?* | `RodizioFolgasVigencia` (nova) |
| **Jornada prevista do dia** | *Neste dia, esta pessoa folga? A que horas entra e sai? Qual a carga? Paga 100%? Gera débito? Com que regras?* | domínio puro `jornada-vigencia.domain.ts` + `JornadaVigenciaService.consultor` |

**Regra de ouro:** nenhum cálculo lê mais a ficha atual (`Colaborador.folgaDiaSemana`,
`entradaSemana`…, `tipoContratoJornadaId`) para decidir um dia. Todo consumidor
pergunta à **jornada prevista do dia**. É isso que protege o passado (R1.2).

## 2. Modelo de dados

### 2.1 Vigência da jornada (Fase 1)

```prisma
enum RegimeJornada {
  LEGADO_6X1 // ficha antiga: folga fixa única + blocos Seg–Qui/Sex–Sáb/Dom + rodízio só de domingo
  SEMANAL    // 5x2: disponibilidade por dia + grupo (rodízio de folgas) ou folgas fixas
}

/// A partir de `vigenteDesde`, os dias do colaborador são calculados com ESTA
/// linha, até a próxima vigência. A primeira (base) começa em 1970-01-01.
model JornadaVigencia {
  id            String        @id @default(uuid())
  colaboradorId String
  colaborador   Colaborador   @relation(fields: [colaboradorId], references: [id], onDelete: Cascade)
  /// Dia civil (00:00 UTC, mesmo rótulo das demais datas de negócio).
  vigenteDesde  DateTime
  regime        RegimeJornada

  tipoContratoJornadaId String
  tipoContratoJornada   TipoContratoJornada @relation(fields: [tipoContratoJornadaId], references: [id])

  /// 'G1' | 'G2' | 'G3' | null. Em LEGADO_6X1 é o grupo do rodízio de DOMINGO
  /// (âncora em ConfigSistema); em SEMANAL é o grupo do rodízio de FOLGAS.
  grupo         String?
  /// SEMANAL sem grupo: até `folgasPorSemana` dias (0=domingo). Vazio = padrão do contrato.
  folgasFixas   Int[]         @default([])

  /// Cópia congelada da ficha antiga (só LEGADO_6X1).
  legadoFolgaDiaSemana Int?
  legadoEntradaSemana  String?
  legadoSaidaSemana    String?
  legadoEntradaFds     String?
  legadoSaidaFds       String?
  legadoEntradaDom     String?
  legadoSaidaDom       String?

  disponibilidade DisponibilidadeDia[]

  motivo        String?
  criadoPor     String?   // login
  criadoEm      DateTime  @default(now())
  atualizadoPor String?
  atualizadoEm  DateTime  @default(now()) @updatedAt

  @@unique([colaboradorId, vigenteDesde])
  @@index([colaboradorId])
  @@map("jornada_vigencias")
}

/// Disponibilidade de um dia da semana (só regime SEMANAL). Sem linha = sem horário.
model DisponibilidadeDia {
  id         String          @id @default(uuid())
  vigenciaId String
  vigencia   JornadaVigencia @relation(fields: [vigenciaId], references: [id], onDelete: Cascade)
  diaSemana  Int             // 0=domingo … 6=sábado
  entrada    String          // "HH:mm"
  saida      String          // "HH:mm" (> entrada; turnos que cruzam a meia-noite não são tratados)

  @@unique([vigenciaId, diaSemana])
  @@map("disponibilidade_dias")
}
```

- `TipoContratoJornada` ganha a relação inversa `vigencias JornadaVigencia[]`; o
  **Restrict** continua impedindo remover contrato em uso.
- `turno` **fica no `Colaborador`** (não entra no cálculo de horas; só agrupa a
  escala).
- `Colaborador.tipoContratoJornadaId`, `folgaDiaSemana`, `grupoDomingo` e os seis
  horários **ficam no banco** até a limpeza (Fase 7), mas deixam de ser lidos
  pelos cálculos. Enquanto a pessoa só tiver a vigência base `LEGADO_6X1`, a
  edição pelo app antigo **espelha** os campos na vigência base (o mesmo efeito
  retroativo de hoje, nada pior). Com uma vigência SEMANAL, a API **recusa**
  editar esses campos legados (409, "atualize o app").

**Migração da Fase 1** (`9zzu_jornada_vigencia`, aditiva): cria as tabelas e, para
cada colaborador, uma vigência `LEGADO_6X1` com `vigenteDesde = 1970-01-01`,
`tipoContratoJornadaId`, `grupo = grupoDomingo` e os campos `legado*` copiados da
ficha. Nenhum número muda.

### 2.2 Tipo de contrato (Fase 2)

Campos novos em `TipoContratoJornada` (migração `9zzv_contrato_5x2`, aditiva):

| Campo | Tipo | Padrão no banco | No 6x1 existente | Uso |
|---|---|---|---|---|
| `cargaFeriadoMin` | `Int` | 440 | 440 | carga do feriado (hoje `CARGA_FERIADO_MS` fixo) |
| `feriadoAdicional100` | `Boolean` | true | true | chip "Feriado" em "Dias com adicional de 100%" |
| `limiteTrabalhoDiaMin` | `Int?` | null | null | TAC se trabalhado > limite (null = sem verificação) |
| `intervaloPrevistoMin` | `Int` | 60 | 120 | só para conferir disponibilidade × carga |
| `folgasPorSemana` | `Int` | 1 | 1 | máximo de folgas fixas; 5x2 = 2 |
| `folgasFixasPadrao` | `Int[]` | `{}` | `{}` | folgas de quem não tem grupo e deixou a ficha vazia |
| `permiteFolgaSabado` | `Boolean` | false | false | sábado como folga fixa |

- `riscoTac1h30Min` e `riscoTac1h40Min` **mantêm o nome** no banco e na API
  (o APK antigo os envia), mas passam a significar **1º e 2º aviso preventivo**
  (minutos de extra). A tela mostra "1º aviso" e "2º aviso".
- `trabalhaDomingo` fica só para o regime `LEGADO_6X1`; o regime SEMANAL o ignora.
  Some da tela para contratos novos.
- Criar contrato pela API usa padrão `folgasPorSemana = 2`.
- **Contrato em uso** (alguma vigência o referencia) tem as **regras de cálculo
  travadas** (R2.8). A resposta de `GET /tipos-contrato` ganha `emUso: boolean`.
  Para mudar regras: `POST /tipos-contrato/:id/duplicar` e transferir (Fase 6).

`RegrasContrato` (`ponto.domain.ts`) ganha `feriadoAdicional100`,
`limiteTrabalhoDiaMs: number | null` e passa a receber `cargaFeriadoMs` do banco
(adapter). `diaPagaAdicional100` vira
`regras.temAdicional100(dia) || (ehFeriado && regras.feriadoAdicional100)`.

### 2.3 Rodízio de folgas (Fase 3)

```prisma
/// Rodízio de folgas por grupo. A semana vai de segunda a domingo; a semana 1
/// começa em `vigenteDesde` (uma segunda-feira) e o ciclo tem `semanasNoCiclo`.
model RodizioFolgasVigencia {
  id             String   @id @default(uuid())
  vigenteDesde   DateTime @unique
  semanasNoCiclo Int
  /// { "G1": [[4,5],[2,3],[1,0]], "G2": [[2,3],[1,0],[4,5]], "G3": [[1,0],[4,5],[2,3]] }
  /// índice externo = semana do ciclo (0 = semana 1); dias 0=domingo … 6=sábado.
  padrao         Json
  criadoPor      String?
  criadoEm       DateTime @default(now())

  @@map("rodizio_folgas_vigencias")
}
```

A migração `9zzw_rodizio_folgas` semeia a vigência de **2026-11-23** com o padrão
acima (decisão 5). O rodízio antigo de domingo (`ConfigSistema.domingoAncora*`)
**não é apagado**: continua valendo para as vigências `LEGADO_6X1`.

## 3. Domínio puro (`backend/src/jornada-vigencia/jornada-vigencia.domain.ts`)

Sem Prisma, sem relógio. Testes de propriedade (ADR 0003).

```ts
type Grupo = 'G1' | 'G2' | 'G3';

interface VigenciaJornada {
  id: string;
  vigenteDesde: Date;            // 00:00 UTC
  regime: 'LEGADO_6X1' | 'SEMANAL';
  tipoContratoJornadaId: string;
  grupo: Grupo | null;
  folgasFixas: number[];
  legado: FichaEscalaTurno | null;            // só LEGADO_6X1 (tipo de escala-domingo.domain)
  disponibilidade: Map<number, { entrada: string; saida: string }>; // só SEMANAL
}

interface RodizioFolgas {
  vigenteDesde: Date;            // segunda-feira
  semanasNoCiclo: number;
  padrao: Record<Grupo, number[][]>;
}

interface JornadaPrevista {
  vigenciaId: string;
  regime: 'LEGADO_6X1' | 'SEMANAL';
  tipoContratoJornadaId: string;
  regras: RegrasContrato;
  grupo: Grupo | null;
  folga: boolean;
  entrada: string | null;        // null = sem turno afirmado (folga, sem horário, sem âncora/rodízio)
  saida: string | null;
  cargaMs: number;
  contaComo100: boolean;
  geraDebito: boolean;           // = !contaComo100
}

vigenciaNoDia(vigencias, dia): VigenciaJornada | null      // maior vigenteDesde <= dia
segundaDaSemana(dia): Date                                  // dia − ((dow + 6) % 7)
rodizioNoDia(rodizios, dia): RodizioFolgas | null
semanaDoCiclo(rodizio, dia): number                         // floor(semanas desde o início) mod semanasNoCiclo
folgasDoGrupoNaSemana(rodizio, grupo, dia): number[]
gruposDeFolgaNoDia(rodizio, dia): Grupo[]
folgasFixasEfetivas(vigencia, contrato): number[]           // ficha ou, vazia, folgasFixasPadrao
validarRodizio(rodizio): { erros: string[]; avisos: string[] }         // R3.3 / R3.4
avisosDaVigencia(vigencia, contrato, rodizio): AvisoJornada[]          // R4.6
previstoNoDia(vigencia, dia, ctx): JornadaPrevista
```

### 3.1 Algoritmo de `previstoNoDia`

```
ctx = { regras(contratoId), ehFeriado, ancoraDomingo, rodizioNoDia, folgaEscalaEntry? }
contrato   = ctx.regras(v.tipoContratoJornadaId)
dow        = dia.getUTCDay()
cargaMs    = cargaBaseDoDia(dow, ehFeriado, contrato)        // feriado → contrato.cargaFeriadoMs
contaCom100= diaPagaAdicional100(dow, ehFeriado, contrato)

se v.regime == LEGADO_6X1:
   // EXATAMENTE a regra de hoje (FolgaService + escala-domingo.domain):
   folga   = ficha afirma folga (legadoFolgaDiaSemana != null) ? ehDiaDeFolga(legado, dia, ancora)
           : ctx.folgaEscalaEntry(dia) ?? ehDiaDeFolga(legado, dia, ancora)
   entrada = folga ? null : entradaEsperadaNoDia(legado, dia, ancora, ehFeriado)
   saida   = folga ? null : saidaEsperadaNoDia(legado, dia, ancora, ehFeriado)

se v.regime == SEMANAL:
   se v.grupo:
       r = ctx.rodizioNoDia(dia)
       se !r: folga = false; entrada = saida = null      // não afirma (igual a "sem âncora" hoje)
       senão: folga = folgasDoGrupoNaSemana(r, v.grupo, dia).includes(dow)
   senão:
       folga = folgasFixasEfetivas(v, contrato).includes(dow)
   d = v.disponibilidade.get(dow)                        // feriado usa a do próprio dia (decisão 9)
   entrada = folga ? null : d?.entrada ?? null
   saida   = folga ? null : d?.saida ?? null

geraDebito = !contaCom100
```

Comportamentos mantidos de propósito: feriado **não** dá folga; ponto em dia de
folga é aceito e apontado (ADR 0019) e o dia é calculado com a carga do dia da
semana, como hoje; sem turno afirmado não se cobra ponto (ADR 0026).

### 3.2 Avisos da vigência (R4.6)

Para cada dia da semana que **pode** ser de trabalho (com grupo: todos os dias em
que o grupo não folga em pelo menos uma semana do ciclo, ou seja, todos; sem
grupo: os que não são folga fixa):

- `DIA_SEM_HORARIO` — sem disponibilidade.
- `DISPONIBILIDADE_DIFERENTE_DA_CARGA` — `(saida − entrada − intervaloPrevisto) ≠
  carga do dia` (informa os dois valores).
- `SEM_FOLGA` — sem grupo e sem folgas fixas (nem na ficha nem no contrato).

Avisos não bloqueiam. Bloqueiam (400): horário fora de `HH:mm`, só entrada ou só
saída, saída ≤ entrada, folgas fixas acima de `folgasPorSemana`, sábado sem
`permiteFolgaSabado`, grupo inválido, grupo sem rodízio vigente na data.

## 4. Serviço (`backend/src/jornada-vigencia/`)

`JornadaVigenciaService` (módulo `JornadaVigenciaModule`, exporta o serviço):

- `consultor(inicio, fimExclusivo)` → carrega **de uma vez** (sem N+1) as
  vigências e disponibilidades de todos os colaboradores, os rodízios, a âncora de
  domingo, os feriados do período, as regras de cada contrato usado e (só para
  LEGADO) as folgas de `EscalaEntry`. Devolve um objeto síncrono:
  - `previsto(ids, dia): JornadaPrevista | null` — `ids` aceita as mesmas
    identidades que `FolgaService.ehFolga` (Colaborador.id e Fiscal.id); resolve a
    ficha pelo vínculo existente (`colaborador-vinculo.ts`).
  - `vigencia(ids, dia)`.
- `regrasNoDia(colaboradorId, dia)` — substitui `TiposContratoService.regrasDoColaborador`.
- CRUD: `listar(colaboradorId)`, `gravar(colaboradorId, dto, autor)` (upsert por
  data), `remover(vigenciaId, autor)`; todos chamam
  `CicloFolhaService.exigirCicloAberto(vigenteDesde)` (R1.4) e devolvem os avisos.
- `FolgaService` passa a ser um adaptador fino sobre o consultor (mantém a
  interface `consultor(dias)`/`ehFolga`/`semFolgaNaFicha` para reduzir a mudança
  nos consumidores).

## 5. TAC e avisos (Fase 2)

- `calcularJornadaDia` acrescenta o motivo de limite diário:
  `limiteTrabalhoDiaMs != null && trabalhado > limiteTrabalhoDiaMs`.
- Os motivos passam a ser montados com os números do contrato:
  `Excedeu {limiteExtras} de horas extras`, `Intervalo abaixo de {intervaloMinimo}`,
  `Intervalo acima de {intervaloMaximo}`, `Trabalhou {trabalhado}, acima do limite
  de {limiteTrabalhoDia}`. **Para o 6x1 o texto gerado deve ser idêntico ao
  atual** ("Excedeu 1h50 de horas extras", "Intervalo abaixo de 1h", "Intervalo
  acima de 3h"); os testes existentes provam isso.
- `etapaAlertaTac(horasExtrasMs, tac, regras)` usa `regras.riscoTac1h30Ms` e
  `riscoTac1h40Ms`. Os valores do enum `EtapaAlertaTac` (`RISCO_1H30`,
  `RISCO_1H40`, `TAC`) **não mudam** no banco; só os rótulos e as mensagens
  (`ponto.service.ts`, `conteudoAlertaTac`), que passam a citar os minutos do
  contrato e a diferença até o limite.
- A resposta da jornada do dia (`JornadaPontoView`) ganha `regrasResumo`
  (limites em minutos) para o app parar de mostrar "1h50/1h/3h" fixos
  (`RegistroPontoScreen.tsx`).

## 6. API

| Método e rota | Permissão | Fase | O quê |
|---|---|---|---|
| `GET /colaboradores/:id/jornada` | `COLABORADORES_PERFIL` ou `OPERADORES_CRUD` | 1 | vigente, histórico de vigências, próximas folgas (14 dias) |
| `PUT /colaboradores/:id/jornada` | `OPERADORES_CRUD` | 1 | grava a vigência de `aPartirDe` (upsert); devolve `{ vigencia, avisos }` |
| `DELETE /colaboradores/:id/jornada/:vigenciaId` | `OPERADORES_CRUD` | 1 | remove (nunca a base; nunca em ciclo fechado) |
| `PATCH /tipos-contrato/:id/padrao` | `ADMIN_DADOS` | 2 | troca o contrato padrão |
| `POST /tipos-contrato/:id/duplicar` | `ADMIN_DADOS` | 2 | cópia inativa e editável |
| `GET/PUT /config/rodizio-folgas` | `ESCALA_DOMINGO_CONFIG` | 3 | vigências do rodízio, validação e prévia |
| `POST /tipos-contrato/:id/transferir` | `ADMIN_DADOS` | 6 | `{ destinoId, aPartirDe }`: nova vigência para todos que estão no contrato na data, copiando grupo/folgas/disponibilidade |

Corpo de `PUT /colaboradores/:id/jornada`:

```json
{
  "aPartirDe": "2026-11-23",
  "tipoContratoJornadaId": "…",
  "grupo": "G1",
  "folgasFixas": [],
  "disponibilidade": [{ "diaSemana": 1, "entrada": "06:50", "saida": "16:38" }],
  "motivo": "Fim do 6x1"
}
```

`POST /colaboradores` passa a aceitar o mesmo bloco `jornada` (Fase 4); sem ele,
grava a vigência base a partir dos campos legados (compatibilidade com o APK).

## 7. App (mobile)

| Tela | Mudança | Fase |
|---|---|---|
| `centroControle/TiposContratoScreen.tsx` | campos novos; chip **Feriado** em 100%; "1º/2º aviso"; regras travadas quando `emUso`; Duplicar; Tornar padrão; sem "Trabalha domingo (2x1)" em contratos novos | 2 |
| `centroControle/ConfigEscalaDomingoScreen.tsx` → **Rodízio de folgas** | tabela grupo × semana com chips de dias, início (segunda), prévia por dia, avisos de R3.4; card do Centro de Controle renomeado | 3 |
| `colaboradores/GestaoColaboradoresScreen.tsx` | sai folga fixa e os três blocos; fica turno; **disponibilidade** Seg…Dom com botão "copiar a primeira para todas"; grupo (G1/G2/G3/Sem grupo); **Folgas fixas** só sem grupo; contrato; campo **"Vale a partir de"** quando algo da jornada mudou; mostra os avisos | 4 |
| `colaboradores/PerfilColaboradorScreen.tsx` | card Escala: disponibilidade por dia, grupo, próximas folgas, contrato vigente (desde), histórico | 4 |
| `operadores/OperadoresScreen.tsx` (aba **Escalas**) | selo "Folga hoje: Gx" em **todo** dia (não só domingo) e quem folga por folga fixa; horários da disponibilidade; **remover** os cards "Faltas do mês" e "Não-retornos do mês" | 5 |
| `escala/EscalaScreen.tsx`, `utils/escalaLayout.ts` | mesmo selo por dia; aviso "sem folga" no novo modelo | 5 |
| `escala/ConferenciaEscalaScreen.tsx` | avisos de R4.6 por pessoa | 5 |
| `ponto/CentralJornadaScreen.tsx`, `DetalheJornadaScreen.tsx` | tirar "Aplica-se ao contrato 6x1-2x1"; `aceitaDebito` passa a usar `dia.geraDebito` do backend | 5 |
| `ponto/RegistroPontoScreen.tsx` | textos de TAC/100% a partir de `regrasResumo` | 2 |
| `api/types.ts`, `api/services/*` | espelhos dos tipos e endpoints novos | todas |

Ordem visual da disponibilidade: **Seg, Ter, Qua, Qui, Sex, Sáb, Dom** (semana
de segunda a domingo); no banco `diaSemana` segue 0 = domingo.

## 8. Pausa de transição (Fase 0)

Variável `PAUSA_TRANSICAO_JORNADA` (`'true' | 'false'`, validada no boot).
Função pura `pausaTransicaoJornadaAtiva()` em `backend/src/common/transicao-jornada.ts`,
lida a cada chamada (os testes ligam/desligam por `process.env`). Com ela ligada:

| Onde | O que deixa de fazer |
|---|---|
| `ponto/ponto-deteccao-automatica.service.ts` | falta automática e aviso de atraso de 1h (não-retorno, revalidação e autocura seguem) |
| `ponto/ponto-alertas.service.ts` e `ponto.service.ts` (`avisarAlertaTacSeNecessario`) | avisos de TAC (cron e batida) |
| `ponto.service.ts` (`avisarPontoEmFolga`) | aviso de ponto em dia de folga |
| `fiscais/fiscais-alertas.service.ts` | folga sugerida por excesso de extras; análise semanal de padrões |
| `operadores/operador-turno.service.ts` | aviso de cobertura baixa (07:00) |
| `fiscais/fiscais-horario.service.ts`, `alertas/saudacao-diaria.service.ts` | lembrete de 10 min e saudação de entrada dos fiscais |

O registro de ponto não muda. Ao subir, a API registra no log que a pausa está
ativa. **Desligar** quando as Fases 1–4 estiverem publicadas e as vigências de
23/11 carregadas. Os dias pausados ficam sem falta automática: ausência real
nesse período é lançada à mão (com o ciclo aberto). Até a Fase 1, lançar falta
num dia que era a folga antiga é recusado (`FaltaEmDiaDeFolgaError`); depois da
vigência, pode-se lançar retroativamente.

## 9. Validação e riscos

- **Regressão do legado (Fase 1):** teste de propriedade — para fichas e datas
  aleatórias em `LEGADO_6X1`, `previstoNoDia` == `ehDiaDeFolga` /
  `entradaEsperadaNoDia` / `saidaEsperadaNoDia` / `cargaBaseDoDia` atuais. O
  `contrato-6x1-congelado.spec.ts` continua passando.
- **Comparação com cópia do banco (Fase 1, antes do deploy):** restaurar o export
  do Render num PostgreSQL local, rodar a Central (`resumoCiclo(0)`,
  `resumoCiclo(-1)`, `exportacao`, `inconsistencias`) em `main` e na branch, e
  comparar o JSON: diferença tem de ser vazia.
- **Vigência retroativa:** ao gravar 23/11 depois do dia 23, as ocorrências
  automáticas que deixaram de ser verdade são limpas pela revalidação (ciclo
  aberto), porque ela passa a perguntar ao consultor. Com a pausa ligada, quase
  não haverá o que limpar.
- **Ciclo fechado:** se 26/10–25/11 for fechado antes das vigências, a gravação de
  23/11 é recusada; será preciso reabrir (administrador).
- **Compensações aprovadas** guardam minutos calculados com a carga do momento.
  Conferir que não há compensação aprovada para dias ≥ 23/11 antes de carregar as
  vigências.
- **APK antigo:** respostas mantêm `folgaDiaSemana`, `entradaSemana`…,
  `grupoFolgaDomingo` até a Fase 7; escrever campos legados em quem já tem vigência
  SEMANAL devolve 409.
- **Desempenho:** o consultor carrega tudo por período em poucas consultas; as
  tabelas são pequenas (uma linha por pessoa e mudança).

## 10. Mapa do código atual (onde está o acoplamento ao 6x1)

Levantado em 22/11/2026 (`main` em `f3ebcdc`). Use os nomes de função; as linhas
mudam.

**Núcleo de folga e horário**
- `escala-domingo/escala-domingo.domain.ts`: `ehDiaDeFolga` (uma folga; domingo
  pelo rodízio), `entradaEsperadaNoDia`/`saidaEsperadaNoDia` (Seg–Qui / Sex–Sáb /
  Dom; feriado = horário de domingo), `minutosDeAtraso` (`TOLERANCIA_ATRASO_MIN`),
  `GRUPOS_DOMINGO`, `grupoFolgaNoDomingo`.
- `escala-domingo/folga.service.ts`: regra única de folga (ficha × `EscalaEntry`).
- `escala-domingo/escala-domingo.service.ts`: âncora em `ConfigSistema`.

**Contrato e jornada**
- `ponto/ponto.domain.ts`: `RegrasContrato`, `REGRAS_SEIS_X_UM_DOIS_X_UM`/`REGRAS_PADRAO`,
  `CARGA_FERIADO_MS`, `RISCO_TAC_*`, `diaPagaAdicional100`, `cargaBaseDoDia`,
  `calcularJornadaDia` (textos fixos), `etapaAlertaTac` (constantes).
- `tipos-contrato/tipos-contrato.adapter.ts` (feriado fixo),
  `tipos-contrato.service.ts` (`regrasDoContrato`, `regrasDoColaborador`, cache,
  `validarCoerencia`, sem endpoint de padrão).
- `fiscais/fiscais.domain.ts`: `jornadaEsperadaMs` (7h/8h/7h20), `isDomingo`.

**Consumidores a migrar para a jornada prevista**
- `ponto/ponto.service.ts`: `registrarBatida` (regras, intervalo máximo),
  `ehPontoEmFolga`, `jornadaDoDia`, `sugerirNovaFolga`, `conteudoAlertaTac`.
- `ponto/ponto-deteccao-automatica.service.ts` (`carregarFatosDoPeriodo`),
  `ponto/sugestao-folga.domain.ts`.
- `fiscais/fiscais.service.ts`: `escaladosDoDia`, `regrasDe`, usos de
  `jornadaEsperadaMs`; `fiscais-alertas.service.ts`; `fiscais-horario.service.ts`;
  `turno-fiscal.ts`/`turno-fiscal.consulta.ts`; `escala.service.ts`;
  `conferencia-escala.service.ts`; `integridade-escala.ts`; `escala.domain.ts`
  (`gerarEscalaSemanalFiscal`).
- `central-jornada/central-jornada.service.ts`: `carregarCiclo`,
  `carregarCicloDaPessoa`, `regrasDe`, `calcularPessoa`, `escaladoNoDia`,
  inconsistências (`DUPLICADA` usa constante global), sugestão de folga.
- `compensacao-horas/compensacao-horas.service.ts` (domingo fixo no laço de dias,
  `regrasDe`, `entradaDoDia`) e `compensacao-horas.domain.ts`.
- `operadores/operador-turno.service.ts` (roster, grade, `analiticaFaltas`,
  `comoOperadorTurno`), `operadores/operadores.domain.ts` (`contarDiasEscalados`,
  emenda em `analisarFaltas`), `operadores.service.ts` (`FaltaEmDiaDeFolgaError`).
- `colaboradores/colaboradores.service.ts` (`cadastrar`, `editar`,
  `grupoDomingoEfetivo`, `idContratoPadrao`, `sincronizarEscalaFiscal`),
  `perfil-colaborador.domain.ts`/`.service.ts` (`contarDiasEscalados`).
- `incidencias/incidencias.service.ts` (`contarDiasEscalados`).
- `escala-exportacao/escala-exportacao.service.ts`, `escala-publicada.domain.ts`.
- `alertas/saudacao-diaria.service.ts`.

**Mobile**: ver tabela da seção 7.
