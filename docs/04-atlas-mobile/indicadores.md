> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-09-16 · **Cobre:** `mobile/src/screens/indicadores/`

# Área: `indicadores`

## 1. Propósito
Painel de saúde dos **indicadores de arrecadação** (Troco Solidário, Recargas,
Cancelamentos, Devoluções) com semáforos, destaques do mês e "Precisa de
atenção"; o **detalhe** de cada indicador (meta, projeção, comparativo,
evolução mês a mês, tendência e ranking); o **Painel de Vendas** inteligente
(meta mensal, projeção, comparativos, curva horária e heatmap); e a fila de
**não reconhecidos**.

Inclui também os dois indicadores **calculados**, que não têm arquivo de
importação e por isso ficam fora do array `ARRECADACAO`: **Cancelamentos Totais**
(itens + cupom sobre as vendas, com teto próprio e um detalhe que diz o que está
impactando e o que fazer — [ADR 0025](../02-arquitetura/decisoes/0025-cancelamentos-totais-indicador-calculado.md))
e **Sacolas** ([ADR 0022](../02-arquitetura/decisoes/0022-indicador-sacolas-venda-por-sacola.md)).

O painel tem um **seletor de mês** no topo: os dados não são reiniciados no dia
1º, apenas troca o mês de referência. Voltar com a seta mostra qualquer mês da
janela de retenção (padrão 24 meses), sempre com a meta que valia nele.

## 2. Quem usa (perfis)
- **Equipe/gestão** que acompanha os indicadores: vê semáforos, destaques,
  detalhe, ranking e o Painel de Vendas.
- **Gestão** (`OPERADORES_CRUD`): abre "Não reconhecidos" para associar um
  código a um colaborador ou criar cadastro.
- A meta de vendas **não é editada em lugar nenhum**: é a soma das estimativas
  diárias, cadastradas em Centro de Controle ▸ Central de Vendas
  (`PAINEL_VENDAS_EDITAR`). Ver
  [ADR 0017](../02-arquitetura/decisoes/0017-meta-de-vendas-derivada-das-estimativas.md).
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `IndicadoresScreen.tsx` | Hub: seletor de mês, vendas, destaques, semáforos (inclusive **Cancelamentos Totais** e **Sacolas**) e painel de atenção | 899 |
| `IndicadorDetalheScreen.tsx` | Detalhe de um indicador (meta, projeção, evolução mensal, tendência, ranking, cancelamentos) | 1044 |
| `CancelamentosTotaisDetalheScreen.tsx` | Detalhe de **Cancelamentos Totais**: teto em R$ e excedente, composição itens × cupom, causas e ações, simulação dos maiores, ofensores, motivos, autorizadores, forma do dano e evolução mensal | 944 |
| `SacolasDetalheScreen.tsx` | Detalhe de **Sacolas**: teto de sacolas, projeção do fechamento, recebido × usado, dias de entrada (com o recebido do mês em fardos e entregas) e série do mês | 548 |
| `PainelVendasScreen.tsx` | Painel de vendas (meta, projeção, comparativos, curva, heatmap, por hora) | 700 |
| `NaoReconhecidosScreen.tsx` | Fila de códigos sem cadastro (associar/criar) | 284 |

## 4. Fluxo do usuário
1. **Hub:** `IndicadoresScreen` carrega, em paralelo, o resumo de cada indicador
   (mês), as vendas do mês, os destaques (Top 3) e o painel "Precisa de
   atenção". Cada indicador vira um semáforo (OK/atenção/fora da meta).
   O **seletor de mês** (◀ ▶) escolhe o mês de referência: o mês corrente usa
   "hoje" (parcial) e um mês fechado usa o seu último dia, o que devolve o mês
   inteiro. A seta de voltar para no limite da janela de retenção — antes dela
   não há dados, porque já foram apagados.
2. **Detalhe:** ao tocar num indicador (ou num alerta), abre
   `IndicadorDetalheScreen` no período (dia/semana/mês), com progresso da meta,
   projeção, comparativo com o período anterior, **evolução mês a mês**,
   tendência (14 dias), ranking em barras, participação em pizza e, quando
   aplicável, os cancelamentos. O cartão de evolução traz as barras dos últimos
   12 meses coloridas pelo semáforo de cada mês e, abaixo, a lista dos meses com
   movimento: valor, meta do mês e a variação vs o mês anterior — a seta mostra
   para onde o número foi e a **cor** diz se isso foi bom ou ruim.
