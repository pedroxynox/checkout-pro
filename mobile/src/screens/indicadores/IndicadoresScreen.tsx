/**
 * Tela de Indicadores — Painel de Saúde.
 *
 * Topo: vendas do mês, destaques do mês (Top 3: troco, recargas e maior
 * cancelamento de itens) e os semáforos de saúde de cada indicador. Abaixo,
 * o painel "Precisa de atenção" com o que precisa de revisão. Tocar num
 * indicador abre o detalhe (totais, meta, gráficos, tendência e ranking).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { arrecadacaoService, vendasService } from '../../api/services';
import {
  DestaquesMes,
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
import { ARRECADACAO, DefinicaoArrecadacao } from '../../utils/rotulos';

type Nivel = 'OK' | 'ATENCAO' | 'FORA';

interface SaudeIndicador {
  def: DefinicaoArrecadacao;
  resumo: ResumoArrecadacao;
  nivel: Nivel;
  valorTexto: string;
}

/** Avalia o nível do indicador no acumulado do mês. */
function nivelMes(def: DefinicaoArrecadacao, resumo: ResumoArrecadacao): Nivel {
  if (def.base === 'FIXA') {
    if (resumo.totalMes >= resumo.meta) return 'OK';
    if (resumo.totalMes >= resumo.meta * 0.75) return 'ATENCAO';
    return 'FORA';
  }
  const pct = resumo.percentualMes ?? 0;
  if (pct <= resumo.meta) return 'OK';
  if (pct <= resumo.meta * 1.5) return 'ATENCAO';
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
  return `${formatarPercentual(resumo.percentualMes ?? 0)} (meta ≤ ${formatarPercentual(def.meta)})`;
}

export function IndicadoresScreen({
  navigation,
}: PropsTela<'Indicadores'>): React.ReactElement {
  const data = hojeISO();

  const req = useRequisicao(async () => {
    const resumos = await Promise.all(
      ARRECADACAO.map((def) => arrecadacaoService.resumo(def.tipo, data)),
    );
    const [vendas, destaques, painel] = await Promise.all([
      vendasService.resumo(data).catch(() => null),
      arrecadacaoService.destaquesMes(data).catch(() => null),
      arrecadacaoService.painelAtencao(data).catch(() => null),
    ]);
    const saude: SaudeIndicador[] = ARRECADACAO.map((def, i) => ({
      def,
      resumo: resumos[i],
      nivel: nivelMes(def, resumos[i]),
      valorTexto: valorMesTexto(def, resumos[i]),
    }));
    return { saude, vendas, destaques, painel };
  }, [data]);

  const saude = req.dados?.saude ?? [];
  const vendas: ResumoVendas | null = req.dados?.vendas ?? null;
  const destaques: DestaquesMes | null = req.dados?.destaques ?? null;
  const painel: PainelAtencao | null = req.dados?.painel ?? null;

  const irParaDetalhe = useCallback(
    (tipo: DefinicaoArrecadacao['tipo']) =>
      navigation.navigate('IndicadorDetalhe', { tipo }),
    [navigation],
  );

  return (
    <Tela aoAtualizar={req.recarregar} atualizando={req.atualizando}>
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
                    <Text style={styles.vendasRotulo}>Vendas do mês</Text>
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
                      {destaques.menosCancelou.total > 0
                        ? formatarMoeda(destaques.menosCancelou.total)
                        : 'Zero'}
                    </Text>
                  </View>
                )}

                <Text style={styles.destaquesNota}>
                  Troco e recargas: maior arrecadação. Cancelamento: maior valor —
                  para acompanhar. "Menos cancelou": destaque positivo entre os ativos.
                </Text>
              </View>
            )}

          {/* Painel de saúde: semáforos */}
          <Text style={styles.secaoTitulo}>Saúde dos indicadores (mês)</Text>
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
            Toque em um indicador para ver tendência, comparativo, projeção e
            ranking.
          </Text>
        </>
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
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
