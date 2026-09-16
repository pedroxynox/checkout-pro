/**
 * Detalhe do indicador **Cancelamentos Totais** — aberto ao tocar na card do
 * painel de Indicadores (ADR 0025).
 *
 * ## A pergunta que esta tela responde
 *
 * A card diz *quanto* a loja cancelou, somando itens e cupom sobre as vendas.
 * Isso é um boletim. Esta tela responde as duas perguntas que mudam o dia
 * seguinte: **o que está empurrando o número** e **o que fazer para melhorar**.
 *
 * ## A ordem dos blocos, e por quê
 *
 * 1. **O mês** — o valor, o teto e, sobretudo, o excedente em R$. Um percentual
 *    não se discute numa reunião; "R$ 4.200 acima do teto" sim.
 * 2. **De onde vem** — a composição itens × cupom. É a primeira pergunta do
 *    gestor e a mais barata de responder: já diz para que lado ir.
 * 3. **O que está impactando** — as causas que o backend deduziu dos números.
 * 4. **O que fazer** — as ações, deduzidas das causas (nunca frases fixas).
 * 5. **Se resolver os maiores** — a simulação. Transforma o indicador num plano:
 *    em vez de "está acima da meta", diz "resolvendo estes três, fecha dentro".
 * 6. **Quem mais pesa** — o ranking combinado das duas metades.
 * 7. **Motivos** e **quem autorizou** — só do cupom, e a tela diz isso: o
 *    arquivo de itens não tem essas colunas.
 * 8. **Forma do dano** — muitos lançamentos pequenos (rotina) ou poucos grandes
 *    (exceção). Dois meses com o mesmo total pedem ações opostas.
 * 9. **Evolução mês a mês** — o histórico, com a cor de cada mês.
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
import { formatarMoeda, formatarNumero, formatarPercentual } from '../../utils/formato';
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

/** "+0,35 p.p." / "−0,15 p.p." — o desvio com sinal explícito. */
function ppTexto(valor: number): string {
  const sinal = valor >= 0 ? '+' : '−';
  return `${sinal}${Math.abs(valor).toFixed(2).replace('.', ',')} p.p.`;
}

/** Forma do dano em linguagem de loja. */
function rotuloPerfil(
  perfil: DetalheCancelamentosTotais['perfil']['perfil'],
): string {
  if (perfil === 'POUCOS_GRANDES') return 'Poucos lançamentos grandes';
  if (perfil === 'MUITOS_PEQUENOS') return 'Muitos lançamentos pequenos';
  return 'Misto';
}

/** O que a forma do dano implica na prática. */
function explicacaoPerfil(
  perfil: DetalheCancelamentosTotais['perfil']['perfil'],
): string {
  if (perfil === 'POUCOS_GRANDES') {
    return 'O valor está em poucas ocorrências: dá para revisar caso a caso.';
  }
  if (perfil === 'MUITOS_PEQUENOS') {
    return 'O valor vem do volume do dia a dia: o ganho está na rotina da frente de caixa, não em casos isolados.';
  }
  return 'O valor está repartido entre lançamentos grandes e pequenos.';
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

/** Uma fatia (motivo ou autorizador) com barra proporcional. */
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
        {formatarNumero(fatia.lancamentos)} lançamento
        {fatia.lancamentos === 1 ? '' : 's'}
      </Text>
    </View>
  );
}

