/**
 * Detalhe do indicador **Cancelamentos Totais** — aberto ao tocar na card do
 * painel de Indicadores (ADR 0025).
 *
 * ## A pergunta que esta tela responde
 *
 * A card diz *quanto* a loja cancelou, somando itens e cupom sobre as vendas.
 * Isso é um boletim. Esta tela responde as duas perguntas que mudam o dia
 * seguinte: **o que está pesando no resultado** e **o que fazer para melhorar**.
 *
 * ## A ordem dos blocos, e por quê
 *
 * 1. **O mês** — o valor, o teto e, sobretudo, o excedente em R$. Um percentual
 *    não se discute numa reunião; "R$ 4.200 acima do teto" sim.
 * 2. **Composição do total** — itens × cupom. É a primeira pergunta do gestor e a
 *    mais barata de responder: já indica para que lado ir.
 * 3. **Diagnóstico do mês** — as causas que o backend identificou e as ações
 *    correspondentes, no mesmo cartão. Causa e recomendação lidas juntas formam
 *    uma orientação; separadas em dois cartões, viram duas listas.
 * 4. **Cenário sem os maiores lançamentos** — a simulação. Transforma o indicador
 *    num plano: em vez de "está acima do teto", diz "tratando estes três, fecha
 *    dentro".
 * 5. **Quem concentra o valor** — o ranking combinado das duas partes.
 * 6. **Cancelamento de cupom** — motivos e autorizações. Ficam num cartão só
 *    porque compartilham a mesma limitação, que precisa ser dita uma única vez:
 *    o arquivo de itens não informa nem motivo nem autorizador.
 * 7. **Perfil dos lançamentos** — muitos de valor baixo (rotina) ou poucos de
 *    valor alto (exceção). Dois meses com o mesmo total pedem ações opostas.
 * 8. **Evolução mês a mês** — o histórico, com a cor de cada mês.
 *
 * Tela própria (e não o `IndicadorDetalheScreen`) porque aquele é acoplado ao
 * catálogo `ARRECADACAO` e ramifica em `base === 'FIXA' | 'VENDAS'`, e este
 * indicador está deliberadamente fora daquele catálogo — ele não tem arquivo.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { arrecadacaoService } from '../../api/services';
import {
  DetalheCancelamentosTotais,
  FatiaCancelamentos,
  NivelIndicador,
  OfensorCancelamentos,
  PontoMesCancelamentos,
} from '../../api/types';
import {
  Cartao,
  Carregando,
  EstadoVazio,
  MensagemErro,
  Selo,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, raio, tipografia } from '../../theme';
import {
  formatarMoeda,
  formatarNumero,
  formatarPercentual,
} from '../../utils/formato';
import {
  MESES_HISTORICO_INDICADORES,
  deslocarMes,
  mesAtual,
  mesesAtras,
  rotuloMes,
} from '../../utils/periodoMensal';

/** Cor do semáforo. Sem nível não há cor — não afirmar é melhor que errar. */
function corNivel(nivel: NivelIndicador | null): string {
  if (nivel === 'OK') return cores.verde;
  if (nivel === 'ATENCAO') return cores.amarelo;
  if (nivel === 'FORA') return cores.vermelho;
  return cores.textoSecundario;
}

function fundoNivel(nivel: NivelIndicador | null): string {
  if (nivel === 'OK') return cores.verdeFundo;
  if (nivel === 'ATENCAO') return cores.amareloFundo;
  if (nivel === 'FORA') return cores.vermelhoFundo;
  return cores.superficieAlternativa;
}

/** Rótulo do selo do mês, na linguagem de um teto (e não de uma meta a bater). */
function rotuloNivel(nivel: NivelIndicador | null): string {
  if (nivel === 'OK') return 'Dentro do teto';
  if (nivel === 'ATENCAO') return 'Atenção';
  if (nivel === 'FORA') return 'Acima do teto';
  return 'Sem dados';
}