3. **Cancelamentos Totais:** a card fica **logo depois** das duas metades que
   ela soma e abre `CancelamentosTotaisDetalheScreen`, que responde as duas
   perguntas úteis, nesta ordem: o mês (valor, teto em R$ e **excedente**), de
   onde vem (composição itens × cupom), **o que está impactando** (as causas),
   **o que fazer** (as ações), a **simulação** sem os maiores, quem mais pesa,
   os motivos e quem autorizou (só cupom), a forma do dano e a evolução mensal.
   A card do painel mostra só o valor com a meta e, se houver, o excesso em R$:
   o que ficou de fora dela está tudo aqui.
   O detalhe de **Sacolas** ganhou o mesmo tratamento: o "Recebido no mês"
   (fardos e entregas) abre o extrato de entradas, porque saiu da card.
4. **Vendas:** `PainelVendasScreen` mostra a venda do dia em destaque (com a
   estimativa do dia), a meta do mês e projeção, comparativos por data, horas
   que mais venderam, curva horária, heatmap dia×hora e o detalhe por hora.
5. **Não reconhecidos:** lista os códigos do mês sem cadastro; o gestor associa
   a um colaborador (conserta o histórico) ou cria um cadastro.
Todas tratam **carregando / erro / vazio**.

## 5. Dados e integração com o backend
| Ação na tela | Chamada | Endpoint |
|---|---|---|
| Resumo do indicador | `arrecadacaoService.resumo(tipo, data)` | `GET /arrecadacao/resumo` |
| Ranking | `arrecadacaoService.ranking(tipo, ini, fim)` | `GET /arrecadacao/ranking` |
| Detalhes | `arrecadacaoService.detalhes(tipo, ini, fim)` | `GET /arrecadacao/detalhes` |
| Histórico mensal | `arrecadacaoService.historico(tipo, meses?)` | `GET /arrecadacao/historico` |
| Tendência | `arrecadacaoService.tendencia(tipo, data, dias)` | `GET /arrecadacao/tendencia` |
| Comparativo | `arrecadacaoService.comparativo(tipo, data)` | `GET /arrecadacao/comparativo` |
| Projeção | `arrecadacaoService.projecao(tipo, data)` | `GET /arrecadacao/projecao` |
| Destaques do mês | `arrecadacaoService.destaquesMes(data)` | `GET /arrecadacao/destaques-mes` |
| Painel de atenção | `arrecadacaoService.painelAtencao(data)` | `GET /arrecadacao/painel-atencao` |
| Não reconhecidos (resumo) | `arrecadacaoService.naoReconhecidosResumo(...)` | `GET /arrecadacao/nao-reconhecidos/resumo` |
| Não reconhecidos (lista) | `arrecadacaoService.listarNaoReconhecidos(ini, fim)` | `GET /arrecadacao/nao-reconhecidos` |
| Associar código | `colaboradoresService.adicionarIdentificador(id, cod)` | `POST /colaboradores/:id/identificadores` |
| Vendas (resumo) | `vendasService.resumo(data)` | `GET /vendas/resumo` |
| Painel de vendas | `vendasService.painel(data)` | `GET /vendas/painel` |
| Vendas por hora | `vendasService.porHora(ini, fim)` | `GET /vendas/por-hora` |
| Cancelamentos Totais | `arrecadacaoService.cancelamentosTotais(anoMes)` | `GET /arrecadacao/cancelamentos-totais` |
| Detalhe de Cancelamentos Totais | `arrecadacaoService.cancelamentosTotaisDetalhe(anoMes)` | `GET /arrecadacao/cancelamentos-totais/detalhe` |
| Indicador de Sacolas | `insumosService.indicadorSacolas(anoMes)` | `GET /insumos/indicador-sacolas` |
| Detalhe de Sacolas | `insumosService.detalheSacolas(anoMes)` | `GET /insumos/indicador-sacolas/detalhe` |

Módulos do backend relacionados: [`arrecadacao`](../03-atlas-backend/arrecadacao.md)
e [`vendas`](../03-atlas-backend/vendas.md); associação de códigos usa
[`colaboradores`](../03-atlas-backend/colaboradores.md); o indicador de Sacolas vem
de [`insumos`](../03-atlas-backend/insumos.md).

