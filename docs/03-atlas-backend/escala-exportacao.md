> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-09-17 · **Cobre:** `backend/src/escala-exportacao/`

# Módulo: `escala-exportacao`
> **ADR 0026 (2026-09-17).** A **exceção de horário** da escala semanal
> (`EscalaEntry.especial`) foi **removida**: o horário é sempre o da ficha.
> Com ela saíram a **convocação** e a **folga concedida** que dependiam do
> mesmo campo. Os trechos abaixo que descrevem esse mecanismo valem apenas
> como histórico. Ver
> [ADR 0026](../02-arquitetura/decisoes/0026-horario-e-o-da-ficha.md).


## 1. Propósito
Monta a **escala publicada** — a escala como ela é entregue à equipe, do dia ou da
semana, com **todo o time** (operadores, fiscais e supervisores), para virar PDF
ou imagem no app e ser enviada aos colaboradores.

## 2. Responsabilidades e limites
- **Faz:** junta a ficha de cada colaborador (turno, folga fixa, grupo do
  rodízio), a âncora do rodízio de domingo, os feriados, as férias, as ausências
  do dia e as exceções de horário numa lista pronta para publicar. Devolve
  também as contagens do dia e o grupo que folga no domingo.
- **Não faz:** não desenha nada (o PDF/imagem é montado no app, em
  [`escala`](../04-atlas-mobile/escala.md)), não edita escala, não lança falta e
  não decide horário — a decisão de turno/folga continua em
  [`escala-domingo`](escala-domingo.md).

### Por que não é uma extensão de `operadores`
O [Quadro de Operadores](operadores.md) é uma tela de **gestão**: cobre só
operadores e existe para agir (lançar falta, justificar). A escala publicada é um
**documento**: cobre todas as funções e não edita nada. Fazer as duas coisas no
mesmo serviço obrigaria uma delas a mentir — ou o quadro passaria a mostrar gente
que não é dele, ou o documento continuaria incompleto.

O que os dois **não** podem fazer é discordar sobre o que uma pessoa faz num dia.
Essa decisão é de `montarLinhaEscala`, e as duas telas a chamam. Não foi sempre
assim: o quadro tinha uma cópia da regra, e a cópia não conhecia feriado nem
exceção de horário — mostrava `08:00` onde este módulo mostrava `07:00`, para a
mesma pessoa no mesmo feriado. Módulos separados, **regra única**.

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas (aprox.) |
|---|---|---|
| `escala-exportacao.controller.ts` | Rotas do dia e da semana | 46 |
| `escala-exportacao.service.ts` | Junta ficha + rodízio + feriado + férias + ausências, e aponta quem está **sem folga na ficha** | 409 |
| `escala-publicada.domain.ts` | Regras puras: precedência do estado, ordem, agrupamento, semana | 252 |
| `escala-especiais.consulta.ts` | **A única** leitura das exceções de horário (compartilhada com o Quadro), resolvendo o dono das linhas sem vínculo | 82 |
| `escala-exportacao.module.ts` | Ligações (DI) do módulo | 21 |
| `dto/escala-exportacao.dto.ts` | Validação da data de referência | 13 |

## 4. Endpoints (rotas HTTP)
> A lista canônica está na [API HTTP](../05-referencia-dados/api-http.md).

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `GET /escala-exportacao/dia?data=` | `ESCALA_VISUALIZAR` | Escala de um dia com todo o time. Sem `data`, o **dia civil de Brasília**. |
| `GET /escala-exportacao/semana?data=` | `ESCALA_VISUALIZAR` | Escala da semana (segunda a domingo) que contém a data. |

Quem já pode **ver** a escala pode publicá-la: não há alçada nova. As duas rotas
são só leitura.

O corte do "hoje" é o de **Brasília**, não o do servidor (que roda em UTC): entre
21h e meia-noite o UTC já virou o dia, e a escala "de hoje" apareceria como a de
amanhã justamente no horário em que ela é enviada à equipe.

