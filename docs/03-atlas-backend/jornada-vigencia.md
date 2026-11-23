> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-11-23 · **Cobre:** `backend/src/jornada-vigencia/`

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
  vigência (avisos) e a valida (erros); **lê, grava e remove as vigências pela
  ficha** (`/colaboradores/:id/jornada`, Fase 4).
- **Não faz:** calcular a jornada trabalhada (isso é [`ponto`](ponto.md)); configurar
  contratos ([`tipos-contrato`](tipos-contrato.md)) nem o rodízio
  ([`escala-domingo`](escala-domingo.md)).
- **Estado atual (Fase 4a do spec):** todos os cálculos que decidem um dia
  perguntam à jornada prevista (ver "É usado por"). A escrita das vigências pela
  API existe (`JornadaColaboradorService`); a tela da ficha que a usa entra na
  Fase 4b. As regras do contrato de um dia vêm de
  `TiposContratoService.regrasDoColaborador(id, dia)`.

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas (aprox.) |
|---|---|---|
| `jornada-vigencia.domain.ts` | Domínio puro: `vigenciaNoDia`, `previstoNoDia`, `folgasFixasEfetivas`, `avisosDaVigencia`, `validarVigencia`, `disponibilidadePreenchida` (e reexporta `textoDuracao`) | 477 |
| `jornada-vigencia.service.ts` | `consultor(dias)` em lote (`previsto`, `ehFolga`, `semFolgaNaFicha`, com o rodízio de folgas) e `folgasNoPeriodo` | 354 |
| `jornada-colaborador.service.ts` | A jornada pela ficha: `obter` (vigente, histórico, próximas folgas), `gravar`, `validarNoCadastro`/`gravarPlano` (cadastro) e `remover` | 517 |
| `jornada-colaborador.controller.ts` | Rotas `GET/PUT/DELETE /colaboradores/:id/jornada`; `autorDaJornada` (login e se pode trocar o contrato) | 80 |
| `dto/jornada-colaborador.dto.ts` | `GravarJornadaDto` (PUT), `JornadaDoCadastroDto` (bloco do POST), `DisponibilidadeDiaDto` | 86 |
| `folga.service.ts` | **Regra única de folga**: fachada do consultor (veio de `escala-domingo`) | 61 |
| `jornada-vigencia.module.ts` | DI; importa `TiposContratoModule`, `EscalaDomingoModule`, `CicloFolhaModule` e `AcessosModule`; exporta `JornadaVigenciaService`, `FolgaService` e `JornadaColaboradorService` | 28 |

## 4. Endpoints (rotas HTTP)
> Lista canônica em [API HTTP](../05-referencia-dados/api-http.md).

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `GET /colaboradores/:id/jornada` | `COLABORADORES_PERFIL` ou `OPERADORES_CRUD` | Vigente (a de hoje em Brasília), contrato vigente e desde quando, histórico de vigências (da mais nova, com as futuras) e próximas folgas (14 dias). |
| `PUT /colaboradores/:id/jornada` | `OPERADORES_CRUD` (trocar o contrato exige também `ADMIN_DADOS`) | Grava a vigência de `aPartirDe` (upsert por pessoa e data); devolve `{ vigencia, avisos }`. |
| `DELETE /colaboradores/:id/jornada/:vigenciaId` | `OPERADORES_CRUD` (se a remoção muda o contrato, `ADMIN_DADOS`) | Remove uma vigência; devolve a jornada como ficou. |

Corpo do `PUT` (o bloco `jornada` do `POST /colaboradores` é o mesmo, com
`aPartirDe` opcional):

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

### `ConsultorJornada.gruposDeFolga(dia)` (Fase 5)
Os grupos que folgam no dia pelo rodízio de folgas vigente (vazio no sábado), ou
`null` quando nenhum rodízio vale no dia. A escala e o quadro usam para o selo
"folga: Gx" em qualquer dia (`gruposFolgaDoDia`, em
[`escala-exportacao`](escala-exportacao.md)).

### `JornadaColaboradorService.conferirEquipe()` (Fase 5)
Para a Conferência de escala ([`fiscais`](fiscais.md)): ativos escalados
(operador, fiscal, supervisor) **sem vigência** e os avisos de R4.6 da vigência
**mais recente** (inclusive futura) de cada um. Só lê.

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

