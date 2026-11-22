> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-11-22 · **Cobre:** `backend/src/jornada-vigencia/`

# Módulo: `jornada-vigencia`

## 1. Propósito
Dizer como é o dia de cada pessoa — folga, horário, carga, 100%, débito e regras do
contrato — **com o que valia naquele dia**, para que mudar contrato, folgas ou horário
não reescreva o passado ([ADR 0027](../02-arquitetura/decisoes/0027-vigencia-da-jornada.md),
spec [`jornada-5x2`](../../.kiro/specs/jornada-5x2/design.md)).

## 2. Responsabilidades e limites
- **Faz:** resolve a vigência de cada dia; responde a *jornada prevista do dia* em
  lote; diz as regras do contrato do dia; confere uma vigência (avisos) e a valida
  (erros).
- **Não faz:** calcular a jornada trabalhada (isso é [`ponto`](ponto.md)); configurar
  contratos ([`tipos-contrato`](tipos-contrato.md)) nem o rodízio
  ([`escala-domingo`](escala-domingo.md)).
- **Estado atual (Fase 1a do spec):** ainda **ninguém consome** o consultor e não há
  escrita de vigências. Os consumidores migram na Fase 1b; a escrita (`PUT/DELETE
  /colaboradores/:id/jornada`) entra com a tela da ficha (Fase 4).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas (aprox.) |
|---|---|---|
| `jornada-vigencia.domain.ts` | Domínio puro: `vigenciaNoDia`, `previstoNoDia`, `folgasFixasEfetivas`, `avisosDaVigencia`, `validarVigencia`, `textoDuracao` | 450 |
| `jornada-vigencia.service.ts` | `consultor(dias)` em lote e `regrasNoDia` | 280 |
| `jornada-vigencia.module.ts` | DI; importa `TiposContratoModule` e `EscalaDomingoModule` | 16 |

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

### `JornadaVigenciaService.regrasNoDia(colaboradorId, dia)`
Regras do contrato da vigência do dia ou, antes da primeira, do contrato da ficha;
sem pessoa, o padrão. Substituirá `TiposContratoService.regrasDoColaborador`, que olha
só a ficha atual.

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
- `textoDuracao(min)` — "8h48", "2h", "50 min".

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
- **É usado por:** ninguém ainda (Fase 1b: ponto, detecção, fiscais, Central,
  compensação, operadores, incidências, perfil, exportação de escala).

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
| `jornada-vigencia.service.spec.ts` | Consultor igual ao `FolgaService` e às funções de horário sobre os mesmos dados; carga em lote; pessoa desconhecida e dia não carregado; vigência a partir da data; feriado do calendário × informado; `regrasNoDia` | 9 |

> Contagem sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- ⚠ **Ainda sem consumidores** (Fase 1b). Até lá, uma vigência gravada direto no banco
  não teria efeito em nenhum cálculo — não gravar.
- 🔧 Rodízio de folgas (Fase 3) e folgas padrão do contrato (Fase 2) entram pelo
  contexto de `previstoNoDia` (`folgasDoGrupo`, `folgasFixasPadrao`).
- 🔧 O consultor carrega todas as fichas, como o `FolgaService`; as tabelas são
  pequenas (uma linha por pessoa e mudança).