## 6. Estado local e regras de UI
- **Cancelamentos Totais entra no meio da lista, não no fim.** A card é renderizada
  dentro do `map` dos semáforos, imediatamente **depois** de `CANCELAMENTO_CUPOM`:
  um total lido antes das partes não se entende, e lido longe delas parece um sexto
  indicador independente. Fundo e recuo levemente diferentes indicam, sem texto,
  que é o consolidado das duas de cima.
- **A card é enxuta e lê como as vizinhas:** `1,24% (meta ≤ 0,75%)`, no mesmo
  formato das três cards de cancelamento/devolução. A explicação de que o teto é
  próprio (e não a soma dos dois tetos) **não** fica aqui — vive no detalhe e no
  card da meta em Metas. Um painel é para bater o olho; a explicação é um toque
  adiante. Foi o enxugamento pedido pelo dono do projeto.
- **A única linha extra é o excesso, e só quando existe:** em vermelho,
  "R$ 350,00 acima do permitido". O percentual diz que há um problema; os reais
  dizem o tamanho dele — e é o número que se leva para uma conversa.
- **A meta exibida vem do servidor** (`indicador.meta`), não de um padrão
  espelhado no app. Editar o teto do mês em Metas muda o que se lê na card. É
  justamente a divergência que as cinco cards de arrecadação ainda têm: elas
  mostram `def.meta`, do código, e colorem pela meta do servidor.
- **Mês sem venda registrada não mostra 0,00% e não recebe cor.** A card escreve
  "Sem venda registrada neste mês". É a correção do comportamento dos outros cinco
  indicadores, que devolvem 0% quando falta o arquivo de vendas e por isso pintam
  de verde um mês sobre o qual nada se sabe (ADR 0025).
- **Uma falha no indicador não derruba o painel** (`.catch(() => null)`, como
  Sacolas, os destaques e o painel de atenção): a card simplesmente não aparece.
- **A definição vive fora do array `ARRECADACAO`** (`CANCELAMENTOS_TOTAIS_DEF` em
  `utils/rotulos.ts`). Aquele array é a lista de arquivos a importar e o espelho de
  `TIPOS_ARRECADACAO`: entrar nele faria Importações pedir um arquivo inexistente e
  o fechamento do dia nunca concluir.
- **No detalhe, a simulação só aparece quando o mês está fora do teto** — dentro
  dele não há o que resolver. E as causas/ações vêm **prontas do backend**: a tela
  não recalcula nem reescreve texto, para o app, um aviso futuro e um relatório
  contarem a mesma história sobre o mesmo mês.
- **O detalhe declara as suas limitações:** que os motivos e os autorizadores
  cobrem apenas a metade do cupom, e que o ranking só inclui colaboradores
  cadastrados (embora o total some todos).
- **Sacolas tem card própria, também enxuta.** Ela fica junto dos cinco semáforos
  de arrecadação porque é um indicador de gestão, mas o denominador dela são
  **sacolas recebidas** — não as vendas nem um valor fixo. A linha "N fardos
  recebidos em N entregas" e o aviso de calendário **saíram da card** (pedido do
  dono do projeto) e passaram para o detalhe: o recebido do mês virou a primeira
  linha do extrato de entradas, e o aviso já era exibido lá. O esclarecimento da
  base continua escrito, só que um toque adiante — ver a atualização na
  [ADR 0022](../02-arquitetura/decisoes/0022-indicador-sacolas-venda-por-sacola.md).
- **O valor nunca aparece sozinho:** vem sempre com a distância até o piso
  ("R$ 30,00 por sacola · +R$ 2,00 (piso R$ 28,00)"). Ver o número é informação;
  ver o desvio é conclusão — foi a forma pedida pelo dono do projeto.
- **Mês sem entrega não mostra R$ 0,00.** Exibe "Sem entrada de sacolas neste mês"
  e **sem semáforo**: pintar de vermelho um mês em que o caminhão não veio seria
  acusar a loja de algo que não aconteceu. O mesmo para "sem venda registrada",
  que quase sempre significa arquivo de venda ainda não enviado.
- **O semáforo de Sacolas é "maior é melhor"** — passar do piso é verde, ficar
  abaixo é amarelo/vermelho. `nivelMes` (dos outros indicadores) passou a decidir
  pelo **sentido** e não pela base, espelhando o backend (ADR 0022): sem isso, o
  app e o servidor discordariam sobre a cor do mesmo mês.
- **Uma falha no indicador de Sacolas não derruba o painel** (`.catch(() => null)`,
  como os destaques e o painel de atenção): a card simplesmente não aparece.
