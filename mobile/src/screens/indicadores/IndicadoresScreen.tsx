/**
 * Tela de Indicadores — Painel de Saúde.
 *
 * Topo: **seletor de mês** (navega até a janela do histórico, padrão 24 meses),
 * vendas do mês, destaques do mês (Top 3: troco, recargas e maior cancelamento
 * de itens) e os semáforos de saúde de cada indicador. Abaixo, o painel
 * "Precisa de atenção" com o que precisa de revisão. Tocar num indicador abre o
 * detalhe (totais, meta, gráficos, evolução mês a mês e ranking).
 *
 * Além dos cinco indicadores de arrecadação, a lista traz duas cards de
 * indicadores **calculados**, ambas com o mesmo desenho das demais e depois
 * delas: `Cancelamentos Totais` (ADR 0025) e `Sacolas` (ADR 0022). Nenhum dos
 * dois tem arquivo de importação — por isso não estão no array `ARRECADACAO`.
 *
 * Os dados NÃO são reiniciados a cada mês: o dia 1º apenas troca o mês de
 * referência. Basta voltar com a seta para rever qualquer mês da janela, sempre
 * com a meta que valia naquele mês.
 */
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  arrecadacaoService,
  insumosService,
  vendasService,
} from '../../api/services';
import {
  DestaquesMes,
  IndicadorCancelamentosTotais,
  IndicadorSacolas,
  PainelAtencao,
  ResumoArrecadacao,
  ResumoVendas,
} from '../../api/types';
import {
  Carregando,
  Cartao,
  MensagemErro,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { PropsTela } from '../../navigation/types';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { formatarMoeda, formatarPercentual, hojeISO } from '../../utils/formato';
import {
  deslocarMes,
  MESES_HISTORICO_INDICADORES,
  mesAtual,
  mesesAtras,
  rotuloMes,
  ultimoDiaDoMesISO,
} from '../../utils/periodoMensal';
import {
  ARRECADACAO,
  CANCELAMENTOS_TOTAIS_DEF,
  DefinicaoArrecadacao,
} from '../../utils/rotulos';

type Nivel = 'OK' | 'ATENCAO' | 'FORA';

interface SaudeIndicador {
  def: DefinicaoArrecadacao;
  resumo: ResumoArrecadacao;
  nivel: Nivel;
  valorTexto: string;
}

/**
 * Avalia o nível do indicador no acumulado do mês.
 *
 * Decide pelo **sentido**, não pela base — espelha `nivelDoMes` do backend, que
 * mudou pela ADR 0022. A base continua dizendo QUAL número se compara
 * (`totalMes` em R$ ou `percentualMes` em %); o sentido diz se maior é melhor.
 * Antes as duas perguntas eram respondidas pelo mesmo campo, o que só funcionava
 * porque os cinco indicadores de arrecadação têm base e sentido correlacionados.
 */
function nivelMes(def: DefinicaoArrecadacao, resumo: ResumoArrecadacao): Nivel {
  const valor = def.base === 'FIXA' ? resumo.totalMes : (resumo.percentualMes ?? 0);
  if (def.sentido === 'MAIOR_MELHOR') {
    if (valor >= resumo.meta) return 'OK';
    if (valor >= resumo.meta * 0.75) return 'ATENCAO';
    return 'FORA';
  }
  if (valor <= resumo.meta) return 'OK';
  if (valor <= resumo.meta * 1.5) return 'ATENCAO';
  return 'FORA';
}

function corNivel(nivel: Nivel): string {
  if (nivel === 'OK') return cores.verde;
  if (nivel === 'ATENCAO') return cores.amarelo;
  return cores.vermelho;
}

function fundoNivel(nivel: Nivel): string {
  if (nivel === 'OK') return cores.verdeFundo;
  if (nivel === 'ATENCAO') return cores.amareloFundo;
  return cores.vermelhoFundo;
}

function iconeNivel(nivel: Nivel): keyof typeof Ionicons.glyphMap {
  if (nivel === 'OK') return 'checkmark-circle';
  if (nivel === 'ATENCAO') return 'warning';
  return 'alert-circle';
}

function valorMesTexto(def: DefinicaoArrecadacao, resumo: ResumoArrecadacao): string {
  if (def.base === 'FIXA') {
    return `${formatarMoeda(resumo.totalMes)} / ${formatarMoeda(resumo.meta)}`;
  }
  // A meta vem do SERVIDOR (`resumo.meta`, a do mês em Centro de Controle ▸
  // Metas). Antes o texto usava `def.meta`, o valor fixo de `rotulos.ts`: o
  // gestor editava a meta e a card continuava mostrando a antiga.
  return `${formatarPercentual(resumo.percentualMes ?? 0)} (meta ≤ ${formatarPercentual(resumo.meta)})`;
}

/**
 * Texto do valor do indicador de Sacolas.
 *
 * Mostra **sempre** a distância até a meta, e não só o número: foi a forma pedida
 * pelo dono do projeto ("a meta como referência, com R$ 28 de piso"). Ver
 * R$ 34,00 é uma informação; ver "+R$ 6,00 acima da meta" é uma conclusão.
 */
function textoSacolas(ind: IndicadorSacolas): string {
  if (ind.valor == null) {
    return ind.estado === 'SEM_ENTRADA'
      ? 'Sem entrada de sacolas neste mês'
      : 'Sem venda registrada neste mês';
  }
  const alvo = `piso ${formatarMoeda(ind.meta)}`;
  if (!ind.desvio) return `${formatarMoeda(ind.valor)} por sacola (${alvo})`;
  const sinal = ind.desvio.absoluto >= 0 ? '+' : '−';
  const distancia = formatarMoeda(Math.abs(ind.desvio.absoluto));
  return `${formatarMoeda(ind.valor)} por sacola · ${sinal}${distancia} (${alvo})`;
}

/**
 * Semáforo do indicador de Sacolas. Sem valor não há cor: pintar de vermelho um
 * mês sem entrega seria acusar a loja de algo que não aconteceu.
 */
function nivelSacolas(ind: IndicadorSacolas): Nivel | null {
  return ind.nivel;
}

/**
 * Texto do valor de **Cancelamentos Totais**.
 *
 * Mesma forma dos outros indicadores sobre vendas ("1,24% (meta ≤ 0,75%)"), para
 * a card ler igual às vizinhas. A meta vem do **servidor** (`ind.meta`), não de um
 * padrão espelhado no app: editar o teto do mês em Metas muda o que se lê aqui.
 *
 * A distância até o teto não é repetida em pontos percentuais — quando há excesso,
 * ele aparece embaixo em **reais**, que é o número acionável. Ver "1,24%" é
 * informação; ver "R$ 350,00 acima do permitido" é conclusão.
 *
 * Sem venda registrada não mostra "0,00%": um mês em que o arquivo de vendas
 * ainda não subiu não é um mês perfeito, é um mês sem denominador.
 */
function textoCancelamentosTotais(ind: IndicadorCancelamentosTotais): string {
  if (ind.percentual == null) {
    return ind.estado === 'SEM_VENDA'
      ? 'Sem venda registrada neste mês'
      : 'Sem movimento neste mês';
  }
  return `${formatarPercentual(ind.percentual)} (meta ≤ ${formatarPercentual(ind.meta)})`;
}

export function IndicadoresScreen({
  navigation,
}: PropsTela<'Indicadores'>): React.ReactElement {
  // Mês de referência. O mês corrente usa "hoje" (parcial, com projeção); um
  // mês fechado usa o seu último dia, o que devolve o mês inteiro.
  const [anoMes, setAnoMes] = useState(mesAtual());
  const ehMesCorrente = anoMes === mesAtual();
  const data = ehMesCorrente ? hojeISO() : ultimoDiaDoMesISO(anoMes);

  // Navegação limitada à janela do histórico: para trás não há mais dados
  // (foram apagados) e para frente não existe futuro.
  const podeVoltar = mesesAtras(anoMes, mesAtual()) < MESES_HISTORICO_INDICADORES - 1;
  const trocarMes = (delta: number): void => {
    setAnoMes((atual) => {
      const alvo = deslocarMes(atual, delta);
      if (mesesAtras(alvo, mesAtual()) < 0) return atual;
      if (mesesAtras(alvo, mesAtual()) > MESES_HISTORICO_INDICADORES - 1) return atual;
      return alvo;
    });
  };

  const req = useRequisicao(async () => {
    const resumos = await Promise.all(
      ARRECADACAO.map((def) => arrecadacaoService.resumo(def.tipo, data)),
    );
    const [vendas, destaques, painel, sacolas, cancelamentosTotais] =
      await Promise.all([
        vendasService.resumo(data).catch(() => null),
        arrecadacaoService.destaquesMes(data).catch(() => null),
        arrecadacaoService.painelAtencao(data).catch(() => null),
        // Indicador de Sacolas: vive no almoxarifado, não na arrecadação (ADR
        // 0022). Degrada em silêncio como os demais — uma falha aqui não pode
        // derrubar o painel inteiro.
        insumosService.indicadorSacolas(anoMes).catch(() => null),
        // Cancelamentos Totais: indicador calculado (ADR 0025), sem arquivo
        // próprio. Também degrada em silêncio: se falhar, a card não aparece e
        // os cinco semáforos continuam de pé.
        arrecadacaoService.cancelamentosTotais(anoMes).catch(() => null),
      ]);
    const saude: SaudeIndicador[] = ARRECADACAO.map((def, i) => ({
      def,
      resumo: resumos[i],
      nivel: nivelMes(def, resumos[i]),
      valorTexto: valorMesTexto(def, resumos[i]),
    }));
    return { saude, vendas, destaques, painel, sacolas, cancelamentosTotais };
  }, [data, anoMes]);

  // Ao VOLTAR a esta tela (ex.: editou uma meta e voltou), recarrega. Pula o
  // primeiro foco: a carga inicial já é feita pelo useRequisicao ao montar.
  const recarregarAoVoltar = useRef<() => void>(() => undefined);
  recarregarAoVoltar.current = req.recarregar;
  const primeiroFoco = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (primeiroFoco.current) {
        primeiroFoco.current = false;
        return;
      }
      recarregarAoVoltar.current();
    }, []),
  );

  const saude = req.dados?.saude ?? [];
  const vendas: ResumoVendas | null = req.dados?.vendas ?? null;
  const destaques: DestaquesMes | null = req.dados?.destaques ?? null;
  const painel: PainelAtencao | null = req.dados?.painel ?? null;
  const sacolas: IndicadorSacolas | null = req.dados?.sacolas ?? null;
  const totais: IndicadorCancelamentosTotais | null =
    req.dados?.cancelamentosTotais ?? null;

  const irParaDetalhe = useCallback(
    (tipo: DefinicaoArrecadacao['tipo']) =>
      navigation.navigate('IndicadorDetalhe', { tipo }),
    [navigation],
  );

  return (
    <Tela aoAtualizar={req.recarregar} atualizando={req.atualizando}>
      {/* Seletor de mês — o histórico fica disponível dentro da janela. */}
      <View style={styles.seletor}>
        <TouchableOpacity
          onPress={() => trocarMes(-1)}
          disabled={!podeVoltar}
          hitSlop={10}
          style={styles.seletorBotao}
          accessibilityLabel="Mês anterior"
        >
          <Ionicons
            name="chevron-back"
            size={22}
            color={podeVoltar ? cores.primaria : cores.divisor}
          />
        </TouchableOpacity>
        <View style={styles.seletorCentro}>
          <Text style={styles.seletorTexto}>{rotuloMes(anoMes)}</Text>
          <Text style={styles.seletorSub}>
            {ehMesCorrente ? 'Mês em andamento' : 'Mês fechado'}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => trocarMes(1)}
          disabled={ehMesCorrente}
          hitSlop={10}
          style={styles.seletorBotao}
          accessibilityLabel="Próximo mês"
        >
          <Ionicons
            name="chevron-forward"
            size={22}
            color={ehMesCorrente ? cores.divisor : cores.primaria}
          />
        </TouchableOpacity>
      </View>

      {req.carregando ? (
        <Carregando />
      ) : req.erro ? (
        <MensagemErro mensagem={req.erro} aoTentarNovamente={req.recarregar} />
      ) : (
        <>
          {/* Vendas do mês */}
          {vendas && (
            <Pressable onPress={() => navigation.navigate('PainelVendas')}>
              <Cartao>
                <View style={styles.vendasLinha}>
                  <View style={styles.vendasIcone}>
                    <Ionicons name="cart" size={22} color={cores.primaria} />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.vendasRotulo}>
                      {ehMesCorrente ? 'Vendas do mês' : `Vendas de ${rotuloMes(anoMes)}`}
                    </Text>
                    <Text style={styles.vendasValor}>
                      {formatarMoeda(vendas.totalMes)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={cores.textoSecundario} />
                </View>
              </Cartao>
            </Pressable>
          )}

          {/* Destaques do mês — Top 3 por categoria */}
          {destaques &&
            (destaques.trocoSolidario ||
              destaques.recargas ||
              destaques.cancelamentoItens ||
              destaques.menosCancelou) && (
              <View style={styles.destaquesCard}>
                <Text style={styles.destaquesTitulo}>🏅 Destaques do mês</Text>

                {destaques.trocoSolidario && (
                  <View style={styles.destaqueLinha}>
                    <Ionicons name="heart" size={18} color={cores.verde} />
                    <View style={styles.flex1}>
                      <Text style={styles.destaqueCategoria}>Troco solidário</Text>
                      <Text style={styles.destaqueNome}>{destaques.trocoSolidario.nome}</Text>
                    </View>
                    <Text style={[styles.destaqueValor, { color: cores.verde }]}>
                      {formatarMoeda(destaques.trocoSolidario.total)}
                    </Text>
                  </View>
                )}

                {destaques.recargas && (
                  <View style={styles.destaqueLinha}>
                    <Ionicons name="phone-portrait" size={18} color={cores.primaria} />
                    <View style={styles.flex1}>
                      <Text style={styles.destaqueCategoria}>Recargas</Text>
                      <Text style={styles.destaqueNome}>{destaques.recargas.nome}</Text>
                    </View>
                    <Text style={[styles.destaqueValor, { color: cores.primaria }]}>
                      {formatarMoeda(destaques.recargas.total)}
                    </Text>
                  </View>
                )}

                {destaques.cancelamentoItens && (
                  <View style={styles.destaqueLinha}>
                    <Ionicons name="alert-circle" size={18} color={cores.vermelho} />
                    <View style={styles.flex1}>
                      <Text style={styles.destaqueCategoria}>Mais cancelou itens</Text>
                      <Text style={styles.destaqueNome}>{destaques.cancelamentoItens.nome}</Text>
                    </View>
                    <Text style={[styles.destaqueValor, { color: cores.vermelho }]}>
                      {formatarMoeda(destaques.cancelamentoItens.total)}
                    </Text>
                  </View>
                )}

                {destaques.menosCancelou && (
                  <View style={styles.destaqueLinha}>
                    <Ionicons name="shield-checkmark" size={18} color={cores.verde} />
                    <View style={styles.flex1}>
                      <Text style={styles.destaqueCategoria}>Menos cancelou itens 🏆</Text>
                      <Text style={styles.destaqueNome}>{destaques.menosCancelou.nome}</Text>
                    </View>
                    <Text style={[styles.destaqueValor, { color: cores.verde }]}>
                      {(destaques.menosCancelou.percentual ?? 0) > 0
                        ? `${destaques.menosCancelou.percentual}% das vendas`
                        : 'Zero'}
                    </Text>
                  </View>
                )}

                <Text style={styles.destaquesNota}>
                  Troco e recargas: maior arrecadação. Cancelamento: maior valor —
                  para acompanhar. "Menos cancelou": em % sobre as vendas, só
                  entre ativos com assiduidade perfeita (sem faltas no mês).
                </Text>
              </View>
            )}

          {/* Painel de saúde: semáforos */}
          <Text style={styles.secaoTitulo}>
            {ehMesCorrente
              ? 'Saúde dos indicadores (mês)'
              : `Resultado de ${rotuloMes(anoMes)}`}
          </Text>
          {saude.map((s) => (
            <Pressable key={s.def.tipo} onPress={() => irParaDetalhe(s.def.tipo)}>
              <View style={[styles.saudeCard, { borderLeftColor: corNivel(s.nivel) }]}>
                <View style={[styles.saudeIcone, { backgroundColor: fundoNivel(s.nivel) }]}>
                  <Ionicons
                    name={s.def.icone as keyof typeof Ionicons.glyphMap}
                    size={20}
                    color={corNivel(s.nivel)}
                  />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.saudeNome}>{s.def.titulo}</Text>
                  <Text style={styles.saudeValor}>{s.valorTexto}</Text>
                </View>
                <View style={[styles.saudeBadge, { backgroundColor: fundoNivel(s.nivel) }]}>
                  <Ionicons name={iconeNivel(s.nivel)} size={18} color={corNivel(s.nivel)} />
                </View>
              </View>
            </Pressable>
          ))}

          {/*
            Cancelamentos Totais (ADR 0025) — depois dos cinco indicadores
            importados, e com exatamente o mesmo desenho deles: mesma cor de
            fundo, mesmo recuo, mesma altura. O consolidado fecha a lista em vez
            de interrompê-la, e nada no visual sugere que ele seja um item de
            outra natureza.
          */}
          {totais && (
            <Pressable
              onPress={() => navigation.navigate('CancelamentosTotaisDetalhe')}
            >
              <View
                style={[
                  styles.saudeCard,
                  {
                    borderLeftColor: totais.nivel
                      ? corNivel(totais.nivel)
                      : cores.divisor,
                  },
                ]}
              >
                <View
                  style={[
                    styles.saudeIcone,
                    {
                      backgroundColor: totais.nivel
                        ? fundoNivel(totais.nivel)
                        : cores.superficieAlternativa,
                    },
                  ]}
                >
                  <Ionicons
                    name={
                      CANCELAMENTOS_TOTAIS_DEF.icone as keyof typeof Ionicons.glyphMap
                    }
                    size={20}
                    color={
                      totais.nivel ? corNivel(totais.nivel) : cores.textoSecundario
                    }
                  />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.saudeNome}>{totais.titulo}</Text>
                  <Text style={styles.saudeValor}>
                    {textoCancelamentosTotais(totais)}
                  </Text>
                  {/*
                    A única linha extra da card é o excesso, e só quando ele
                    existe. O percentual diz que há um problema; os reais dizem o
                    tamanho dele. Toda a explicação (composição, causas, ações)
                    mora no detalhe — a card é para bater o olho.
                  */}
                  {totais.excedente != null && totais.excedente > 0 && (
                    <Text style={styles.totaisExcedente}>
                      {formatarMoeda(totais.excedente)} acima do permitido
                    </Text>
                  )}
                </View>
                {totais.nivel && (
                  <View
                    style={[
                      styles.saudeBadge,
                      { backgroundColor: fundoNivel(totais.nivel) },
                    ]}
                  >
                    <Ionicons
                      name={iconeNivel(totais.nivel)}
                      size={18}
                      color={corNivel(totais.nivel)}
                    />
                  </View>
                )}
              </View>
            </Pressable>
          )}

          {/*
            Sacolas — venda em R$ por sacola que ENTRA no estoque (ADR 0022).

            Fica junto dos outros cinco porque é um indicador de gestão, mas tem
            card própria e a base escrita embaixo: o denominador dele são as
            sacolas recebidas, não as vendas. Sem esse aviso o gestor compararia
            coisas que não se comparam.
          */}
          {sacolas && (
            <Pressable onPress={() => navigation.navigate('SacolasDetalhe')}>
            <View
              style={[
                styles.saudeCard,
                {
                  borderLeftColor: sacolas.nivel
                    ? corNivel(sacolas.nivel)
                    : cores.divisor,
                },
              ]}
            >
              <View
                style={[
                  styles.saudeIcone,
                  {
                    backgroundColor: sacolas.nivel
                      ? fundoNivel(sacolas.nivel)
                      : cores.superficieAlternativa,
                  },
                ]}
              >
                <Ionicons
                  name="bag-handle"
                  size={20}
                  color={
                    sacolas.nivel ? corNivel(sacolas.nivel) : cores.textoSecundario
                  }
                />
              </View>
              {/*
                Só o nome e o valor: os fardos/entregas do mês e o aviso do efeito
                de calendário saíram da card e vivem no detalhe, onde há espaço
                para explicá-los. A base do indicador (sacolas recebidas, não as
                vendas) continua dita no detalhe — aqui ela poluía a leitura.
              */}
              <View style={styles.flex1}>
                <Text style={styles.saudeNome}>Sacolas</Text>
                <Text style={styles.saudeValor}>{textoSacolas(sacolas)}</Text>
              </View>
              {nivelSacolas(sacolas) && (
                <View
                  style={[
                    styles.saudeBadge,
                    { backgroundColor: fundoNivel(sacolas.nivel as Nivel) },
                  ]}
                >
                  <Ionicons
                    name={iconeNivel(sacolas.nivel as Nivel)}
                    size={18}
                    color={corNivel(sacolas.nivel as Nivel)}
                  />
                </View>
              )}
              <Ionicons
                name="chevron-forward"
                size={18}
                color={cores.textoSecundario}
              />
            </View>
            </Pressable>
          )}

          {/* Card "Precisa de atenção" — detalhado */}
          {painel && !painel.tudoCerto && (
            <View style={styles.atencaoCard}>
              <View style={styles.atencaoTopo}>
                <Ionicons name="alert-circle" size={20} color={cores.vermelho} />
                <Text style={styles.atencaoTitulo}>Precisa de atenção</Text>
                <View style={styles.atencaoContadores}>
                  {painel.criticos > 0 && (
                    <View style={[styles.contadorPill, { backgroundColor: cores.vermelho }]}>
                      <Text style={styles.contadorPillTexto}>{painel.criticos} crítico{painel.criticos > 1 ? 's' : ''}</Text>
                    </View>
                  )}
                  {painel.emAtencao > 0 && (
                    <View style={[styles.contadorPill, { backgroundColor: cores.amarelo }]}>
                      <Text style={styles.contadorPillTexto}>{painel.emAtencao} atenção</Text>
                    </View>
                  )}
                </View>
              </View>

              {painel.alertas.map((a, i) => {
                const extras = [
                  a.categoria === 'OPERADOR' &&
                  a.ticketMedio != null &&
                  a.operadorItens != null &&
                  a.operadorItens > 0
                    ? `ticket ${formatarMoeda(a.ticketMedio)}`
                    : null,
                  a.autorizadoPor ? `autoriz.: ${a.autorizadoPor}` : null,
                  a.projecaoTexto ?? null,
                  a.detalheTendencia ?? null,
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <Pressable
                    key={`${a.categoria}-${a.tipo}-${i}`}
                    onPress={() =>
                      navigation.navigate('IndicadorDetalhe', {
                        tipo: a.tipo,
                        operadorNome: a.operadorNome,
                        alertaMensagem: a.mensagem,
                      })
                    }
                    style={[
                      styles.alertaItem,
                      { borderLeftColor: a.severidade === 'CRITICO' ? cores.vermelho : cores.amarelo },
                    ]}
                  >
                    <View style={styles.alertaLinhaTopo}>
                      <Text style={styles.alertaEmoji}>
                        {a.severidade === 'CRITICO' ? '🔴' : '🟡'}
                        {a.categoria === 'OPERADOR' ? ' 👤' : ''}
                      </Text>
                      <Text style={styles.alertaTitulo} numberOfLines={1}>
                        {a.titulo}
                      </Text>
                      {a.tendencia && (
                        <Text
                          style={[
                            styles.alertaTendencia,
                            {
                              color:
                                a.tendencia === 'PIORANDO'
                                  ? cores.vermelho
                                  : a.tendencia === 'MELHORANDO'
                                    ? cores.verde
                                    : cores.textoSecundario,
                            },
                          ]}
                        >
                          {a.tendencia === 'PIORANDO' ? '↑' : a.tendencia === 'MELHORANDO' ? '↓' : '→'}
                        </Text>
                      )}
                    </View>

                    <Text style={styles.alertaMensagem} numberOfLines={2}>
                      {a.mensagem}
                    </Text>
                    {extras ? (
                      <Text style={styles.alertaSub} numberOfLines={1}>
                        {extras}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Estado "tudo certo" */}
          {painel && painel.tudoCerto && (
            <View style={styles.tudoCertoCard}>
              <Ionicons name="checkmark-circle" size={22} color={cores.verde} />
              <Text style={styles.tudoCertoTexto}>
                Tudo dentro das metas hoje. Continue assim! 🎉
              </Text>
            </View>
          )}

          <Text style={styles.dica}>
            Toque em um indicador para ver a evolução mês a mês, tendência,
            comparativo, projeção e ranking. Use as setas do topo para rever
            qualquer mês dos últimos {MESES_HISTORICO_INDICADORES}.
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
    paddingHorizontal: espacamento.sm,
    marginBottom: espacamento.sm,
  },
  seletorBotao: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seletorCentro: { alignItems: 'center' },
  seletorTexto: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
  },
  seletorSub: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  vendasLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.md,
  },
  vendasIcone: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: cores.primariaClara,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vendasRotulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  vendasValor: {
    ...tipografia.subtitulo,
    color: cores.texto,
    marginTop: 2,
  },
  atencaoCard: {
    backgroundColor: cores.vermelhoFundo,
    borderRadius: raio.lg,
    padding: espacamento.md,
    marginBottom: espacamento.md,
  },
  atencaoTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    marginBottom: espacamento.xs,
  },
  atencaoTitulo: {
    ...tipografia.rotulo,
    color: cores.vermelho,
    fontWeight: '700',
    flex: 1,
  },
  atencaoContadores: {
    flexDirection: 'row',
    gap: espacamento.xs,
  },
  contadorPill: {
    paddingHorizontal: espacamento.sm,
    paddingVertical: 2,
    borderRadius: 999,
  },
  contadorPillTexto: {
    color: cores.textoInverso,
    fontSize: 10,
    fontWeight: '700',
  },
  alertaItem: {
    backgroundColor: cores.superficie,
    borderRadius: raio.sm,
    paddingHorizontal: espacamento.md,
    paddingVertical: espacamento.sm,
    marginTop: espacamento.xs,
    borderLeftWidth: 3,
  },
  alertaLinhaTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
  },
  alertaEmoji: {
    fontSize: 11,
  },
  alertaTitulo: {
    ...tipografia.legenda,
    color: cores.texto,
    fontWeight: '700',
    flex: 1,
  },
  alertaTendencia: {
    fontWeight: '700',
    fontSize: 13,
  },
  alertaMensagem: {
    ...tipografia.legenda,
    color: cores.texto,
    fontSize: 11,
    marginTop: 2,
  },
  alertaSub: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    fontSize: 10,
    marginTop: 1,
  },
  tudoCertoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    backgroundColor: cores.verdeFundo,
    borderRadius: raio.lg,
    padding: espacamento.lg,
    marginBottom: espacamento.md,
  },
  tudoCertoTexto: {
    ...tipografia.rotulo,
    color: cores.verde,
    fontWeight: '600',
    flex: 1,
  },
  destaquesCard: {
    backgroundColor: '#FDF6E3',
    borderRadius: raio.lg,
    padding: espacamento.lg,
    marginBottom: espacamento.md,
  },
  destaquesTitulo: {
    ...tipografia.rotulo,
    color: '#92710A',
    fontWeight: '700',
    marginBottom: espacamento.sm,
  },
  destaqueLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    paddingVertical: espacamento.xs,
  },
  destaqueCategoria: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    fontSize: 11,
  },
  destaqueNome: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
  },
  destaqueValor: {
    ...tipografia.rotulo,
    fontWeight: '700',
  },
  destaquesNota: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    fontSize: 10,
    marginTop: espacamento.sm,
    fontStyle: 'italic',
  },
  secaoTitulo: {
    ...tipografia.secao,
    color: cores.texto,
    marginTop: espacamento.sm,
    marginBottom: espacamento.sm,
  },
  totaisExcedente: {
    ...tipografia.legenda,
    color: cores.vermelho,
    marginTop: 2,
    fontWeight: '600',
  },
  saudeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.md,
    backgroundColor: cores.superficie,
    borderRadius: raio.md,
    paddingHorizontal: espacamento.lg,
    paddingVertical: espacamento.md,
    marginBottom: espacamento.sm,
    borderLeftWidth: 4,
  },
  saudeIcone: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saudeNome: {
    ...tipografia.rotulo,
    color: cores.texto,
  },
  saudeValor: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  saudeBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dica: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
    textAlign: 'center',
  },
});

export default IndicadoresScreen;
