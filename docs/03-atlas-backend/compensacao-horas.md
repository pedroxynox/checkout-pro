> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-09-16 · **Cobre:** `backend/src/compensacao-horas/`

# Módulo: `compensacao-horas`

## 1. Propósito

Sugere **quem** liberar, **em que dia** e **por quanto tempo** para consumir o
saldo de horas de 50% da equipe antes de o ciclo de folha fechar — e sugere
cobrir, com essas mesmas horas, as faltas passadas que ainda estão em aberto.

Existe porque a Central de Jornada **media** as horas com precisão mas não
ajudava a resolvê-las: o gestor via "Ana tem 5h de 50%" e ficava sozinho com três
perguntas (em que dia libero sem furar a operação, por quanto tempo, e isso zera
as horas ou empurra o problema para o mês seguinte). Ver
[ADR 0021](../02-arquitetura/decisoes/0021-compensacao-de-horas.md).

## 2. Responsabilidades e limites

- **Faz:** ranqueia as datas que restam do ciclo pelo movimento previsto; exclui
  as datas impossíveis; calcula quanto cada pessoa trabalha e quanto compensa;
  escolhe a ponta do turno a liberar; distribui as pessoas entre as datas;
  aloca a carteira de 50% entre coberturas de falta e liberações; grava a
  **decisão** do gestor.
- **Não faz** (fica em outro módulo):
  - **não apura horas** — o saldo vem inteiro de
    [`central-jornada`](central-jornada.md) (`extras50AtualMs`);
  - **não decide quem folga** — a pergunta "esta pessoa descansa neste dia?" é
    respondida só pelo `FolgaService` de [`escala-domingo`](escala-domingo.md);
  - **não calcula estatística de venda** — usa as funções puras de
    [`vendas`](vendas.md) (`mediaPorDiaSemana`, `heatmapDiaSemanaHora`,
    `vendaMediaNaFaixa`);
  - **não marca débito de falta** — a ação é a que já existe em
    `POST /central-jornada/ausencia/:id/debito`; aqui ela só é **sugerida**;
  - **não altera a folga fixa da ficha** (`Colaborador.folgaDiaSemana`), que é
    regra semanal e não evento de uma data.

## 3. Arquivos do módulo

| Arquivo | Papel | Linhas (aprox.) |
|---|---|---|
| `compensacao-horas.domain.ts` | Motor puro: a conta contínua, a janela do turno, a alocação, os textos | 631 |
| `compensacao-horas.service.ts` | Junta os ingredientes (jornada, escala, férias, feriados, venda) e grava a decisão | 1083 |
| `compensacao-horas.controller.ts` | Rotas HTTP + permissão | 88 |
| `compensacao-horas.consulta.ts` | A única leitura das compensações aprovadas (função livre) | 77 |
| `compensacao-horas.module.ts` | Ligações (DI) do módulo | 39 |
| `dto/compensacao-horas.dto.ts` | Validação de entrada | 92 |

> **Por que `compensacao-horas.consulta.ts` é uma função livre, e não um método
> de serviço:** o único ingrediente é o Prisma, e a Central de Jornada precisa
> lê-la para apurar as horas. Se fosse um serviço injetado, os dois módulos se
> referenciariam em círculo. A alternativa (`forwardRef` nos dois lados)
> funciona, mas transforma qualquer erro de ordem de inicialização num
> `undefined` silencioso **dentro do cálculo de horas** — o pior lugar possível
> para uma dependência frágil. Mesmo padrão de
> `feriados/feriados.consulta.ts` e `escala-exportacao/escala-especiais.consulta.ts`.

## 4. Endpoints (rotas HTTP)

