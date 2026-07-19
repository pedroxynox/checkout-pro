> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `backend/src/escala-domingo/`

# Módulo: `escala-domingo`

## 1. Propósito
Define o **rodízio de domingo**: aos domingos a operação trabalha com 2 grupos e
folga 1 (esquema **2x1** entre G1, G2 e G3). O módulo guarda o ponto de partida
do ciclo e calcula, de forma determinística, qual grupo folga em cada domingo.

## 2. Responsabilidades e limites
- **Faz:** guarda a **âncora** do rodízio (domingo de referência + ordem do
  ciclo) no singleton `ConfigSistema`; valida a configuração; calcula o grupo
  que folga em cada domingo, se um colaborador trabalha/folga num dia, o horário
  de entrada esperado e os minutos de atraso; devolve um **preview** dos próximos
  domingos para conferência.
- **Não faz** (fica em outro módulo): cadastro do grupo de domingo de cada
  colaborador (fica em [`colaboradores`](colaboradores.md)/[`fiscais`](fiscais.md));
  o registro/apuração de ponto em si (fica em [`ponto`](ponto.md) e
  [`central-jornada`](central-jornada.md)); o cálculo de adicional/jornada.

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas (aprox.) |
|---|---|---|
| `escala-domingo.controller.ts` | Rotas HTTP (ler e definir a âncora) | 39 |
| `escala-domingo.service.ts` | Lê/grava a âncora no `ConfigSistema` e monta o preview | 143 |
| `escala-domingo.domain.ts` | Regras puras: rodízio, folga, turno esperado e atraso | 198 |
| `escala-domingo.module.ts` | Ligações (DI); exporta o serviço | 17 |
| `dto/escala-domingo.dto.ts` | Validação de entrada do `PUT` | 28 |

## 4. Endpoints (rotas HTTP)
> A lista canônica está na [API HTTP → `escala-domingo`](../05-referencia-dados/api-http.md#escala-domingo).

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `GET /config/escala-domingo` | `—` (autenticado) | Devolve a âncora vigente + preview dos próximos 8 domingos. |
| `PUT /config/escala-domingo` | `ESCALA_DOMINGO_CONFIG` | Define referência + ordem do ciclo (somente administrador). |

## 5. Serviços e funções

### `EscalaDomingoService`

#### `obterAncora()`
- **Recebe:** nada.
- **Devolve:** `AncoraDomingo | null` (domingo de referência + `ordem` do ciclo).
- **Efeitos:** lê o singleton `ConfigSistema` (`id: 'sistema'`).
- **Regras aplicadas:** usa a nova config (`domingoOrdemGrupos`, CSV) ou faz
  **fallback à config antiga** (grupo único `domingoAncoraGrupo`) via
  `ordemLegado`; devolve `null` quando não há data de âncora ou a ordem é inválida.

#### `obter()`
- **Devolve:** `EscalaDomingoConfig` (`ancoraData`, `ordem`, `proximos`).
- **Efeitos:** lê a âncora e calcula o preview dos próximos `PREVIEW_QTD` (8)
  domingos com o grupo que folga em cada um.
- **Regras aplicadas:** sem âncora, devolve tudo nulo/vazio.

#### `definir(ancoraDataISO, ordem, por?)`
- **Recebe:** o domingo de referência (ISO), a ordem do ciclo e quem alterou.
- **Devolve:** a configuração resultante (via `obter()`).
- **Efeitos:** faz `upsert` no `ConfigSistema` gravando `domingoAncoraData`,
  `domingoOrdemGrupos` (CSV), `domingoAncoraGrupo` (1º grupo, por
  compatibilidade) e `atualizadoPor`.
- **Erros possíveis:** `BadRequestException` se a ordem não for uma permutação
  de G1/G2/G3, se a data for inválida ou se **não for um domingo**.

## 6. Lógica de domínio (funções puras)
- `ehDomingo(data)` → verdadeiro se o dia da semana (UTC) é domingo.
- `ehGrupoValido(g)` → verdadeiro para `G1`/`G2`/`G3`.
- `ordemValida(ordem)` → verdadeiro só se a ordem for permutação dos 3 grupos
  (cada um exatamente uma vez).
- `grupoFolgaNoDomingo(dataDomingo, refData, ordem)` → grupo que folga naquele
  domingo, seguindo a ordem informada e repetindo a cada 3 domingos (também para
  datas anteriores à referência).
- `trabalhaNoDomingo(grupo, dataDomingo, refData, ordem)` → o colaborador
  trabalha se **não** é o grupo que folga; sem grupo (fora do rodízio) nunca
  trabalha aos domingos.
- `proximoDomingo(apartir)` / `proximosDomingos(apartir, n)` → sequência de
  domingos para o preview.
- `ehDiaDeFolga(ficha, dia, ancora)` → regra unificada de folga (usada pelo
  Relógio Ponto): seg–sáb usa `folgaDiaSemana`; domingo segue o rodízio, com
  folga fixa (`folgaDiaSemana = 0`) prevalecendo e "sem âncora" não afirmando folga.
- `entradaEsperadaNoDia(ficha, dia, ancora)` → horário de entrada do turno
  ("HH:mm") ou `null`: seg–qui = semana, sex–sáb = fim de semana, domingo =
  horário de domingo (só quando o rodízio está ancorado e manda trabalhar).
- `minutosDeAtraso(entradaPrevista, entradaReal, tolerancia?)` → minutos de
  atraso apenas quando ultrapassam a tolerância (`TOLERANCIA_ATRASO_MIN = 15`).

## 7. Estados e enums
- `GrupoDomingo`: `G1` · `G2` · `G3` (`GRUPOS_DOMINGO`).
- **Rotação:** a cada domingo avança um passo na `ordem`; ciclo de 3 domingos,
  em que cada grupo folga 1 e trabalha 2.

## 8. Dados que o módulo toca
- **Lê/escreve:** `ConfigSistema` (singleton `id: 'sistema'`), campos
  `domingoAncoraData`, `domingoOrdemGrupos`, `domingoAncoraGrupo`, `atualizadoPor`.
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService` (global).
- **É usado por:** a tela de Escalas e o Relógio Ponto (resolvem quem
  trabalha/folga por domingo, o turno esperado e o atraso a partir das funções
  puras); o módulo **exporta** `EscalaDomingoService`.

## 10. Regras de negócio-chave
1. **Rodízio 2x1:** a cada domingo um grupo folga e dois trabalham; num ciclo de
   3 domingos, cada grupo folga uma vez.
2. **Uma âncora basta:** referência (um domingo) + ordem do ciclo determinam
   qualquer domingo, passado ou futuro.
3. **A ordem é uma permutação** de G1/G2/G3 e a referência **precisa ser domingo**.
4. **Fora do rodízio = folga fixa aos domingos** (colaborador sem grupo).
5. **Sem âncora, não se afirma folga/turno de domingo** (evita bloquear ponto ou
   apontar atraso por engano enquanto o rodízio não foi configurado).
6. **Compatibilidade:** a config antiga (grupo único) continua funcionando via
   ordem legada até ser regravada.

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `escala-domingo.domain.spec.ts` | Rodízio, folga, turno esperado e atraso (funções puras) | 24 |

> Contagem sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- 🔧 A âncora vive no singleton `ConfigSistema` com campos legados
  (`domingoAncoraGrupo`) mantidos por compatibilidade; convém remover o
  fallback quando toda a base estiver regravada com `domingoOrdemGrupos`.
- ⚠️ O rodízio assume **exatamente 3 grupos** (2x1). Uma operação com número
  diferente de grupos exigiria revisar o domínio.