/** Perfil dos lançamentos em linguagem de loja. */
function rotuloPerfil(
  perfil: DetalheCancelamentosTotais['perfil']['perfil'],
): string {
  if (perfil === 'POUCOS_GRANDES') return 'Poucos lançamentos de valor alto';
  if (perfil === 'MUITOS_PEQUENOS') return 'Muitos lançamentos de valor baixo';
  return 'Perfil misto';
}

/** O que o perfil dos lançamentos implica na prática. */
function explicacaoPerfil(
  perfil: DetalheCancelamentosTotais['perfil']['perfil'],
): string {
  if (perfil === 'POUCOS_GRANDES') {
    return 'O valor está concentrado em poucas ocorrências, o que permite revisá-las caso a caso.';
  }
  if (perfil === 'MUITOS_PEQUENOS') {
    return 'O valor decorre do volume diário: o ganho está na rotina da frente de caixa, e não em casos isolados.';
  }
  return 'O valor está distribuído entre lançamentos de valor alto e baixo.';
}

/** Uma linha rótulo → valor, o formato de leitura desta tela. */
function Linha({
  rotulo,
  valor,
  cor,
  destaque,
}: {
  rotulo: string;
  valor: string;
  cor?: string;
  destaque?: boolean;
}): React.ReactElement {
  return (
    <View style={styles.linha}>
      <Text style={styles.linhaRotulo}>{rotulo}</Text>
      <Text
        style={[
          destaque ? styles.linhaValorDestaque : styles.linhaValor,
          cor ? { color: cor } : null,
        ]}
      >
        {valor}
      </Text>
    </View>
  );
}

/** Título de uma subseção dentro de um cartão. */
function Subsecao({ texto }: { texto: string }): React.ReactElement {
  return <Text style={styles.subsecao}>{texto}</Text>;
}

/** Uma fatia (motivo ou autorização) com barra proporcional. */
function FatiaLinha({
  fatia,
  cor,
}: {
  fatia: FatiaCancelamentos;
  cor: string;
}): React.ReactElement {
  return (
    <View style={styles.fatia}>
      <View style={styles.fatiaTopo}>
        <Text style={styles.fatiaRotulo} numberOfLines={2}>
          {fatia.rotulo}
        </Text>
        <Text style={styles.fatiaValor}>{formatarMoeda(fatia.total)}</Text>
      </View>
      <View style={styles.fatiaTrilha}>
        <View
          style={[
            styles.fatiaBarra,
            {
              width: `${Math.min(100, Math.max(2, fatia.participacao))}%`,
              backgroundColor: cor,
            },
          ]}
        />
      </View>
      <Text style={styles.fatiaMeta}>
        {formatarPercentual(fatia.participacao, 0)} do valor em cupom ·{' '}
        {formatarNumero(fatia.lancamentos)}{' '}
        {fatia.lancamentos === 1 ? 'lançamento' : 'lançamentos'}
      </Text>
    </View>
  );
}

/** Uma pessoa do ranking combinado, com a divisão entre as duas partes. */
function OfensorLinha({
  posicao,
  ofensor,
}: {
  posicao: number;
  ofensor: OfensorCancelamentos;
}): React.ReactElement {
  return (
    <View style={styles.ofensor}>
      <Text style={styles.ofensorPos}>{posicao}º</Text>
      <View style={styles.flex1}>
        <Text style={styles.ofensorNome} numberOfLines={1}>
          {ofensor.nome}
        </Text>
        <Text style={styles.ofensorQuebra}>
          itens {formatarMoeda(ofensor.totalItens)} · cupom{' '}
          {formatarMoeda(ofensor.totalCupom)}
          {ofensor.percentualVendas != null
            ? ` · ${formatarPercentual(ofensor.percentualVendas)} das vendas`
            : ''}
        </Text>
      </View>
      <Text style={styles.ofensorTotal}>{formatarMoeda(ofensor.total)}</Text>
    </View>
  );
}