## 5. Serviços e funções

### `escalaDoDia(dataISO)`
- **Recebe:** `yyyy-mm-dd`.
- **Devolve:** `EscalaDiaPublicada` — `dataISO`, `diaSemana`, `ehFeriado`,
  `nomeFeriado`, `grupoFolgaDomingo`, `totais`, `secoes` (pessoas agrupadas por
  função) e **`semFolgaNoCadastro`** — quem está sem dia de folga na ficha, com
  nome e função.
- **Efeitos:** só leitura — `Colaborador`, `Feriado`, `EscalaEntry`, `Ausencia`,
  `ConfigSistema` (via `EscalaDomingoService`) e `FeriasColaborador` (via
  `FeriasService`).
- **Regras aplicadas:** as da seção 10.

### `escalaDaSemana(dataISO)`
- **Recebe:** `yyyy-mm-dd` (qualquer dia da semana desejada).
- **Devolve:** `EscalaSemanaPublicada` — `inicioISO`/`fimISO`, os sete `dias`
  (com feriado marcado), `secoes` com uma pessoa por linha e **sete células**, e o
  mesmo **`semFolgaNoCadastro`** do dia — a grade é a tela do planejamento, e um
  aviso que só existisse no dia apareceria quando já não dá para agir.
- **Efeitos:** os mesmos, carregados **uma vez** para o intervalo inteiro: sete
  dias não podem custar sete vezes o mesmo trabalho de banco. A exceção são as
  férias, que são por dia e exigem uma consulta por data.

## 6. Lógica de domínio (funções puras)
Em `escala-publicada.domain.ts`:
- `montarLinhaEscala({ ficha, dia, ancoraDomingo, ehFeriado, deFerias, deFolga, ocorrencia })`
  → a linha de uma pessoa num dia, aplicando a **precedência** da seção 10.
  **É a regra única de "o que esta pessoa faz neste dia":** o
  [Quadro de Operadores](operadores.md) a chama também (grade, roster e tablero ao
  vivo), então uma mudança aqui muda as duas telas de uma vez — que é
  exatamente o objetivo.
- `ordenarLinhas(linhas)` → quem entra mais cedo primeiro (a ordem em que o dia
  acontece na loja); quem não trabalha vai para o fim, por nome.
- `agruparPorFuncao(linhas)` → seções na ordem fixa `SUPERVISOR → FISCAL →
  OPERADOR`, omitindo as vazias. A posição é fixa de propósito: uma escala que
  muda de forma a cada dia obriga a reler tudo para achar o próprio nome.
- `totaisEscala(linhas)` → contagem de cada estado.
- `semanaDe(dataISO)` → os sete dias de **segunda a domingo**. O domingo pertence
  à semana que começou na segunda anterior; sem essa regra, publicar no domingo
  mostraria a semana seguinte, justamente no dia em que a equipe confere a semana
  que está acabando.
- `minutosDoHorario(hhmm)`, `chaveFila`-equivalentes de data (`diaUTC`,
  `isoDoDia`) — utilidades de apoio.

Em [`escala-domingo`](escala-domingo.md), usadas por este módulo:
`entradaEsperadaNoDia` e **`saidaEsperadaNoDia`** (esta última criada para a
escala publicada — antes só existia a entrada).

## 7. Estados e enums
- `FuncaoEscala`: `OPERADOR`, `FISCAL`, `SUPERVISOR`. A **gerência não é
  escalada**, então não entra.
- `StatusEscala`: `TRABALHA`, `FOLGA`, `FALTA`, `ATESTADO`, `FERIAS`.

## 8. Dados que o módulo toca
- **Lê:** `Colaborador`, `Feriado`, `EscalaEntry` (apenas as de **folga**, via
  `FolgaService`; o horário vem só da ficha — ADR 0026), `Ausencia`,
  `Atestado` (indiretamente, pelo vínculo da ausência), `ConfigSistema`,
  `FeriasColaborador`.