- **O que sobrou nas duas cards calculadas:** ícone, nome, valor com a sua
  referência e — só em Cancelamentos Totais, só quando há excesso — a linha
  vermelha. Nada mais. Todo o resto (composição, causas, ações, fardos, entregas,
  avisos) vive nas telas de detalhe.
- O nível do semáforo (`nivelMes`/`avaliarCor`) depende da **base** do
  indicador: `FIXA` compara o total com a meta; `VENDAS` compara o percentual
  sobre as vendas (meta como teto).
- O mês de referência do hub é estado local (`anoMes`, padrão o mês corrente de
  Brasília). A seta de avançar é desabilitada no mês corrente e a de voltar no
  limite da janela (`MESES_HISTORICO_INDICADORES`, espelho do padrão do backend
  usado só para limitar a navegação).
- No detalhe, o histórico vive numa **requisição própria** (dependente só do
  tipo): é a janela inteira e não deve recarregar a cada troca de data/período.
- Um mês sem movimento aparece como "sem dados" (barra cinza) e fica fora da
  lista de evolução: um mês vazio não é uma queda.
- No detalhe, o período (dia/semana/mês) define o intervalo calculado no
  cliente (`intervaloDoPeriodo`); chegar de um "ponto de atenção" foca no mês e
  mostra a causa primeiro (`foco`).
- Painel de Vendas: a estimativa do dia funciona como "meta do dia" (marca
  quando atingida); horas sem venda são filtradas dos gráficos; o período
  personalizado normaliza início/fim invertidos.
- **Dia e mês vêm do mesmo cadastro:** a "meta do dia" é a estimativa daquele
  dia e a meta do mês é a soma das estimativas — por construção, coerentes.
- Quando o mês não tem estimativas, `metaMensal` chega **0** e o cartão "Meta do
  mês" cai na variante sem comparação: mostra faturamento e projeção, com um
  aviso que encaminha para a **Central de Vendas** (antes apontava para Metas).
- "Não reconhecidos" agrega por mês; a busca de colaborador limita a 8
  resultados e a associação pede confirmação (afeta o histórico).

## 7. Lógica pura / utilidades
- `textoCancelamentosTotais` (valor + meta do servidor, ou a explicação do mês sem
  denominador) no hub; `corNivel`/`fundoNivel`/`rotuloNivel`, `ppTexto`,
  `rotuloPerfil` e `explicacaoPerfil` no detalhe de Cancelamentos Totais. O
  **diagnóstico não é calculado aqui**: vem do domínio do backend.
- `intervaloDoPeriodo`, `totalDoPeriodo`, `percentualDoPeriodo`,
  `vendasDoPeriodo` (janelas e leitura do resumo por período).
- `nivelMes`/`avaliarCor` e mapeamentos de cor/ícone dos semáforos.
- `mesDe` (primeiro/último dia do mês) em "Não reconhecidos".
- `corNivelMes` e `valorMesFormatado` (cartão de evolução mensal).
- Período mensal compartilhado em `../utils/periodoMensal` (`mesAtual`,
  `deslocarMes`, `rotuloMes`, `ultimoDiaDoMesISO`, `mesesAtras`) — ver
  [Hooks e utilidades](hooks-e-utilidades.md).
- Rótulos de indicadores em `../utils/rotulos` (`ARRECADACAO`,
  `ROTULO_TIPO_ARRECADACAO`).

## 8. Componentes e hooks compartilhados usados
- `useRequisicao` — ver [Hooks e utilidades](hooks-e-utilidades.md).
- `Tela`, `Cartao`, `Selo`, `Segmentado`, `SeletorData`, `Botao`, `CampoTexto`,
  `Aviso`, `EstadoVazio`, `MensagemErro`, `Carregando`, `GraficoPizza`
  (`montarFatias`), `GraficoBarrasVerticais`; `ApiError`, `confirmar`/`notificar`
  — ver [Componentes compartilhados](componentes-compartilhados.md).

