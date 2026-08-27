> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-08-27 · **Cobre:** `backend/src/escala-domingo/`

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
| `folga.service.ts` | **Regra única de folga**: ficha + escala semanal, para todo o sistema | 142 |
| `escala-domingo.module.ts` | Ligações (DI); exporta os dois serviços | 23 |
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

### `FolgaService` — a regra ÚNICA de folga

A folga de uma pessoa está escrita em **duas** fontes:

- a **ficha** do colaborador (`folgaDiaSemana` + `grupoDomingo`) — fonte dos
  operadores e supervisores;
- a **escala semanal** (`EscalaEntry.folga`) — fonte dos fiscais, e onde também
  vivem as exceções individuais.

Cada parte do sistema consultava **só a sua** e ignorava a outra. O resultado
apareceu na operação: um fiscal com folga na terça **na ficha**, cuja escala
semanal não havia sido atualizada, era escalado, não batia ponto (estava
descansando) e recebia **falta automática** duas horas depois — no próprio dia de
descanso. E a falta não se curava: a auto-cura espera uma batida, que num dia de
folga nunca chega.

**A regra:** se **qualquer** uma das fontes diz que a pessoa descansa, é folga.

O viés é deliberado e conservador. Quando as fontes discordam, o sistema não sabe
a verdade — e entre "deixar de cobrar o ponto de alguém" e "marcar falta em quem
estava descansando", o segundo erro é muito mais grave: um custa uma conversa, o
outro mexe no registro de trabalho de uma pessoa.

O preço: se a fonte desatualizada for a que diz "folga", quem realmente trabalhou
não é cobrado por não bater ponto. É uma **omissão visível** (a pessoa aparece de
folga na escala publicada, onde qualquer um percebe), diferente da falta indevida,
que aparecia como fato consumado.

| Método | O que faz |
|---|---|
| `consultor(dias)` | Carrega fichas + folgas da escala + âncora **de uma vez** e devolve `ehFolga(dia, ids)`. É o que a varredura de 5 minutos e o quadro usam. |
| `ehFolga(dia, ids)` | Atalho para uma pessoa num dia. |

`ids` aceita a pessoa em **todas** as suas identidades (`Fiscal.id`,
`Colaborador.id`): um fiscal bate ponto por uma e tem ficha na outra, e consultar
só uma delas era a origem de metade dos casos em que a regra não pegava.

**Onde é usada** (e por que em cada lugar):
- `FiscaisService.escaladosDoDia` — quem está de folga por qualquer fonte não é
  escalado, então **a falta não nasce**;
- `OperadoresService.registrarAusencia` e `FiscaisService.registrarFalta` — última
  linha de defesa: recusam marcar falta em dia de folga;
- auto-cura do Relógio Ponto — **apaga** as faltas indevidas já gravadas;
- Quadro de Operadores (`diaOperadores` e `grade`) — para o quadro e a escala
  publicada não discordarem sobre o que é folga.

**Onde NÃO é usada, de propósito:** o **registro de ponto** (`definirStatus`).
Quem está na loja batendo o ponto não pode ser barrado por um cadastro velho.
Deixar de cobrar é reversível; impedir alguém de registrar trabalho, não.

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
- `entradaEsperadaNoDia(ficha, dia, ancora, ehFeriado?)` → horário de entrada do
  turno ("HH:mm") ou `null`: seg–qui = semana, sex–sáb = fim de semana, domingo =
  horário de domingo (só quando o rodízio está ancorado e manda trabalhar).
- `saidaEsperadaNoDia(ficha, dia, ancora, ehFeriado?)` → o **outro lado do mesmo
  turno**, regra por regra igual à entrada (inclusive feriado seguindo o horário
  de domingo e a folga decidida pelo dia real). As duas andam juntas de propósito:
  publicar uma escala com a entrada de um dia e a saída de outro descreveria um
  turno que não existe. Criada para a
  [escala publicada](escala-exportacao.md) — antes só existia a entrada, porque só
  o atraso era calculado.
  **Em feriado (`ehFeriado = true`) vale o horário de DOMINGO** — ver regra 7. O
  parâmetro é opcional (`false` por padrão) e o domínio **não** consulta o
  calendário: quem chama resolve se o dia é feriado e informa.
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
7. **Feriado muda o HORÁRIO, nunca a folga.** Num feriado o turno esperado é o
   **horário de domingo** da pessoa (`entradaDom`) — a mesma regra que a jornada
   já aplicava ao pagamento (carga de domingo + extras a 100%), agora também no
   turno. O que **não** muda:
   - a **folga** continua sendo a do dia real da semana: quem folga na terça
     segue folgando numa terça feriado;
   - o **rodízio de domingos não é deslocado** por feriado, nem quando o feriado
     cai num domingo.

   **Fallback:** sem `entradaDom` cadastrado (típico de quem está fora do
   rodízio), o feriado **mantém o horário normal do dia** em vez de deixar a
   pessoa sem turno — sem turno ela desapareceria da equipe do dia, o que seria
   pior e mais surpreendente do que seguir no horário habitual.

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `escala-domingo.domain.spec.ts` | Rodízio, folga, turno esperado, **turno de feriado (horário de domingo, folga inalterada)** e atraso (funções puras) | 37 |
| `folga.service.spec.ts` | Regra única: folga da ficha valendo contra a escala que escala (o caso real), folga da escala valendo sem a ficha, resolução pelas duas identidades, pessoa desconhecida, rodízio de domingo (com e sem âncora) e o consultor de vários dias | 10 |

> Contagem sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- 🔧 A âncora vive no singleton `ConfigSistema` com campos legados
  (`domingoAncoraGrupo`) mantidos por compatibilidade; convém remover o
  fallback quando toda a base estiver regravada com `domingoOrdemGrupos`.
- ⚠️ O rodízio assume **exatamente 3 grupos** (2x1). Uma operação com número
  diferente de grupos exigiria revisar o domínio.