- **Escreve:** nada.

> **As ausências são lidas pelas DUAS chaves.** `Ausencia.pessoaId` guarda o id
> com que a pessoa bate ponto: para operadores e supervisores é o
> `Colaborador.id`, mas para um **fiscal** é o `Fiscal.id` — outro registro, outro
> id — e o vínculo com a ficha vai em `Ausencia.colaboradorId`. Procurar só por
> `pessoaId` (o que se fazia) significava que a falta de um fiscal **nunca**
> casava: este documento, que a equipe inteira lê, dizia "trabalha" sobre quem
> faltou. Verificado em `fiscais/coerencia-escalados-escala.spec.ts`.

> **A folga e as exceções também.** A lição acima valia para as ausências e não
> tinha sido aplicada às outras duas leituras (ADR 0023): a folga era consultada
> passando **só** o `Colaborador.id` — contra o contrato do próprio `FolgaService`,
> que pede a pessoa em todas as identidades — e as exceções de horário sem
> `colaboradorId` eram **descartadas**, "para não aplicar no palpite". Não era
> palpite: o vínculo `Fiscal → Colaborador` diz de quem a linha é. O que se perdia
> era uma convocação ou uma dispensa desaparecendo justamente do documento que a
> equipe recebe, enquanto a regra de folga continuava a enxergá-las pelo
> `funcionarioId` — duas superfícies, duas respostas sobre o mesmo dia. As
> identidades agora saem de `fiscais/identidades.consulta.ts`, uma carga só para
> todos os consumidores.

## 9. Dependências
- **Depende de:** [`escala-domingo`](escala-domingo.md) (âncora do rodízio e
  regras de horário), [`ferias`](ferias.md) (quem está de férias),
  [`feriados`](feriados.md) — apenas a regra pura `feriadosNacionais`, lida
  direto, para não criar dependência de módulo por causa de uma consulta.
- **É usado por:** a área [`escala`](../04-atlas-mobile/escala.md) do app.

## 10. Regras de negócio-chave

**Precedência do estado de uma pessoa no dia** (a ordem é o coração do módulo):
1. **Férias** ganham de tudo — período aprovado não tem turno nem falta.
2. ~~**Horário especial** do dia da semana~~ — **removido pela ADR 0026.** O texto
   abaixo fica como histórico: a exceção prevalecia sobre
   a folga e sobre o turno do cadastro: é a exceção que o gestor cadastrou
   justamente para isso — é assim que se convoca alguém no seu dia de descanso.
3. **Folga pela regra única** ([`FolgaService`](escala-domingo.md): a ficha manda
   quando afirma um dia; a escala semanal decide quando a ficha se cala — ver
   [ADR 0023](../02-arquitetura/decisoes/0023-folga-a-ficha-manda.md)). Vem depois
   do especial e **antes** do turno. Sem este passo, uma folga escrita só na escala
   semanal e não marcada como exceção saía `FOLGA` no Quadro de Operadores e
   `TRABALHA` aqui — a mesma classe de incoerência das férias, achada pelo teste de
   coerência `coerencia-quadro-escala.spec.ts` (em `operadores`).
4. **Turno do cadastro**, pelas regras de dia útil / fim de semana / domingo com
   rodízio / feriado.
5. **Sem turno no dia ⇒ folga** (é o que "sem horário" significa aqui).
6. **Ausência** só se aplica a quem deveria trabalhar: falta em dia de folga não
   existe, e mostrá-la assustaria quem lê.

**Quem não trabalha também aparece** (folga, falta, atestado, férias). Numa
escala publicada, quem não se vê na lista não conclui "eu folgo": conclui "me
esqueceram". O silêncio gera exatamente a pergunta que a escala deveria evitar.

