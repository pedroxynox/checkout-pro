> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-11-22 · **Cobre:** `backend/src/jornada-vigencia/`

# Módulo: `jornada-vigencia`

## 1. Propósito
Dizer como é o dia de cada pessoa — folga, horário, carga, 100%, débito e regras do
contrato — **com o que valia naquele dia**, para que mudar contrato, folgas ou horário
não reescreva o passado ([ADR 0027](../02-arquitetura/decisoes/0027-vigencia-da-jornada.md),
spec [`jornada-5x2`](../../.kiro/specs/jornada-5x2/design.md)).

## 2. Responsabilidades e limites
- **Faz:** resolve a vigência de cada dia; responde a *jornada prevista do dia* em
  lote; hospeda a **regra única de folga** (`FolgaService`, que é uma fachada do
  consultor); dá a folga dia a dia de um período (`folgasNoPeriodo`); confere uma
  vigência (avisos) e a valida (erros).
- **Não faz:** calcular a jornada trabalhada (isso é [`ponto`](ponto.md)); configurar
  contratos ([`tipos-contrato`](tipos-contrato.md)) nem o rodízio
  ([`escala-domingo`](escala-domingo.md)).
- **Estado atual (Fase 1 do spec concluída):** todos os cálculos que decidem um dia
  perguntam à jornada prevista (ver "É usado por"). Ainda **não há escrita de
  vigências** pela API: ela entra com a tela da ficha (Fase 4). As regras do
  contrato de um dia vêm de `TiposContratoService.regrasDoColaborador(id, dia)`.

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas (aprox.) |
|---|---|---|
| `jornada-vigencia.domain.ts` | Domínio puro: `vigenciaNoDia`, `previstoNoDia`, `folgasFixasEfetivas`, `avisosDaVigencia`, `validarVigencia` (e reexporta `textoDuracao`) | 441 |
| `jornada-vigencia.service.ts` | `consultor(dias)` em lote (`previsto`, `ehFolga`, `semFolgaNaFicha`) e `folgasNoPeriodo` | 332 |
| `folga.service.ts` | **Regra única de folga**: fachada do consultor (veio de `escala-domingo`) | 60 |
| `jornada-vigencia.module.ts` | DI; importa `TiposContratoModule` e `EscalaDomingoModule`; exporta `JornadaVigenciaService` e `FolgaService` | 18 |

## 4. Endpoints (rotas HTTP)
Nenhum nesta fase.

## 5. Serviços e funções

### `JornadaVigenciaService.consultor(dias)`
- **Recebe:** os dias a responder.
- **Devolve:** `ConsultorJornada.previsto(ids, dia, ehFeriado?)` → `JornadaPrevista | null`.
- **Efeitos:** uma consulta por fonte — fichas legadas, vigências com início até o
  último dia (com a disponibilidade), `EscalaEntry` dos dias da semana, âncora de
  domingo (só se houver domingo), feriados do período — e as regras de cada contrato
  envolvido (`TiposContratoService.regrasDoContrato`, com cache).
- **Regras aplicadas:** `ids` aceita as identidades da pessoa (`Fiscal.id`,
  `Colaborador.id`), como o `FolgaService`. `ehFeriado` omitido usa o calendário
  carregado; informado, prevalece (para quem hoje ignora o feriado continuar igual).
- **Erros possíveis:** lança se o dia não estiver entre os carregados (âncora,
  escala semanal e feriados só foram lidos para eles).

### `ConsultorJornada.ehFolga(dia, ids)` e `semFolgaNaFicha(ids)`
`ehFolga` é `previsto(...).folga`, com o caso herdado do `FolgaService`: quem não tem
ficha entre os `ids` ainda folga se a escala semanal legada disser.
`semFolgaNaFicha`: no legado, ficha sem `folgaDiaSemana`; com vigência (a do último
dia carregado), sem grupo e sem folgas fixas.

### `JornadaVigenciaService.folgasNoPeriodo(ids, inicio, fim)`
Para quem tem vigência que já começou até `fim`, devolve `dia → folga?` (carregando
também a véspera e o dia seguinte, para a "emenda"). Quem não tem vigência fica fora
do mapa e o chamador segue a folga fixa. Usado pelas analíticas de faltas, pelo perfil
e pelas incidências.

### `FolgaService`
Fachada estável da regra única de folga (`consultor(dias)` e `ehFolga(dia, ids)`)
sobre o consultor. No regime legado a regra é a de sempre (ADR 0023): a ficha que
afirma folga decide sozinha; ficha omissa aceita a escala semanal; depois, o rodízio
de domingo.

## 6. Lógica de domínio (funções puras)
- `vigenciaNoDia(vigencias, dia)` — a de maior início que não passe do dia (hora
  ignorada, qualquer ordem).
- `previstoNoDia(pessoa, dia, ctx)` — **regime legado** (sem vigência): folga pela
  regra do `FolgaService` (a ficha que afirma folga decide sozinha; ficha omissa
  aceita a escala semanal), entrada/saída por `entradaEsperadaNoDia`/
  `saidaEsperadaNoDia`, contrato da ficha. **Regime semanal:** folgas do grupo
  (rodízio, Fase 3; sem rodízio vigente não afirma folga nem turno) ou folgas fixas
  (da ficha ou, vazias, as padrão do contrato); horário da disponibilidade do dia,
  inclusive em feriado; contrato da vigência. Nos dois: `cargaMs = cargaBaseDoDia`,
  `contaComo100 = diaPagaAdicional100`, `geraDebito = !contaComo100`,
  `escalado = !folga && entrada != null`.