## 9. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `NaoReconhecidosScreen.test.tsx` | Lista com aviso de total, estado vazio e associação de código | 3 |
| `PainelVendasScreen.test.tsx` | Faturamento/projeção do mês, venda do dia e estimativa atingida | 3 |
| `IndicadoresScreen.test.tsx` | Card de Sacolas: valor **sempre** com o desvio até o piso, desvio negativo, mês sem entrada e sem venda explicados (nunca R$ 0,00), a **ausência** de fardos/entregas e do aviso de calendário (foram para o detalhe), degradação silenciosa e o mês pedido | 8 |
| `SacolasDetalheScreen.test.tsx` | Detalhe de Sacolas: os fardos que **ainda cabem** em destaque, a fonte da venda esperada e quanto já é fato, o aviso de que a saída também pode ser vender mais, teto estourado mostrando a venda que faltaria (sem número negativo), a projeção com a suposição escrita, acúmulo × desperdício, o extrato de entradas e o **"Recebido no mês"** em fardos e entregas (com plural correto) | 10 |
| `IndicadoresScreen.test.tsx` (2ª suíte) | Card de Cancelamentos Totais: valor no formato das vizinhas (`1,10% (meta ≤ 0,75%)`), a meta vinda **do servidor** e não de um padrão fixo, o excedente em R$, a **ausência** da explicação do teto na card, mês dentro do teto sem linha de excesso, mês sem venda explicado (nunca 0,00% verde), degradação silenciosa e o mês pedido | 8 |
| `CancelamentosTotaisDetalheScreen.test.tsx` | Detalhe: teto em R$ e excedente, o aviso de que o teto não é a soma dos tetos das partes, a composição com o % de cada metade sobre as vendas, causas e ações do diagnóstico, a simulação dizendo o que bastaria resolver (e a sua ausência quando o mês está dentro), o ranking combinado com a quebra itens/cupom, o aviso de que os motivos só cobrem o cupom, o mês sem venda e a forma do dano | 11 |

## 10. Riscos, dívidas e pendências
- 🔧 `IndicadorDetalheScreen.tsx` (>800 linhas) reúne muitos sub-gráficos num só
  arquivo; candidato a extrair cada cartão.
- ⚠️ Os totais dos indicadores já incluem os **não reconhecidos** (gente de
  fora conta); a associação corrige o histórico retroativamente.
- ⚠️ Vários cálculos de janela (dia/semana/mês) ficam no cliente e usam UTC;
  divergências de fuso devem ser conferidas com o backend.
- ⚠️ O **semáforo da meta** (verde ≥ 100%, amarelo ≥ 60%, vermelho abaixo) e o
  percentual de cumprimento são recalculados **no cliente**, duplicando a
  matemática que o backend já faz. Candidatos a virar campo da resposta.
- ⚠️ **A meta do mês agora muda quando as estimativas mudam.** Editar um dia na
  Central de Vendas altera o cartão "Meta do mês" — é o comportamento desejado,
  mas surpreende quem esperava uma meta fixa.
- ⚠️ O limite da navegação de meses é um espelho do padrão do backend (24). Se a
  retenção do servidor for alterada por variável de ambiente, o app só saberá
  disso pelo campo `mesesRetencao` do histórico — a seta continuará limitada a
  24 meses até o espelho ser ajustado.
- ⚠️ **Duas leituras do "mês sem vendas" convivem no painel.** A card de
  Cancelamentos Totais explica a falta e não recebe cor; as cinco cards de
  arrecadação continuam mostrando "0,00%" em verde no mesmo mês. Alinhar as cinco
  ao novo comportamento depende de mudar o backend (ver
  [`arrecadacao`](../03-atlas-backend/arrecadacao.md), §12).
- 🔧 `CancelamentosTotaisDetalheScreen.tsx` (>700 linhas) reúne dez cartões num só
  arquivo, como o detalhe de indicador; candidato a extrair cada cartão.
- ⚠️ O aviso "o teto do total não é a soma dos tetos" está escrito em **dois
  lugares** (detalhe e tela de Metas; saiu da card no enxugamento). O valor é único
  (`metas_mensais`), mas os textos precisam ser mantidos em sincronia.
- ⚠️ **A card enxuta esconde contexto de propósito.** Quem olha só o painel não vê
  que o teto do total é independente, nem quantas entregas de sacola houve no mês.
  Foi a escolha do dono do projeto (painel limpo, explicação no detalhe); vale
  lembrar dela se alguém reportar que "falta informação na tela".
- ⚠️ `CANCELAMENTOS_TOTAIS_DEF.metaPadrao` é um espelho do padrão do backend
  (0,75). Serve apenas de referência: a cor e os textos usam sempre a meta que o
  servidor devolve, então uma divergência não pinta nada errado — mas convém
  ajustar o espelho se o padrão mudar.