/** Uma pessoa do ranking combinado, com a quebra entre as duas metades. */
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
 * Um mês sem dados aparece cinza e fica **fora** da lista de leitura: um mês
 * vazio não é uma queda. E a seta respeita o sentido do indicador — cair aqui é
 * melhorar, então a flecha para baixo é verde.
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
                  itens + cupom · teto {formatarPercentual(d.indicador.meta)} das
                  vendas
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
                {d.indicador.desvio && (
                  <Text style={styles.valorDesvio}>
                    {ppTexto(d.indicador.desvio.absoluto)} do teto
                  </Text>
                )}
              </View>
            )}

            <Text style={styles.resumo}>{d.diagnostico.resumo}</Text>

            {/*
              O teto em dinheiro. É a tradução que torna o indicador discutível:
              o percentual diz que há um problema, o excedente diz o tamanho dele.
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
                <Text style={styles.nota}>
                  Vendas do mês: {formatarMoeda(d.indicador.vendas)} ·{' '}
                  {formatarNumero(d.indicador.lancamentos)} lançamentos
                  {d.indicador.itens > 0
                    ? ` · ${formatarNumero(d.indicador.itens)} itens cancelados`
                    : ''}
                </Text>
                {/* O teto do total é independente, e isso tem de estar escrito:
                    sem o aviso, as duas metades verdes com o total amarelo
                    parecem um erro do sistema. */}
                <Text style={styles.nota}>
                  Este teto é próprio do total — não é a soma dos tetos de
                  Cancelamento de Itens e de Cupom. É editável por mês em Centro
                  de Controle ▸ Metas.
                </Text>
              </>
            )}
          </Cartao>

          {/* ===== 2. De onde vem ===== */}
          <Cartao titulo="De onde vem">
            <View style={styles.pilhaTrilha}>
              <View
                style={[
                  styles.pilhaItens,
                  {
                    flex: Math.max(1, d.composicao.participacaoItens),
                  },
                ]}
              />
              <View
                style={[
                  styles.pilhaCupom,
                  {
                    flex: Math.max(1, d.composicao.participacaoCupom),
                  },
                ]}
              />
            </View>
            <View style={styles.legendaLinha}>
              <View style={styles.legendaItem}>
                <View style={[styles.legendaPonto, { backgroundColor: cores.primaria }]} />
                <Text style={styles.legendaTexto}>
                  Itens {formatarPercentual(d.composicao.participacaoItens, 0)}
                </Text>
              </View>
              <View style={styles.legendaItem}>
                <View style={[styles.legendaPonto, { backgroundColor: cores.laranja }]} />
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
              Os percentuais são sobre as vendas da loja, na mesma régua do teto —
              somados, dão o valor do indicador.
            </Text>
          </Cartao>

          {/* ===== 3. O que está impactando ===== */}
          {d.diagnostico.causas.length > 0 && (
            <Cartao titulo="O que está impactando">
              {d.diagnostico.causas.map((c, i) => (
                <View key={`${c.titulo}-${i}`} style={styles.causa}>
                  <Text style={styles.causaTitulo}>{c.titulo}</Text>
                  <Text style={styles.causaDetalhe}>{c.detalhe}</Text>
                </View>
              ))}
            </Cartao>
          )}

          {/* ===== 4. O que fazer ===== */}
          {d.diagnostico.acoes.length > 0 && (
            <Cartao titulo="O que fazer para melhorar">
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
                Estas recomendações são deduzidas dos números do mês: mudam
                quando a composição, a concentração ou os motivos mudam.
              </Text>
            </Cartao>
          )}

          {/* ===== 5. Se resolver os maiores ===== */}
          {d.simulacao && d.indicador.cumpriuMeta === false && (
            <Cartao titulo="Se resolver os maiores">
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
                  seria o mês sem os {d.simulacao.quantos} maiores
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
                  ? `Só com eles resolvidos, o mês fecharia dentro do teto de ${formatarPercentual(d.indicador.meta)}.`
                  : 'Mesmo sem eles o mês ficaria acima do teto: o problema não está só nos maiores.'}
              </Text>
            </Cartao>
          )}

          {/* ===== 6. Quem mais pesa ===== */}
          <Cartao titulo="Quem mais pesa">
            {d.ofensores.length === 0 ? (
              <Text style={styles.nota}>
                Nenhum lançamento casou com um colaborador cadastrado neste mês.
              </Text>
            ) : (
              <>
                {d.ofensores.map((o, i) => (
                  <OfensorLinha key={o.nome} posicao={i + 1} ofensor={o} />
                ))}
                <View style={styles.divisor} />
                <Text style={styles.nota}>
                  {d.concentracao.espalhado
                    ? `Valor espalhado: são ${formatarNumero(d.concentracao.pessoas)} pessoas, e precisam de ${formatarNumero(d.concentracao.pessoasParaMetade)} delas para somar metade do valor.`
                    : `Valor concentrado: os 3 maiores respondem por ${formatarPercentual(d.concentracao.participacaoTop3, 0)} do total das pessoas cadastradas.`}
                </Text>
                <Text style={styles.nota}>
                  Só entram colaboradores cadastrados. Lançamentos sem cadastro
                  somam no total do indicador, mas não aparecem aqui — é a mesma
                  regra dos outros indicadores.
                </Text>
              </>
            )}
          </Cartao>

          {/* ===== 7. Motivos (só cupom) ===== */}
          <Cartao titulo="Motivos do cancelamento de cupom">
            {d.motivos.length === 0 ? (
              <Text style={styles.nota}>
                Nenhum cancelamento de cupom neste mês.
              </Text>
            ) : (
              <>
                {d.motivos.map((m) => (
                  <FatiaLinha key={m.rotulo} fatia={m} cor={cores.laranja} />
                ))}
                {/* Sem este aviso, o gestor leria os motivos como se cobrissem
                    o indicador inteiro — e tomaria a decisão errada. */}
                <Text style={styles.nota}>
                  Cobre apenas a metade do cupom: o arquivo de cancelamento de
                  itens não traz motivo.
                </Text>
              </>
            )}
          </Cartao>

          {/* ===== 8. Quem autorizou (só cupom) ===== */}
          {d.autorizadores.length > 0 && (
            <Cartao titulo="Quem autorizou os cupons">
              {d.autorizadores.map((a) => (
                <FatiaLinha key={a.rotulo} fatia={a} cor={cores.primaria} />
              ))}
              <Text style={styles.nota}>
                Concentração de autorizações pode ser turno, volume ou critério —
                vale conferir antes de concluir.
              </Text>
            </Cartao>
          )}

          {/* ===== 9. Forma do dano ===== */}
          {d.perfil.lancamentos > 0 && (
            <Cartao titulo="Forma do dano">
              <Linha
                rotulo="Perfil"
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
              <Text style={styles.nota}>
                {explicacaoPerfil(d.perfil.perfil)}
              </Text>
            </Cartao>
          )}

          {/* ===== 10. Evolução mês a mês ===== */}
          <CardEvolucao meses={d.historico} />

          {d.sequenciaCumprindo > 1 && (
            <Text style={styles.sequencia}>
              🔥 {d.sequenciaCumprindo} meses seguidos dentro do teto.
            </Text>
          )}

          <Text style={styles.rodape}>
            Indicador calculado a partir dos arquivos de cancelamento de itens e
            de cupom — não existe arquivo próprio para carregar. Histórico
            disponível dos últimos {formatarNumero(d.mesesRetencao)} meses (desde{' '}
            {d.anoMesLimite}).
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
    marginTop: espacamento.md,
  },
  valorGrande: {
    fontSize: 40,
    fontWeight: '800',
  },
  valorDesvio: {
    ...tipografia.legenda,
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
  nota: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
    lineHeight: 16,
  },
  // Barra empilhada da composição: a leitura de "qual metade manda" em 1 segundo.
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
    paddingVertical: espacamento.sm,
  },
  simulacaoNumero: { fontSize: 34, fontWeight: '800' },
  simulacaoLabel: { ...tipografia.rotulo, color: cores.texto },
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
