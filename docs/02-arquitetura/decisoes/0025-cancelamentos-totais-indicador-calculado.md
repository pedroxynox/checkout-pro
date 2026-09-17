> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-09-16 · **Cobre:** `backend/src/arrecadacao/cancelamentos-totais.*`, `mobile/src/screens/indicadores/CancelamentosTotaisDetalheScreen.tsx`

# ADR 0025 — "Cancelamentos Totais": indicador calculado, com teto próprio

## Contexto

Os cancelamentos da frente de caixa chegam ao sistema em **dois arquivos
separados**, cada um com o seu indicador e a sua meta:

| Indicador | Base | Meta padrão |
|---|---|---|
| `CANCELAMENTO_ITENS` | % sobre as vendas | 0,75% |
| `CANCELAMENTO_CUPOM` | % sobre as vendas | 0,50% |

Na prática, a gestão não decide olhando cada metade: decide olhando **quanto a
loja cancelou**. Com os dois indicadores separados, as duas metades podiam estar
individualmente dentro das suas metas enquanto o total cancelado subia sem que
nenhum semáforo acendesse — não havia nenhum número que respondesse "a loja está
cancelando muito?".

O dono do projeto pediu então um indicador novo, **Cancelamentos Totais**: a soma
dos dois, sobre as vendas, com meta editável por mês (0,75% de partida) e o mesmo
comportamento de semáforo do Cancelamento de Itens. E pediu que a card não
parasse no número: deveria mostrar **o que está impactando** e **o que fazer para
melhorar**.

## Decisão

### 1. É um indicador **calculado**, não um sexto arquivo

`CANCELAMENTOS_TOTAIS` **não** entra em `TIPOS_ARRECADACAO`. Ele é derivado dos
lançamentos que os dois arquivos já gravam em `registros_arrecadacao`.

Esta é a parte não-óbvia da decisão, e o motivo é concreto: `TIPOS_ARRECADACAO`
não é uma lista de indicadores, é o **contrato do fechamento do dia**.

- `fechamento.service.ts` só considera o dia completo quando **todos** os tipos
  da lista foram enviados ou marcados como "sem movimento"
  (`TIPOS_ARRECADACAO.every(...)`);
- `fechamento.domain.ts` monta o checklist do dia percorrendo a mesma lista;
- `ImportacoesScreen` transforma a lista na sequência numerada de arquivos a
  carregar.

Um tipo novo ali passaria a exigir para sempre um arquivo que ninguém pode subir:
**o fechamento do dia nunca mais concluiria** e o fiscal veria um passo pendente
eterno. O preço de "só acrescentar na lista" seria quebrar a rotina diária da
loja.

O molde seguido é o do indicador **Sacolas** ([ADR 0022](0022-indicador-sacolas-venda-por-sacola.md)):
card própria no painel, tela de detalhe própria, endpoint próprio, e nenhuma
participação no ciclo de importação.

### 2. O teto é **próprio e independente**, não a soma dos dois

`CANCELAMENTOS_TOTAIS` entra em `TIPOS_META` como meta **digitada** (não
derivada), unidade `PERCENTUAL`, sentido `MENOR_MELHOR`, padrão **0,75%** —
editável mês a mês em Centro de Controle ▸ Metas.

Foi considerada a alternativa de derivar a meta da soma das duas (0,75 + 0,50 =
1,25%). Ela tem uma propriedade atraente: garante que, se as duas metades estão
verdes, o total também está — o painel nunca se contradiz. Foi **recusada** por
decisão de produto: um teto de 1,25% é mais frouxo do que qualquer uma das partes
e não aperta nada. O teto escolhido é deliberadamente mais exigente.

A consequência é aceita e **tem de estar escrita**: as duas metades podem aparecer
verdes com o total em amarelo. Sem esse aviso, a combinação parece um defeito do
sistema. A explicação vive na **tela de detalhe** e no card da meta em Centro de
Controle ▸ Metas — os dois lugares onde o gestor vai quando quer entender o
número.

A card do painel **não** repete a frase: a pedido do dono do projeto, ela ficou
enxuta e lê como as vizinhas ("1,24% (meta ≤ 0,75%)"), com uma única linha extra,
em vermelho e só quando existe, dizendo o excesso em reais. Um painel é para bater
o olho; a explicação é um toque adiante.

> **Atualização (2026-09-17).** Também por pedido do dono do projeto, a card deixou
> de ter desenho próprio (fundo e recuo distintos) e saiu do meio da lista: agora
> fecha o bloco dos indicadores de arrecadação, **depois de Devoluções**, com
> exatamente o mesmo visual das demais. A consequência aceita é que nada no visual
> indica que ela soma duas das cards acima — o que esclarece isso é a posição
> (imediatamente após as partes) e o detalhe.

### 3. O semáforo é o **mesmo**, reaproveitado — nada recalculado

A cor vem de `nivelDoMes(sentido, valor, meta)`, a fonte única já usada pelos
outros indicadores, chamada com `MENOR_MELHOR`: dentro da meta = `OK`, até 1,5× a
meta = `ATENCAO`, acima = `FORA`. Nenhum limiar novo foi criado e nenhuma cópia da
regra foi adicionada — se um limiar mudar, muda para os dois juntos.