> A lista canônica e sempre atualizada está na
> [API HTTP](../05-referencia-dados/api-http.md#compensacao-horas).

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `GET /compensacao-horas?ciclo=` | `OPERADORES_AUSENCIAS` | Painel da seção: carteira de 50%, dias mais fracos, liberações e coberturas sugeridas, e o que já foi decidido. |
| `POST /compensacao-horas/aprovar` | `OPERADORES_AUSENCIAS` | Concede uma compensação, revalidando tudo antes de gravar. |
| `POST /compensacao-horas/recusar` | `OPERADORES_AUSENCIAS` | Descarta uma sugestão (pessoa + dia), para não voltar. |
| `POST /compensacao-horas/:id/cancelar` | `OPERADORES_AUSENCIAS` | Desfaz uma compensação concedida (a linha fica no histórico). |

**A permissão é a mesma do botão "Débito"** da Central, e isso é deliberado: por
decisão do dono do projeto, *débito é compensação* — as duas são a mesma
operação (usar horas de 50% para cobrir tempo não trabalhado) em duas direções no
tempo. Criar uma funcionalidade nova no catálogo afirmaria que conceder
compensação é um poder distinto de marcar débito, e não é.

## 5. Serviços e funções

### `CompensacaoHorasService`

#### `painel(deslocamento = 0)`
- **Recebe:** o deslocamento do ciclo (0 = atual).
- **Devolve:** `CompensacaoPainel` — `periodo`, `carteira`, `datasFracas`,
  `liberacoes`, `coberturas`, `decididas`, `bloqueio`.
- **Efeitos:** só leitura. Chama `central.resumoCiclo`, `folga.consultor`,
  `carregarMapaDeFeriados`, `carregarHorariosEspeciais`,
  `ferias.colaboradoresDeFeriasNoDia` (um por dia candidato),
  `escalaDomingo.obterAncora`, e lê `Ausencia`, `Colaborador`, `Fiscal`,
  `Usuario`, `EstimativaVendaDia`, `VendaDiaria`, `VendaHora`,
  `CompensacaoHoras`.
- **Para que serve:** é o único ponto que monta a seção. A ordem interna importa:
  **primeiro** as coberturas de falta consomem a carteira, **depois** o que sobra
  vira liberação. As duas bebem da mesma carteira (`extras50Ms`), e sugerir as
  duas sem descontar uma da outra prometeria as mesmas horas duas vezes — o erro
  mais fácil de cometer aqui e o mais difícil de perceber depois.
- **Não lança:** quando não há o que sugerir, devolve `bloqueio` preenchido em
  vez de erro (ver §7).

#### `aprovar(dto, usuario?)`
- **Recebe:** `AprovarCompensacaoDto` + o usuário autenticado.
- **Devolve:** `CompensacaoView` (a linha gravada).
- **Efeitos:** grava (upsert) em `CompensacaoHoras` com status `APROVADA` e o
  **retrato da justificativa** (motivo, venda prevista e sua fonte, saldo da
  época, cobertura no dia).
- **Revalida tudo**, em vez de confiar no que a tela mandou — entre calcular a
  sugestão e o gestor tocar no botão, o dia pode ter virado feriado, folga ou
  ausência, o ciclo pode ter fechado e o saldo pode ter mudado (uma batida nova
  já altera a apuração).
- **Erros:** `404` colaborador inexistente; `400` colaborador inativo, função
  fora da escala, dia fora do ciclo aberto, domingo/feriado, dia de folga,
  minutos fora da faixa `1..carga do dia`, ou minutos acima do saldo real;
  `409` (`CicloFechadoError`) ciclo fechado.

#### `recusar(dto, usuario?)`
- **Efeitos:** grava (upsert) status `RECUSADA` com zero minutos.
- **Para que serve:** as sugestões são **recalculadas** a cada consulta, então
  sem o registro a mesma linha reaparece todos os dias até o gestor deixar de ler
  a seção. O `motivo` é opcional, mas é o único caminho para as sugestões
  melhorarem: sem ele só se sabe que o gestor não quis, nunca por quê.

#### `cancelar(id, usuario?)`
- **Efeitos:** muda o status para `CANCELADA` (não apaga a linha) e exige ciclo
  aberto. "Foi concedida e desfeita" é exatamente o que alguém vai querer
  consultar depois.

#### `carregarMovimento(candidatas)` _(privado)_
Previsão de movimento por data + heatmap por hora, nesta ordem de confiança:
1. **`EstimativaVendaDia` daquela data** — é a previsão da própria gestão, por
   data, e já embute o efeito do calendário de pagamento, que numa loja pesa mais
   do que o dia da semana;
2. **média histórica do dia da semana** (janela de 90 dias, feriados fora, mínimo
   de 3 observações);
3. **nada** — a data não é sugerida. Ranquear dia fraco por ruído seria pior do
   que não ranquear.

#### `agruparFaltasCobriveis(...)` _(privado)_
Seleciona as faltas que o gestor poderia debitar hoje à mão: sem atestado (já é
ausência abonada), sem débito marcado, e ainda `PENDENTE` ou `INJUSTIFICADA` —
nunca uma já `JUSTIFICADA`, que foi perdoada e não deve consumir horas de
ninguém. Domingo e feriado ficam fora porque não geram hora devida por nenhum
caminho.

## 6. Lógica de domínio (funções puras)

- `planoDoDia(cargaMs, saldoMs, regras)` → **a conta que dá nome à regra**:
  `compensar = min(saldo, carga)` e `trabalhar = carga − compensar`. Devolve
  também `semIntervalo` (a jornada que sobra cabe em 4h50) e `presencaMs`.
  Nunca compensa mais do que a pessoa tem nem do que o dia comporta.
- `janelaDeTrabalho(entrada, saida, presencaMs, vendaNaFaixa)` → em que **ponta**
  do turno a pessoa cumpre as horas restantes. Só as pontas são candidatas (um
  buraco no meio do turno obrigaria a sair e voltar); entre as duas, fica-se com
  a que cobre a **maior** venda média. Empate resolve por `INICIO`.
- `coberturasDeFalta(saldoMs, faltas)` → quais faltas passadas cobrir, das mais
  antigas para as mais novas, **sempre inteiras**, devolvendo o saldo restante.
- `ordenarPorUrgencia(pessoas)` → TAC primeiro, depois maior saldo, depois nome
  (para a ordem não embaralhar entre consultas).
- `alocarLiberacoes(pessoas, datas, ctx)` → a alocação: cada pessoa recebe a data
  de menor `custo = movimento + jáAlocados × penalidade`.
- `resumirCarteira(...)` → o resumo, cujo número central é `naoAlocadoMs`.
- `nomeDiaSemana`, `dataCurta`, `duracao`, `reaisCurto`, `textoLiberacao`,
  `textoCobertura`, `minutosParaHora`, `horaParaMinutos` → formatação e as frases
  de justificativa. **As frases moram aqui, e não na tela**, por dois motivos: o
  app e um relatório futuro devem dizer exatamente a mesma coisa, e a frase é o
  retrato gravado no banco quando o gestor decide.

Constantes: `MIN_SALDO_COMPENSAVEL_MS` (3h), `MIN_FISCAIS_DISPONIVEIS` (2),
`PENALIDADE_ACUMULO` (0,1).

## 7. Estados e enums

- `StatusCompensacao`: `APROVADA` · `RECUSADA` · `CANCELADA`.
  **Não existe `SUGERIDA`**: as sugestões são calculadas a cada consulta (como
  todo número de jornada neste sistema) e nunca gravadas — gravá-las encheria a
  tabela de recomendações que ninguém leu. Transições: qualquer estado →
  qualquer estado, pelo upsert de `aprovar`/`recusar`, e `APROVADA → CANCELADA`
  por `cancelar`. Só `APROVADA` altera horas.
- `OrigemCompensacao`: `SUGESTAO` · `MANUAL`.
- `FonteMovimento`: `ESTIMATIVA` · `HISTORICO`.
- `FuncaoCompensavel`: `OPERADOR` · `FISCAL` · `SUPERVISOR` (gerência não é
  escalada, logo não compensa).
- `BloqueioSugestao`: `CICLO_PASSADO` · `CICLO_FECHADO` · `SEM_DATA_DISPONIVEL` ·
  `SEM_DADO_DE_VENDA`. É o motivo de **não** haver sugestões, para a tela
  explicar em vez de mostrar uma lista vazia.

## 8. Dados que o módulo toca

Ver [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

- **Lê:** `Colaborador`, `Ausencia`, `Fiscal`, `Usuario`, `EscalaEntry` (via
  `carregarHorariosEspeciais` e `FolgaService`), `ConfigSistema` (âncora do
  rodízio), `Feriado`, `FeriasColaborador`, `EstimativaVendaDia`, `VendaDiaria`,
  `VendaHora`, `CicloFolha`, `CompensacaoHoras`.
- **Escreve:** `CompensacaoHoras` (a única escrita do módulo).

## 9. Dependências

- **Depende de:** [`central-jornada`](central-jornada.md) (saldo apurado),
  [`escala-domingo`](escala-domingo.md) (`FolgaService`, âncora do rodízio),
  [`feriados`](feriados.md), [`ferias`](ferias.md),
  [`ciclo-folha`](ciclo-folha.md), [`tipos-contrato`](tipos-contrato.md),
  [`vendas`](vendas.md) (funções puras) e `ponto.domain` (carga do dia e
  `diaPagaAdicional100`).
- **É usado por:** a card "Compensação de horas" na área
  [`ponto`](../04-atlas-mobile/ponto.md) do app. A dependência com a Central é
  **de mão única**: este módulo importa a Central; a Central lê as compensações
  pela função livre `carregarCompensacoesAprovadas`.

## 10. Regras de negócio-chave

1. **A conta é uma só; não existem modalidades.** `compensar = min(saldo, carga)`
   e `trabalhar = carga − compensar`. Carga de 7h e saldo de 5h: trabalha 2h e vai
   para casa. O "dia inteiro" não é uma modalidade — é o caso em que a conta dá
   zero. "Meio dia" nunca precisou existir: metade da jornada é um número
   arbitrário, que só apareceria por coincidência.
2. **Mínimo de 3h de saldo para sugerir.** Abaixo disso mexer no dia de alguém
   para devolver 40 minutos custa mais atenção do que resolve.
3. **Domingo e feriado estão fora por ARITMÉTICA, não só por política.** Ali o
   excedente é de 100%, e 100% **nunca** é debitada (regra 6 da Central): liberar
   um domingo não reduziria o saldo de 50% em nada — seria uma compensação que
   não compensa.
4. **A compensação tem de cair no ciclo aberto.** Se as 9h de 50% são do ciclo
   que fecha no dia 25 e a pessoa é liberada no dia 28, o sistema **não zerou
   nada**: a loja paga as 9h e a pessoa começa o ciclo seguinte devendo. Piorou
   duas vezes. Cada ciclo é independente em horas; só atestado e férias
   atravessam o corte, porque não são controláveis.
5. **A folga é decidida só pelo `FolgaService`.** Liberar quem já está de folga
   compensa zero, e reimplementar o "está de folga?" é o erro que criou a
   necessidade daquele serviço.
6. **Coberturas de falta antes de liberações.** Cobrir uma falta já ocorrida não
   mexe na escala, não tira ninguém do caixa, elimina um desconto em folha para a
   pessoa e apaga um passivo de 50% para a loja. Gastar a carteira numa liberação
   futura, que custa cobertura, só faz sentido depois de esgotado o que não custa
   nada.
7. **A falta é coberta inteira ou não é coberta.** Uma cobertura parcial deixaria
   a pessoa devendo horas — decisão legítima do gestor, mas nunca uma sugestão
   automática apresentada como "de graça".
8. **Cobrir com horas não apaga a falta.** O débito quita a hora; não apaga a
   ausência nem o registro para advertência. A frase de justificativa diz isso
   explicitamente, ou o abono passa a ser lido como perdão.
9. **Piso de cobertura só para fiscais: 2 disponíveis no dia.** Operadores e
   supervisores não têm piso — os 20 de `COBERTURA_MINIMA` seguem valendo como
   alerta do dia, mas **não vetam** uma compensação. Mostra-se a cobertura
   resultante em cada linha e o gestor decide com o número na frente.
10. **A alocação distribui.** Cada pessoa já alocada numa data encarece aquela
    data em 10% do movimento médio. Sem isso, todas as compensações do ciclo
    cairiam no dia mais fraco e a seção esvaziaria a loja justamente no dia que
    ela própria recomendou.
11. **A liberação vai para a ponta do turno, nunca para o meio.** Compensação
    real é entrar mais tarde ou sair mais cedo; um buraco no meio do turno é
    inexecutável. Entre as duas pontas, fica-se com a que cobre mais venda.
12. **Um dia parcial sem turno conhecido não é sugerido.** "Trabalhe 2h" sem
    dizer quais 2h é uma sugestão inexecutável. Um dia **inteiro** livre não
    precisa de turno, e aí a ausência de horário é normal.
13. **Uma pessoa recebe no máximo uma liberação por rodada.** Compensar em dois
    dias é possível, mas exige aplicar a primeira e voltar: sugerir dois dias de
    uma vez multiplica o erro quando a premissa (o saldo) muda depois da primeira
    aplicação.
14. **Nunca sugerir sem o número que justifica.** Cada linha carrega a venda
    prevista, sua fonte, a comparação com a média e a cobertura resultante. Uma
    sugestão sem justificativa visível não é usada: é obedecida ou ignorada, e as
    duas coisas são piores.
15. **Quando o dado não sustenta, não sugere** — e diz por quê (`BloqueioSugestao`).
    Mesmo princípio de `sugestao-folga.domain.ts`: um palpite errado sobre o
    descanso de alguém é pior do que nenhum palpite, porque o gestor pode
    aplicá-lo sem verificar.
16. **Feriados saem das médias de venda.** O movimento de um feriado não
    representa o dia da semana em que ele caiu, e feriado nunca é candidato —
    deixá-lo na média contaminaria a escolha com um dia que jamais será escolhido.
17. **Nada é aplicado sozinho.** Toda compensação exige aprovação explícita:
    mexe em folha e no descanso de pessoas.

## 11. Testes

| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `compensacao-horas.domain.spec.ts` | A conta contínua, a ponta do turno pelo heatmap, a carteira única (faltas antes de liberações), a urgência, a alocação com o piso de fiscais e o mínimo de 3h, e as invariantes de saldo | 38 |

> A integração com o cálculo de horas é validada em
> `central-jornada/compensacao-jornada.spec.ts` (12 casos) — ver
> [`central-jornada`](central-jornada.md), §11. Contagem sempre atualizada no
> [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências

- 🔧 **Efeito do dia do mês fora desta entrega.** O ranking de datas usa a
  estimativa da gestão e, na falta dela, a média do dia da semana. O ajuste pelo
  **calendário de pagamento** (que numa loja pesa mais que o dia da semana) ficou
  de fora por falta de história: o sistema começou em 2026-07-01, então cada dia
  do mês tem 2 a 3 observações — não sustenta um fator. Reavaliar com mais de um
  ano de dados.
- 🔧 **Uma consulta de férias por dia candidato.** `painel` chama
  `colaboradoresDeFeriasNoDia` para cada data do ciclo restante (até ~30). É
  deliberado — reaproveita a regra canônica em vez de duplicá-la —, mas cabe uma
  versão em lote no `FeriasService` se o painel ficar lento.
- ⚠️ **A qualidade da sugestão depende do envio dos `.txt` de venda.** Com
  histórico ralo, a seção devolve `SEM_DADO_DE_VENDA` em vez de sugerir mal. É o
  comportamento desejado, mas significa que a seção fica vazia enquanto as
  importações estiverem atrasadas.
- ⚠️ **A estatística de dia fraco é da LOJA, não do operador.** Ela diz quando a
  loja está calma, não quem é dispensável. A escolha de quem liberar vem do saldo
  e do risco de TAC, nunca do desempenho de vendas de alguém (venda não tem
  dimensão de operador).
- ✅ **Compensação não cria saldo negativo.** Garantido em três lugares: o
  domínio limita ao saldo e à carga, o `aprovar` revalida contra a apuração da
  Central, e há teste de invariante.