**Quem falta mantém o horário previsto ao lado.** É o que diz qual turno ficou
descoberto — sem isso, a escala informa que alguém faltou e nada mais.

**Feriado segue o horário de domingo nas duas pontas.** A entrada já seguia essa
regra; a saída passou a seguir também. Publicar a entrada de domingo com a saída
de dia útil descreveria um turno que não existe.

**Exceções sem ficha vinculada são ignoradas.** `EscalaEntry` antigas sem
`colaboradorId` não são aplicadas: sem a ficha não há como saber com segurança de
quem é a exceção, e aplicá-la por palpite colocaria o horário errado no documento
que a equipe recebe.

**Inativos não aparecem.** Só `Colaborador.ativo = true`.

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `escala-publicada.domain.spec.ts` | Precedência (férias, folga, falta, atestado), a garantia de que **só a ficha** define o horário, feriado nas duas pontas, ordem por entrada, agrupamento por função, totais e a semana segunda→domingo | 13 |
| `../operadores/coerencia-quadro-escala.spec.ts` | **Coerência** com o Quadro de Operadores: para o mesmo dia e pessoa, as duas vistas dizem o mesmo — estado **e horário** (trabalho, folga da ficha, folga da escala semanal com a ficha omissa e como exceção, **ficha afirmando outro dia**, férias, falta, atestado, **feriado** e **horário de exceção**) | 10 |
| `escala-exportacao.service.spec.ts` | Cobertura de todas as funções, feriado com nome, férias, exceção de horário, falta com turno preservado, grupo do domingo, inativos fora, a grade semanal (sete células, regra por dia, ordem por nome), as **duas identidades de um fiscal** (folga e exceção gravadas só sob o `Fiscal.id`, e a linha velha que não soma um segundo dia) e o **aviso de ficha sem folga** | 16 |

> Contagem sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- ⚠️ **Férias custam uma consulta por dia** na escala da semana
  (`colaboradoresDeFeriasNoDia` é por data). Com o time atual é irrelevante; se
  virar gargalo, o caminho é um método de período no `FeriasService`.
- ⚠️ O **rodízio de domingo sem âncora** faz todos aparecerem de folga no
  domingo. É deliberado (não se chuta quem trabalha), mas significa que publicar
  a escala de um domingo antes de configurar o rodízio produz um documento
  errado. A tela avisa; o serviço não bloqueia.
- 🔧 A escala publicada **não tem histórico**: ela é recalculada a cada consulta.
  Se amanhã for preciso provar "o que foi publicado no dia X", será necessário
  guardar o documento gerado.
- ✅ **Feriado e exceção de horário têm uma fonte só.** Conviviam duas resoluções
  de feriado (um `feriadosDoPeriodo` privado aqui, com chave `yyyy-mm-dd`, e
  `FeriadosService.mapaNoPeriodo`, com chave timestamp) e duas cópias **idênticas**
  de `especiais()` (aqui e no [Quadro](operadores.md)). Hoje há uma implementação
  de cada, em `carregarMapaDeFeriados` e `carregarHorariosEspeciais`, e todos os
  chamadores passam por elas.

  **Por que função livre e não serviço injetado.** O único ingrediente das duas é o
  Prisma, que é dependência obrigatória de todos os chamadores. Injetar
  `FeriadosService` aqui exigiria um parâmetro **obrigatório** no construtor — e a
  posição obrigatória vem antes das `@Optional()`, o que desloca os argumentos
  posicionais e mexe em testes que nada têm com feriado. Injetar de forma
  **opcional** seria pior: criaria um modo silencioso "nenhum feriado existe" /
  "exceções ignoradas", isto é, trocaria duplicação visível por degradação
  invisível. A função livre dá a fonte única sem aresta de módulo e sem modo de
  falha novo — e a prova é que a unificação passou **sem alterar um único teste**,
  incluindo `coerencia-quadro-escala.spec.ts`, que agora compara duas telas que
  rodam exatamente o mesmo código.
