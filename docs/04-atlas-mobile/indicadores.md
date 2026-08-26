> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-08-26 · **Cobre:** `mobile/src/screens/indicadores/`

# Área: `indicadores`

## 1. Propósito
Painel de saúde dos **indicadores de arrecadação** (Troco Solidário, Recargas,
Cancelamentos, Devoluções) com semáforos, destaques do mês e "Precisa de
atenção"; o **detalhe** de cada indicador (meta, projeção, comparativo,
evolução mês a mês, tendência e ranking); o **Painel de Vendas** inteligente
(meta mensal, projeção, comparativos, curva horária e heatmap); e a fila de
**não reconhecidos**.

O painel tem um **seletor de mês** no topo: os dados não são reiniciados no dia
1º, apenas troca o mês de referência. Voltar com a seta mostra qualquer mês da
janela de retenção (padrão 24 meses), sempre com a meta que valia nele.

## 2. Quem usa (perfis)
- **Equipe/gestão** que acompanha os indicadores: vê semáforos, destaques,
  detalhe, ranking e o Painel de Vendas.
- **Gestão** (`OPERADORES_CRUD`): abre "Não reconhecidos" para associar um
  código a um colaborador ou criar cadastro.
- Edição da meta de vendas fica em Centro de Controle ▸ Metas
  (`PAINEL_VENDAS_EDITAR`).
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `IndicadoresScreen.tsx` | Hub: seletor de mês, vendas, destaques, semáforos e painel de atenção | 640 |
| `IndicadorDetalheScreen.tsx` | Detalhe de um indicador (meta, projeção, evolução mensal, tendência, ranking, cancelamentos) | 1044 |
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
3. **Vendas:** `PainelVendasScreen` mostra a venda do dia em destaque (com a
   estimativa do dia), a meta do mês e projeção, comparativos por data, horas
   que mais venderam, curva horária, heatmap dia×hora e o detalhe por hora.
4. **Não reconhecidos:** lista os códigos do mês sem cadastro; o gestor associa
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

Módulos do backend relacionados: [`arrecadacao`](../03-atlas-backend/arrecadacao.md)
e [`vendas`](../03-atlas-backend/vendas.md); associação de códigos usa
[`colaboradores`](../03-atlas-backend/colaboradores.md).

## 6. Estado local e regras de UI
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
- "Não reconhecidos" agrega por mês; a busca de colaborador limita a 8
  resultados e a associação pede confirmação (afeta o histórico).

## 7. Lógica pura / utilidades
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

## 10. Riscos, dívidas e pendências
- 🔧 `IndicadorDetalheScreen.tsx` (>800 linhas) reúne muitos sub-gráficos num só
  arquivo; candidato a extrair cada cartão.
- ⚠️ Os totais dos indicadores já incluem os **não reconhecidos** (gente de
  fora conta); a associação corrige o histórico retroativamente.
- ⚠️ Vários cálculos de janela (dia/semana/mês) ficam no cliente e usam UTC;
  divergências de fuso devem ser conferidas com o backend.
- ⚠️ O limite da navegação de meses é um espelho do padrão do backend (24). Se a
  retenção do servidor for alterada por variável de ambiente, o app só saberá
  disso pelo campo `mesesRetencao` do histórico — a seta continuará limitada a
  24 meses até o espelho ser ajustado.