As metas seguem independentes por indicador, como pedido: reaproveitar a **função**
não é unificar os **valores**.

### 4. Sem venda registrada, o mês fica **sem número e sem cor**

Os cinco indicadores de arrecadação devolvem `percentual = 0` quando as vendas do
mês são zero. O efeito colateral é grave: um mês em que o arquivo de vendas
simplesmente **ainda não foi importado** aparece como 0% e é pintado de **verde** —
o painel afirma "está ótimo" exatamente quando não sabe nada.

Este indicador não repete o erro: `percentual` vem `null`, o estado explica o
porquê (`SEM_VENDA` ou `SEM_MOVIMENTO`) e **não há semáforo**. É o mesmo critério
da ADR 0022 para o mês sem entrega de sacolas: não afirmar é melhor do que
afirmar o oposto.

Zero cancelamento **com** venda registrada continua sendo um 0% legítimo — e
verde.

### 5. A card responde "o que está impactando" e "o que fazer"

O detalhe não é um relatório: é um diagnóstico determinístico, calculado em
`cancelamentos-totais.domain.ts` a partir dos números do mês.

| Leitura | O que responde |
|---|---|
| **Composição** | Qual das duas partes manda (dominante a partir de 60% do valor). |
| **Excedente em R$** | O percentual traduzido em dinheiro — o número que se discute numa reunião. É a única dessas leituras que também aparece na card do painel. |
| **Concentração** | É gente ou é processo: se os 3 maiores somam menos de 50%, o valor está espalhado. |
| **Simulação** | O mês sem os 3 maiores: "resolvendo estes, fecha dentro". |
| **Motivos** e **autorizações** | Só do cupom — e a tela diz isso, uma vez, no cartão que reúne as duas leituras. |
| **Perfil dos lançamentos** | Muitos de valor baixo (rotina) ou poucos de valor alto (exceção). |

As **ações são deduzidas** dessas leituras, não fixas. Uma frase fixa ("revisar os
cancelamentos de maior valor") serve para qualquer mês e por isso não muda o
comportamento de ninguém; a recomendação deduzida fala de escaneamento quando o
peso está em itens e espalhado pela equipe, e de critério de autorização quando
está em cupom e concentrado em três pessoas.

O texto mora no **domínio** e não na tela, para que o app, um aviso futuro e um
relatório contem a mesma história sobre o mesmo mês.

### 6. O histórico não ganha foto própria

A série mensal é apurada ao vivo dentro da janela de retenção (onde os lançamentos
crus ainda existem) e, para um mês fechado que já perdeu o dado cru, é a **soma
das fotos dos dois tipos** (`fotos_mes_indicador`), que já guardam total e vendas.

Não se grava uma foto de `CANCELAMENTOS_TOTAIS`. Somar duas verdades já congeladas
é sempre coerente; uma terceira foto do mesmo mês criaria a possibilidade de as
três divergirem — e de ninguém saber qual está certa. Como efeito colateral
positivo, o indicador nasce **com histórico completo**, sem esperar meses para
acumular dados.

## Consequências

**Positivas**
- Nenhuma mudança na rotina da loja: nenhum arquivo novo, nenhum passo novo em
  Importações, nenhum risco para o fechamento do dia.
- Um único número responde "a loja está cancelando muito?", com teto mais
  exigente que as partes.
- Histórico de 24 meses disponível desde o primeiro dia.
- O indicador chega com o comportamento correto para o mês sem vendas — e serve
  de referência para corrigir os outros cinco.

**Negativas / limites**
- **Motivos e autorizações abrangem apenas os cancelamentos de cupom.** O arquivo
  de cancelamento de itens não traz essas colunas. A tela declara isso; sem o
  aviso, o gestor tomaria a conclusão errada.
- **Não há leitura por hora ou por turno.** Os arquivos de cancelamento não
  trazem a hora. Isso exigiria mudar a origem dos dados, não o indicador.
- **O ranking só inclui colaboradores cadastrados.** Lançamentos sem cadastro
  somam no total mas não aparecem entre os ofensores — é a regra já vigente do
  módulo, e a diferença fica escrita na tela.
- **Dois lugares passam a citar o mesmo teto** (a card e a tela de Metas). O
  valor é único (`metas_mensais`), mas o texto explicativo está duplicado e deve
  ser mantido em sincronia.
- Qualquer desdobramento futuro dos cancelamentos (um terceiro tipo de arquivo)
  precisa entrar em `TIPOS_DO_TOTAL` para continuar somando.

## Alternativas consideradas

1. **Sexto tipo em `TIPOS_ARRECADACAO`.** Recusada: quebraria o fechamento do dia
   e pediria um arquivo inexistente (ver Decisão 1).
2. **Meta derivada = soma das duas metas.** Recusada por produto: 1,25% é mais
   frouxo que as partes e não aperta nada (ver Decisão 2).
3. **Reaproveitar `IndicadorDetalheScreen`.** Recusada: aquela tela é acoplada ao
   catálogo `ARRECADACAO` e ramifica em `base === 'FIXA' | 'VENDAS'`; e as
   perguntas desta tela (composição, concentração, simulação, motivos) não
   existem lá.
4. **Gravar foto mensal própria.** Recusada: criaria uma terceira verdade para o
   mesmo mês (ver Decisão 6).