### `JornadaColaboradorService` (a jornada pela ficha, Fase 4)

#### `obter(colaboradorId, hoje = diaCivilBrasilia())`
- **Devolve:** `JornadaDoColaborador` — `regimeHoje` (`LEGADO_6X1` sem vigência que
  já começou), `vigente`, `contratoVigente { id, nome, desde }` (`desde` = início da
  sequência de vigências com o mesmo contrato; `null` no legado, porque o contrato
  vem da ficha), `historico` e `proximasFolgas` (`[{ data, diaSemana }]`, pelo
  consultor, de hoje até 13 dias à frente).
- Cada vigência vem com `folgasFixasEfetivas` (as da ficha ou as padrão do
  contrato), a disponibilidade de segunda a domingo e os `avisos` de R4.6.

#### `gravar(colaboradorId, dados, autor)`
Ordem das travas:
1. Data `aPartirDe` válida (400) e **ciclo de folha aberto** nela
   (`CicloFolhaService.exigirCicloAberto`, 409, R1.4). Retroativa dentro do ciclo
   aberto é aceita (R1.5).
2. Contrato: o do corpo ou, ausente, **o que já decide o dia** (a vigência anterior
   ou a ficha). Diferente desse = **troca de contrato**, só com `ADMIN_DADOS` (403;
   decisão do dono); trocar para um contrato inativo = 400; inexistente = 400.
3. `validarVigencia` com os limites do contrato (`folgasPorSemana`,
   `permiteFolgaSabado`) + **grupo sem rodízio de folgas vigente na data** (400). Os
   erros saem juntos numa mensagem.
4. Upsert por (`colaboradorId`, `vigenteDesde`) numa transação: a disponibilidade é
   substituída inteira (linhas vazias = dia sem horário). Auditoria (R1.6):
   `criadoPor` na criação, `atualizadoPor` na alteração; `motivo` novo substitui o
   anterior, ausente mantém.
- **Devolve:** `{ vigencia, avisos }` (avisos não bloqueiam).

#### `validarNoCadastro(dados, contratoDaFicha, contratoPadrao, autor)` e `gravarPlano(...)`
O `POST /colaboradores` valida o bloco `jornada` **antes** de criar a conta e a
ficha (mesmas travas do `gravar`) e grava depois. No cadastro, "trocar o contrato"
é escolher um diferente do **padrão**.

#### `remover(colaboradorId, vigenciaId, autor)`
404 se a vigência não for da pessoa; 409 se ela começa num ciclo fechado; 403 sem
`ADMIN_DADOS` quando a remoção muda o contrato desses dias (a anterior, ou a ficha,
tem outro). Sem nenhuma vigência, a pessoa volta ao 6x1 da ficha em todos os dias
(R1.7).

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
  horário fora de `HH:mm`, **só a entrada ou só a saída**, saída ≤ entrada, dia
  repetido. Entrada e saída vazias = dia sem horário (não é erro).
- `disponibilidadePreenchida(linhas)` — as linhas com horário, prontas para gravar.
- `motivoDaFolga(previsto)` → `'GRUPO' | 'FOLGA_FIXA' | null`: por que a pessoa
  folga no dia no regime semanal; null no 6x1 e nos dias de trabalho.
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
- Escreve: `jornada_vigencias` e `disponibilidade_dias` (só pelo
  `JornadaColaboradorService`). Lê também `rodizio_folgas_vigencias`, `ciclos_folha`
  e `tipos_contrato_jornada` para validar.

## 9. Dependências
- **Depende de:** [`tipos-contrato`](tipos-contrato.md), [`escala-domingo`](escala-domingo.md)
  (âncora, funções de folga/horário e rodízio), [`feriados`](feriados.md) (calendário),
  [`ciclo-folha`](ciclo-folha.md) (ciclo aberto), [`acessos`](acessos.md)
  (`usuarioTemAlguma` para `ADMIN_DADOS`),
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
5. **Nenhuma vigência começa num ciclo fechado** — nem criar, nem alterar, nem
   remover (R1.4). Retroativa dentro do ciclo aberto pode (R1.5).