/**
 * Evolução mês a mês, com as barras coloridas pelo semáforo de cada mês.
 *
 * Um mês sem dados aparece em cinza e fica **fora** da lista de leitura: um mês
 * vazio não é uma queda. A seta respeita o sentido do indicador — cair aqui é
 * melhorar, então a seta para baixo é verde.
 */
function CardEvolucao({
  meses,
}: {
  meses: PontoMesCancelamentos[];
}): React.ReactElement {
  const comMovimento = meses.filter((m) => !m.semDados);
  const maximo = Math.max(...meses.map((m) => m.percentual ?? 0), 0.01);
  const ultimos = meses.slice(-12);
  return (
    <Cartao titulo="Evolução mês a mês">
      {comMovimento.length === 0 ? (
        <Text style={styles.nota}>
          Ainda não há meses com movimento neste indicador.
        </Text>
      ) : (
        <>
          <View style={styles.barrasArea}>
            {ultimos.map((m) => {
              const altura = m.semDados
                ? 2
                : Math.max(3, ((m.percentual ?? 0) / maximo) * 96);
              return (
                <View key={m.anoMes} style={styles.barraColuna}>
                  <View
                    style={[
                      styles.barra,
                      {
                        height: altura,
                        backgroundColor: m.semDados
                          ? cores.divisor
                          : corNivel(m.nivel),
                        opacity: m.parcial ? 0.55 : 1,
                      },
                    ]}
                  />
                  <Text style={styles.barraRotulo}>{m.rotulo}</Text>
                </View>
              );
            })}
          </View>
          {[...comMovimento].reverse().map((m) => (
            <View key={m.anoMes} style={styles.mesLinha}>
              <View style={styles.flex1}>
                <Text style={styles.mesRotulo}>
                  {m.rotulo}
                  {m.parcial ? ' (em andamento)' : ''}
                </Text>
                <Text style={styles.mesMeta}>
                  teto {formatarPercentual(m.meta)}
                </Text>
              </View>
              <View style={styles.mesDireita}>
                <Text style={[styles.mesValor, { color: corNivel(m.nivel) }]}>
                  {m.percentual == null
                    ? 'sem venda'
                    : formatarPercentual(m.percentual)}
                </Text>
                {m.variacao != null && m.evolucao && (
                  <Text
                    style={[
                      styles.mesVariacao,
                      {
                        color:
                          m.evolucao === 'MELHOROU'
                            ? cores.verde
                            : m.evolucao === 'PIOROU'
                              ? cores.vermelho
                              : cores.textoSecundario,
                      },
                    ]}
                  >
                    {m.variacao > 0 ? '↑' : m.variacao < 0 ? '↓' : '→'}{' '}
                    {formatarPercentual(Math.abs(m.variacao), 1)}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </>
      )}
    </Cartao>
  );
}

export function CancelamentosTotaisDetalheScreen(): React.ReactElement {
  const [anoMes, setAnoMes] = useState(mesAtual());
  const ehMesCorrente = anoMes === mesAtual();

  const req = useRequisicao<DetalheCancelamentosTotais>(
    () => arrecadacaoService.cancelamentosTotaisDetalhe(anoMes),
    [anoMes],
  );

  const podeVoltar =
    mesesAtras(anoMes, mesAtual()) < MESES_HISTORICO_INDICADORES - 1;
  const trocarMes = (delta: number): void => {
    setAnoMes((atual) => {
      const alvo = deslocarMes(atual, delta);
      if (mesesAtras(alvo, mesAtual()) < 0) return atual;
      if (mesesAtras(alvo, mesAtual()) > MESES_HISTORICO_INDICADORES - 1) {
        return atual;
      }
      return alvo;
    });
  };

  const d = req.dados;

  return (
    <Tela aoAtualizar={req.recarregar} atualizando={req.atualizando}>
      {/* Seletor de mês, igual ao painel de Indicadores. */}
      <View style={styles.seletor}>
        <Text
          onPress={() => podeVoltar && trocarMes(-1)}
          style={[styles.seta, !podeVoltar && styles.setaInativa]}
          accessibilityLabel="Mês anterior"
        >
          ‹
        </Text>
        <View style={styles.seletorCentro}>
          <Text style={styles.seletorTexto}>{rotuloMes(anoMes)}</Text>
          <Text style={styles.seletorSub}>
            {ehMesCorrente ? 'Mês em andamento' : 'Mês fechado'}
          </Text>
        </View>
        <Text
          onPress={() => !ehMesCorrente && trocarMes(1)}
          style={[styles.seta, ehMesCorrente && styles.setaInativa]}
          accessibilityLabel="Próximo mês"
        >
          ›
        </Text>
      </View>

      {req.carregando ? (
        <Carregando />
      ) : req.erro ? (
        <MensagemErro mensagem={req.erro} aoTentarNovamente={req.recarregar} />
      ) : !d ? (
        <EstadoVazio
          icone="close-circle-outline"
          titulo="Sem dados"
          descricao="Não há informação de cancelamentos para este mês."
        />
      ) : (
        <>
          {/* ===== 1. O mês ===== */}
          <Cartao>
            <View style={styles.topo}>
              <View style={styles.iconeBox}>
                <Ionicons name="close-circle" size={22} color={cores.primaria} />
              </View>
              <View style={styles.flex1}>
                <Text style={styles.titulo}>Cancelamentos Totais</Text>
                <Text style={styles.subtitulo}>
                  itens e cupom somados, sobre as vendas
                </Text>
              </View>
              <Selo
                texto={rotuloNivel(d.indicador.nivel)}
                cor={corNivel(d.indicador.nivel)}
                fundo={fundoNivel(d.indicador.nivel)}
              />
            </View>

            {d.indicador.percentual != null && (
              <View style={styles.valorBloco}>
                <Text
                  style={[
                    styles.valorGrande,
                    { color: corNivel(d.indicador.nivel) },
                  ]}
                >
                  {formatarPercentual(d.indicador.percentual)}
                </Text>
                <Text style={styles.valorReferencia}>
                  meta ≤ {formatarPercentual(d.indicador.meta)}
                </Text>
              </View>
            )}

            <Text style={styles.resumo}>{d.diagnostico.resumo}</Text>

            {/*
              O teto em dinheiro. É a tradução que torna o indicador discutível:
              o percentual indica que há um problema, o excedente indica o
              tamanho dele.
            */}
            {d.indicador.limiteReais != null && (
              <>
                <View style={styles.divisor} />
                <Linha
                  rotulo="Cancelado no mês"
                  valor={formatarMoeda(d.indicador.total)}
                  destaque
                />
                <Linha
                  rotulo={`Teto do mês (${formatarPercentual(d.indicador.meta)} das vendas)`}
                  valor={formatarMoeda(d.indicador.limiteReais)}
                />
                {d.indicador.excedente != null && d.indicador.excedente > 0 ? (
                  <Linha
                    rotulo="Acima do teto"
                    valor={formatarMoeda(d.indicador.excedente)}
                    cor={cores.vermelho}
                    destaque
                  />
                ) : (
                  <Linha
                    rotulo="Folga até o teto"
                    valor={formatarMoeda(
                      Math.max(0, d.indicador.limiteReais - d.indicador.total),
                    )}
                    cor={cores.verde}
                  />
                )}
                <View style={styles.divisor} />
                <Linha
                  rotulo="Vendas do mês"
                  valor={formatarMoeda(d.indicador.vendas)}
                />
                <Linha
                  rotulo="Lançamentos"
                  valor={formatarNumero(d.indicador.lancamentos)}
                />
                {d.indicador.itens > 0 && (
                  <Linha
                    rotulo="Itens cancelados"
                    valor={formatarNumero(d.indicador.itens)}
                  />
                )}
                {/*
                  O teto do total é independente, e isso precisa estar escrito:
                  sem o aviso, as duas partes verdes com o total amarelo parecem
                  um erro do sistema.
                */}
                <Text style={styles.nota}>
                  Este teto é próprio do total e não corresponde à soma dos tetos
                  de Cancelamento de Itens e de Cupom. É editável por mês em
                  Centro de Controle ▸ Metas.
                </Text>
              </>
            )}
          </Cartao>

          {/* ===== 2. Composição do total ===== */}
          <Cartao titulo="Composição do total">
            <View style={styles.pilhaTrilha}>
              <View
                style={[
                  styles.pilhaItens,
                  { flex: Math.max(1, d.composicao.participacaoItens) },
                ]}
              />
              <View
                style={[
                  styles.pilhaCupom,
                  { flex: Math.max(1, d.composicao.participacaoCupom) },
                ]}
              />
            </View>
            <View style={styles.legendaLinha}>
              <View style={styles.legendaItem}>
                <View
                  style={[styles.legendaPonto, { backgroundColor: cores.primaria }]}
                />
                <Text style={styles.legendaTexto}>
                  Itens {formatarPercentual(d.composicao.participacaoItens, 0)}
                </Text>
              </View>
              <View style={styles.legendaItem}>
                <View
                  style={[styles.legendaPonto, { backgroundColor: cores.laranja }]}
                />
                <Text style={styles.legendaTexto}>
                  Cupom {formatarPercentual(d.composicao.participacaoCupom, 0)}
                </Text>
              </View>
            </View>
            <View style={styles.divisor} />
            <Linha
              rotulo="Cancelamento de itens"
              valor={
                d.composicao.percentualItens != null
                  ? `${formatarMoeda(d.composicao.totalItens)} · ${formatarPercentual(d.composicao.percentualItens)}`
                  : formatarMoeda(d.composicao.totalItens)
              }
            />
            <Linha
              rotulo="Cancelamento de cupom"
              valor={
                d.composicao.percentualCupom != null
                  ? `${formatarMoeda(d.composicao.totalCupom)} · ${formatarPercentual(d.composicao.percentualCupom)}`
                  : formatarMoeda(d.composicao.totalCupom)
              }
            />
            <Text style={styles.nota}>
              Os percentuais são calculados sobre as vendas da loja, no mesmo
              critério do teto: somados, resultam no valor do indicador.
            </Text>
          </Cartao>

          {/* ===== 3. Diagnóstico do mês ===== */}
          {(d.diagnostico.causas.length > 0 ||
            d.diagnostico.acoes.length > 0) && (
            <Cartao titulo="Diagnóstico do mês">
              {d.diagnostico.causas.length > 0 && (
                <>
                  <Subsecao texto="O que está pesando no resultado" />
                  {d.diagnostico.causas.map((c, i) => (
                    <View key={`${c.titulo}-${i}`} style={styles.causa}>
                      <Text style={styles.causaTitulo}>{c.titulo}</Text>
                      <Text style={styles.causaDetalhe}>{c.detalhe}</Text>
                    </View>
                  ))}
                </>
              )}

              {d.diagnostico.acoes.length > 0 && (
                <>
                  {d.diagnostico.causas.length > 0 && (
                    <View style={styles.divisor} />
                  )}
                  <Subsecao texto="O que fazer para melhorar" />
                  {d.diagnostico.acoes.map((a, i) => (
                    <View key={`acao-${i}`} style={styles.acao}>
                      <Ionicons
                        name="arrow-forward-circle"
                        size={16}
                        color={cores.primaria}
                        style={styles.acaoIcone}
                      />
                      <Text style={styles.acaoTexto}>{a}</Text>
                    </View>
                  ))}
                  <Text style={styles.nota}>
                    As recomendações são derivadas dos números do mês: mudam
                    quando a composição, a concentração ou os motivos mudam.
                  </Text>
                </>
              )}
            </Cartao>
          )}

          {/* ===== 4. Cenário sem os maiores lançamentos ===== */}
          {d.simulacao && d.indicador.cumpriuMeta === false && (
            <Cartao titulo="Cenário sem os maiores lançamentos">
              <View style={styles.simulacaoBloco}>
                <Text
                  style={[
                    styles.simulacaoNumero,
                    {
                      color: d.simulacao.ficariaDentro
                        ? cores.verde
                        : cores.laranja,
                    },
                  ]}
                >
                  {formatarPercentual(d.simulacao.percentualSimulado)}
                </Text>
                <Text style={styles.simulacaoLabel}>
                  seria o resultado do mês sem {d.simulacao.quantos === 1
                    ? 'o maior lançamento'
                    : `os ${d.simulacao.quantos} maiores`}
                </Text>
                <Text style={styles.simulacaoSub}>
                  {d.simulacao.nomes.join(', ')}
                </Text>
              </View>
              <Linha
                rotulo="Valor que sairia do total"
                valor={formatarMoeda(d.simulacao.valorRemovido)}
              />
              <Text
                style={[
                  styles.simulacaoVeredito,
                  {
                    color: d.simulacao.ficariaDentro
                      ? cores.verde
                      : cores.laranja,
                  },
                ]}
              >
                {d.simulacao.ficariaDentro
                  ? `Tratando apenas esses lançamentos, o mês fecharia dentro do teto de ${formatarPercentual(d.indicador.meta)}.`
                  : 'Mesmo sem eles, o mês permaneceria acima do teto: o problema não se concentra apenas nos maiores.'}
              </Text>
            </Cartao>
          )}

          {/* ===== 5. Quem concentra o valor ===== */}
          <Cartao titulo="Quem concentra o valor">
            {d.ofensores.length === 0 ? (
              <Text style={styles.nota}>
                Nenhum lançamento corresponde a um colaborador cadastrado neste
                mês.
              </Text>
            ) : (
              <>
                {d.ofensores.map((o, i) => (
                  <OfensorLinha key={o.nome} posicao={i + 1} ofensor={o} />
                ))}
                <View style={styles.divisor} />
                <Text style={styles.leitura}>
                  {d.concentracao.espalhado
                    ? `Valor distribuído: são ${formatarNumero(d.concentracao.pessoas)} pessoas com cancelamento, e é necessário somar ${formatarNumero(d.concentracao.pessoasParaMetade)} delas para chegar à metade do valor.`
                    : `Valor concentrado: os três maiores respondem por ${formatarPercentual(d.concentracao.participacaoTop3, 0)} do total das pessoas cadastradas.`}
                </Text>
                <Text style={styles.nota}>
                  Apenas colaboradores cadastrados aparecem aqui. Lançamentos sem
                  cadastro são somados no total do indicador, mas não entram nesta
                  lista — é a mesma regra dos demais indicadores.
                </Text>
              </>
            )}
          </Cartao>

          {/* ===== 6. Cancelamento de cupom: motivos e autorizações ===== */}
          <Cartao titulo="Cupom: motivos e autorizações">
            {d.motivos.length === 0 && d.autorizadores.length === 0 ? (
              <Text style={styles.nota}>
                Nenhum cancelamento de cupom neste mês.
              </Text>
            ) : (
              <>
                {d.motivos.length > 0 && (
                  <>
                    <Subsecao texto="Motivos de maior custo" />
                    {d.motivos.map((m) => (
                      <FatiaLinha key={m.rotulo} fatia={m} cor={cores.laranja} />
                    ))}
                  </>
                )}

                {d.autorizadores.length > 0 && (
                  <>
                    {d.motivos.length > 0 && <View style={styles.divisor} />}
                    <Subsecao texto="Quem autorizou" />
                    {d.autorizadores.map((a) => (
                      <FatiaLinha key={a.rotulo} fatia={a} cor={cores.primaria} />
                    ))}
                    <Text style={styles.nota}>
                      A concentração de autorizações pode refletir turno, volume
                      ou critério de aprovação — convém verificar antes de
                      concluir.
                    </Text>
                  </>
                )}

                {/*
                  Sem este aviso, o gestor leria motivos e autorizações como se
                  explicassem o indicador inteiro — e decidiria com base em
                  metade do quadro.
                */}
                <Text style={styles.nota}>
                  Estas duas leituras abrangem apenas os cancelamentos de cupom: o
                  arquivo de cancelamento de itens não informa motivo nem
                  autorizador.
                </Text>
              </>
            )}
          </Cartao>

          {/* ===== 7. Perfil dos lançamentos ===== */}
          {d.perfil.lancamentos > 0 && (
            <Cartao titulo="Perfil dos lançamentos">
              <Linha
                rotulo="Classificação"
                valor={rotuloPerfil(d.perfil.perfil)}
                destaque
              />
              <Linha
                rotulo="Lançamentos no mês"
                valor={formatarNumero(d.perfil.lancamentos)}
              />
              <Linha
                rotulo="Valor médio por lançamento"
                valor={formatarMoeda(d.perfil.ticketMedio)}
              />
              <Linha
                rotulo={`Concentração nos ${formatarNumero(d.perfil.maioresConsiderados)} maiores`}
                valor={formatarPercentual(d.perfil.participacaoMaiores, 0)}
              />
              <Text style={styles.leitura}>
                {explicacaoPerfil(d.perfil.perfil)}
              </Text>
            </Cartao>
          )}

          {/* ===== 8. Evolução mês a mês ===== */}
          <CardEvolucao meses={d.historico} />

          {d.sequenciaCumprindo > 1 && (
            <Text style={styles.sequencia}>
              🔥 {d.sequenciaCumprindo} meses seguidos dentro do teto.
            </Text>
          )}

          <Text style={styles.rodape}>
            Indicador calculado a partir dos arquivos de cancelamento de itens e
            de cupom — não existe arquivo próprio para carregar. Histórico
            disponível desde {rotuloMes(d.anoMesLimite)} (
            {formatarNumero(d.mesesRetencao)} meses).
          </Text>
        </>
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  seletor: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: cores.superficie,
    borderRadius: raio.md,
    borderWidth: 1,
    borderColor: cores.divisor,
    paddingVertical: espacamento.xs,
    paddingHorizontal: espacamento.md,
    marginBottom: espacamento.sm,
  },
  seta: {
    fontSize: 28,
    color: cores.primaria,
    paddingHorizontal: espacamento.sm,
  },
  setaInativa: { color: cores.divisor },
  seletorCentro: { alignItems: 'center' },
  seletorTexto: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
  },
  seletorSub: { ...tipografia.legenda, color: cores.textoSecundario },
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.md,
  },
  iconeBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: cores.primariaClara,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titulo: { ...tipografia.subtitulo, color: cores.texto },
  subtitulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  valorBloco: {
    alignItems: 'center',
    marginTop: espacamento.lg,
    marginBottom: espacamento.xs,
  },
  valorGrande: {
    fontSize: 40,
    fontWeight: '800',
  },
  valorReferencia: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  resumo: {
    ...tipografia.corpo,
    color: cores.texto,
    marginTop: espacamento.md,
    lineHeight: 20,
  },
  divisor: {
    height: 1,
    backgroundColor: cores.divisor,
    marginVertical: espacamento.md,
  },
  subsecao: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: espacamento.sm,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espacamento.md,
    paddingVertical: espacamento.xs,
  },
  linhaRotulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    flex: 1,
  },
  linhaValor: { ...tipografia.rotulo, color: cores.texto },
  linhaValorDestaque: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
  },
  // Uma conclusão em prosa (não é rodapé nem ressalva): fica no tom do texto.
  leitura: {
    ...tipografia.legenda,
    color: cores.texto,
    marginTop: espacamento.sm,
    lineHeight: 17,
  },
  nota: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
    lineHeight: 16,
  },
  // Barra empilhada da composição: a leitura de "qual parte manda" em 1 segundo.
  pilhaTrilha: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
    backgroundColor: cores.divisor,
  },
  pilhaItens: { backgroundColor: cores.primaria },
  pilhaCupom: { backgroundColor: cores.laranja },
  legendaLinha: {
    flexDirection: 'row',
    gap: espacamento.lg,
    marginTop: espacamento.sm,
  },
  legendaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
  },
  legendaPonto: { width: 10, height: 10, borderRadius: 5 },
  legendaTexto: { ...tipografia.legenda, color: cores.texto },
  causa: {
    borderLeftWidth: 3,
    borderLeftColor: cores.laranja,
    paddingLeft: espacamento.md,
    paddingVertical: espacamento.xs,
    marginBottom: espacamento.sm,
  },
  causaTitulo: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
  },
  causaDetalhe: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
    lineHeight: 16,
  },
  acao: {
    flexDirection: 'row',
    gap: espacamento.sm,
    paddingVertical: espacamento.xs,
  },
  acaoIcone: { marginTop: 2 },
  acaoTexto: {
    ...tipografia.legenda,
    color: cores.texto,
    flex: 1,
    lineHeight: 18,
  },
  simulacaoBloco: {
    alignItems: 'center',
    paddingBottom: espacamento.md,
  },
  simulacaoNumero: { fontSize: 34, fontWeight: '800' },
  simulacaoLabel: {
    ...tipografia.rotulo,
    color: cores.texto,
    textAlign: 'center',
  },
  simulacaoSub: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
    textAlign: 'center',
  },
  simulacaoVeredito: {
    ...tipografia.legenda,
    marginTop: espacamento.sm,
    fontWeight: '600',
    lineHeight: 16,
  },
  ofensor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    paddingVertical: espacamento.xs,
  },
  ofensorPos: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    width: 24,
    fontWeight: '700',
  },
  ofensorNome: { ...tipografia.rotulo, color: cores.texto },
  ofensorQuebra: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 1,
  },
  ofensorTotal: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
  },
  fatia: { marginBottom: espacamento.md },
  fatiaTopo: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: espacamento.sm,
  },
  fatiaRotulo: { ...tipografia.rotulo, color: cores.texto, flex: 1 },
  fatiaValor: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
  },
  fatiaTrilha: {
    height: 8,
    borderRadius: 4,
    backgroundColor: cores.divisor,
    marginTop: espacamento.xs,
    overflow: 'hidden',
  },
  fatiaBarra: { height: 8, borderRadius: 4 },
  fatiaMeta: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  barrasArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 120,
    gap: 4,
  },
  barraColuna: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barra: { width: '70%', borderRadius: 3 },
  barraRotulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    fontSize: 9,
    marginTop: 4,
  },
  mesLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.md,
    paddingVertical: espacamento.xs,
    borderTopWidth: 1,
    borderTopColor: cores.divisor,
  },
  mesRotulo: { ...tipografia.rotulo, color: cores.texto },
  mesMeta: { ...tipografia.legenda, color: cores.textoSecundario },
  mesDireita: { alignItems: 'flex-end' },
  mesValor: { ...tipografia.rotulo, fontWeight: '700' },
  mesVariacao: { ...tipografia.legenda, fontWeight: '600' },
  sequencia: {
    ...tipografia.rotulo,
    color: cores.verde,
    textAlign: 'center',
    marginBottom: espacamento.sm,
  },
  rodape: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    textAlign: 'center',
    marginTop: espacamento.sm,
    lineHeight: 16,
  },
});

export default CancelamentosTotaisDetalheScreen;