- `avisosDaVigencia(vigencia, regras, folgasPadrao)` — `DIA_SEM_HORARIO`,
  `DISPONIBILIDADE_FORA_DA_CARGA` (o intervalo que a disponibilidade deixa,
  `saída − entrada − carga`, fora do mínimo–máximo do contrato; zero aceito em
  jornada curta sem intervalo obrigatório) e `SEM_FOLGA`. Não bloqueiam.
- `validarVigencia(entrada, limites)` — erros que bloqueiam: grupo inválido, folgas
  fixas com grupo, folga repetida/inválida/acima do máximo, sábado sem permissão,
  horário fora de `HH:mm`, saída ≤ entrada, dia repetido.
- `textoDuracao(min)` — "8h48", "2h", "50 min". Mora em
  [`common/duracao.ts`](common.md) e é reexportado aqui.
- Folgas padrão: com ficha vazia e sem grupo, `previstoNoDia`, `avisosDaVigencia`
  e `semFolgaNaFicha` usam `regras.folgasFixasPadrao` do contrato da vigência
  (Fase 2).

## 7. Estados e enums
- `RegimeJornada` (só no domínio): `LEGADO_6X1` (sem vigência no dia) · `SEMANAL`.
- `TipoAvisoJornada`: `DIA_SEM_HORARIO` · `DISPONIBILIDADE_FORA_DA_CARGA` · `SEM_FOLGA`.

## 8. Dados que o módulo toca
- Lê: `jornada_vigencias`, `disponibilidade_dias`, `colaboradores` (campos de escala e
  contrato), `escala_entries` (folga), `config_sistema` (âncora), `feriados`.
- Escreve: nada nesta fase.

## 9. Dependências
- **Depende de:** [`tipos-contrato`](tipos-contrato.md), [`escala-domingo`](escala-domingo.md)
  (âncora e funções de folga/horário), [`feriados`](feriados.md) (calendário),
  [`ponto`](ponto.md) (`RegrasContrato`, `cargaBaseDoDia`, `diaPagaAdicional100`).
- **É usado por:** [`central-jornada`](central-jornada.md) (cada dia do ciclo),
  [`compensacao-horas`](compensacao-horas.md), [`fiscais`](fiscais.md) (escala
  consolidada, equipe do dia, lembrete, relatórios de pontualidade),
  [`escala-exportacao`](escala-exportacao.md), [`operadores`](operadores.md) (quadro e
  analíticas), [`colaboradores`](colaboradores.md) (perfil),
  [`incidencias`](incidencias.md), [`alertas`](alertas.md) (saudação) e, pelo
  `FolgaService`, [`ponto`](ponto.md) (ponto em folga, detecção automática). Todos
  injetam o serviço como `@Optional()` e reproduzem a regra anterior quando ele não
  está presente (testes unitários antigos).

## 10. Regras de negócio-chave
1. **Cada dia usa o que valia nele.** A vigência do dia decide contrato, folgas e
   horário; corrigir um dia antigo usa as regras daquele dia.
2. **Sem vigência, nada muda.** O regime legado é o código de hoje sobre a ficha de
   hoje; os testes provam a igualdade com o `FolgaService` e as funções de horário.
3. **Feriado não dá folga e usa o horário do próprio dia** no regime semanal
   (decisão 9 do spec); carga e 100% vêm do contrato.
4. **Disponibilidade × carga tem tolerância do próprio contrato** (decisão 16): a
   equipe faz 2 h de intervalo e pode passar a 1 h ou 1h30 sem mudar nada.

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `jornada-vigencia.domain.spec.ts` | `vigenciaNoDia`; propriedade (500 casos) de que sem vigência o resultado é o de hoje, inclusive com vigências futuras; corte de 23/11; folgas fixas e padrão; grupo com e sem rodízio; feriado e domingo; avisos com a tolerância do contrato; validação; `textoDuracao` | 37 |
| `jornada-vigencia.service.spec.ts` | Consultor igual à regra de folga **anterior** (congelada no próprio teste) e às funções de horário sobre os mesmos dados; `ehFolga` sem ficha; `semFolgaNaFicha` no legado e com vigência; carga em lote; pessoa desconhecida e dia não carregado; vigência a partir da data; feriado do calendário × informado | 10 |
| `folga.service.spec.ts` | A regra única de folga (veio de `escala-domingo`), agora pela fachada: os mesmos 20 casos, sem mudar nenhuma expectativa | 20 |
| `consumidores-puros.spec.ts` | `montarLinhaEscala` com o turno já resolvido; dias escalados e "emenda" pela folga do dia no 5x2; `folgasNoPeriodo` só para quem tem vigência | 7 |

> Contagem sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- ⚠ **Ainda sem escrita pela API** (Fase 4). Uma vigência gravada direto no banco já
  muda os cálculos daquela pessoa, mas grupo sem rodízio de folgas (Fase 3) não afirma
  folga nem turno — não gravar à mão.
- 🔧 Os consumidores aceitam o serviço como `@Optional()` e mantêm o caminho antigo para
  os testes que não o injetam. Torná-lo obrigatório é parte da limpeza (Fase 7).
- 🔧 Comparação feita na Fase 1b: 155 leituras (Central, escala, quadro, exportação,
  compensação, perfil, incidências, ponto) sobre um banco com 8 pessoas e um ciclo
  inteiro, com `main` e com a branch — resultado idêntico.
- 🔧 O rodízio de folgas (Fase 3) entra pelo contexto de `previstoNoDia`
  (`folgasDoGrupo`). As folgas padrão do contrato já vêm de `RegrasContrato`
  (Fase 2).
- 🔧 O consultor carrega todas as fichas, como o `FolgaService`; as tabelas são
  pequenas (uma linha por pessoa e mudança).