6. **Só o administrador escolhe ou troca o contrato** (`ADMIN_DADOS`); grupo, folgas
   e disponibilidade ficam com `OPERADORES_CRUD`. Sem contrato no corpo, vale o que
   já decide o dia.
7. **Grupo exige rodízio de folgas vigente** na data de início; folgas fixas só sem
   grupo, até `folgasPorSemana` do contrato e sábado só se ele permitir.

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `jornada-vigencia.domain.spec.ts` | `vigenciaNoDia`; propriedade (500 casos) de que sem vigência o resultado é o de hoje, inclusive com vigências futuras; corte de 23/11; folgas fixas e padrão; grupo com e sem rodízio; feriado e domingo; avisos com a tolerância do contrato; validação (inclusive só entrada/só saída e dia vazio); `textoDuracao` + `motivoDaFolga`; | 41 |
| `jornada-colaborador.service.spec.ts` | Escrita pela ficha sobre banco em memória: criação com auditoria e avisos; upsert por data; cada 400 da design §3.2 (inclusive grupo sem rodízio); 409 em ciclo fechado; retroativa no ciclo aberto; 403 ao trocar contrato sem `ADMIN_DADOS` e herança do contrato do dia; contrato inativo/inexistente; remoção (volta ao 6x1, 409, 403, 404); leitura (vigente, histórico, "desde", próximas folgas do G1) | 27 |
| `jornada-colaborador.controller.spec.ts` | `autorDaJornada`: só quem tem `ADMIN_DADOS` troca o contrato | 2 |
| `jornada-vigencia.service.spec.ts` | Consultor igual à regra de folga **anterior** (congelada no próprio teste) e às funções de horário sobre os mesmos dados; `ehFolga` sem ficha; `semFolgaNaFicha` no legado e com vigência; carga em lote; pessoa desconhecida e dia não carregado; vigência a partir da data; feriado do calendário × informado + `gruposDeFolga` por dia (e null sem rodízio); | 15 |
| `folga.service.spec.ts` | A regra única de folga (veio de `escala-domingo`), agora pela fachada: os mesmos 20 casos, sem mudar nenhuma expectativa | 20 |
| `consumidores-puros.spec.ts` | `montarLinhaEscala` com o turno já resolvido; dias escalados e "emenda" pela folga do dia no 5x2; `folgasNoPeriodo` só para quem tem vigência | 7 |

> Contagem sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- ⚠ **A escrita pela API existe, a tela ainda não** (Fase 4b). Até lá, as vigências
  só entram pela API. Não gravar vigências direto no banco: a API é que confere o
  ciclo, o contrato e o rodízio.
- ✅ Comparação da Fase 4a (PGlite, 8 pessoas, ciclo 26/10–25/11, 248 dias): `main`
  × branch sem vigência, resumo e detalhe idênticos. Com vigências gravadas pela
  API (quatro em 23/11 e uma retroativa em 16/11), só mudam os dias a partir do
  início de cada uma.
- 🔧 Os consumidores aceitam o serviço como `@Optional()` e mantêm o caminho antigo para
  os testes que não o injetam. Torná-lo obrigatório é parte da limpeza (Fase 7).
- 🔧 Comparação feita na Fase 1b: 155 leituras (Central, escala, quadro, exportação,
  compensação, perfil, incidências, ponto) sobre um banco com 8 pessoas e um ciclo
  inteiro, com `main` e com a branch — resultado idêntico.
- ✅ O rodízio de folgas (Fase 3) entra pelo contexto de `previstoNoDia`
  (`folgasDoGrupo`): o consultor lê `rodizio_folgas_vigencias` uma vez e responde,
  para cada grupo e dia, as folgas da semana pelo rodízio vigente
  ([ADR 0028](../02-arquitetura/decisoes/0028-rodizio-de-folgas-5x2.md)). Sem
  rodízio vigente no dia, o grupo não afirma folga nem turno. As folgas padrão do
  contrato vêm de `RegrasContrato` (Fase 2).
- 🔧 O consultor carrega todas as fichas, como o `FolgaService`; as tabelas são
  pequenas (uma linha por pessoa e mudança).
