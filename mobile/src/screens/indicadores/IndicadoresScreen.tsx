/**
 * Tela de Indicadores — Painel de Saúde + menu.
 *
 * Topo: visão 360° (semáforo de cada indicador no mês, operador do mês e o
 * card "Atenção hoje" com o que precisa de revisão). Abaixo, o menu para
 * abrir o detalhe de cada indicador (totais, meta, gráficos, tendência e
 * ranking).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { arrecadacaoService, vendasService } from '../../api/services';
import {
  AnomaliaIndicador,
  OperadorDoMes,
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
    const [vendas, operador, anomalias] = await Promise.all([
      vendasService.resumo(data).catch(() => null),
      arrecadacaoService.operadorDoMes(data).catch(() => null),
      arrecadacaoService.anomalias(data).catch(() => [] as AnomaliaIndicador[]),
    ]);
    const saude: SaudeIndicador[] = ARRECADACAO.map((def, i) => ({
      def,
      resumo: resumos[i],
      nivel: nivelMes(def, resumos[i]),
      valorTexto: valorMesTexto(def, resumos[i]),
    }));
    return { saude, vendas, operador, anomalias };
  }, [data]);

  const saude = req.dados?.saude ?? [];
  const vendas: ResumoVendas | null = req.dados?.vendas ?? null;
  const operador: OperadorDoMes | null = req.dados?.operador ?? null;
  const anomalias: AnomaliaIndicador[] = req.dados?.anomalias ?? [];

  // "Atenção hoje": indicadores fora da meta + anomalias.
  const fora = saude.filter((s) => s.nivel === 'FORA');
  const atencao = saude.filter((s) => s.nivel === 'ATENCAO');
  const temAlerta = fora.length > 0 || atencao.length > 0 || anomalias.length > 0;

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

          {/* Card "Atenção hoje" */}
          {temAlerta && (
            <View style={styles.atencaoCard}>
              <View style={styles.atencaoTopo}>
                <Ionicons name="alert-circle" size={20} color={cores.vermelho} />
                <Text style={styles.atencaoTitulo}>Precisa de atenção</Text>
              </View>
              {fora.map((s) => (
                <Text key={`f-${s.def.tipo}`} style={styles.atencaoItem}>
                  🔴 {s.def.titulo}: {s.valorTexto}
                </Text>
              ))}
              {atencao.map((s) => (
                <Text key={`a-${s.def.tipo}`} style={styles.atencaoItem}>
                  🟡 {s.def.titulo}: {s.valorTexto}
                </Text>
              ))}
              {anomalias.map((a, i) => (
                <Text key={`an-${i}`} style={styles.atencaoItem}>
                  ⚠️ {a.nome} está acima da média em{' '}
                  {ARRECADACAO.find((d) => d.tipo === a.tipo)?.titulo ?? a.tipo}
                </Text>
              ))}
            </View>
          )}

          {/* Operador do mês */}
          {operador && (
            <View style={styles.operadorCard}>
              <Ionicons name="trophy" size={22} color="#B7791F" />
              <View style={styles.flex1}>
                <Text style={styles.operadorRotulo}>Operador do mês</Text>
                <Text style={styles.operadorNome}>{operador.nome}</Text>
              </View>
              <Text style={styles.operadorValor}>{formatarMoeda(operador.total)}</Text>
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
    padding: espacamento.lg,
    marginBottom: espacamento.md,
  },
  atencaoTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    marginBottom: espacamento.sm,
  },
  atencaoTitulo: {
    ...tipografia.rotulo,
    color: cores.vermelho,
    fontWeight: '700',
  },
  atencaoItem: {
    ...tipografia.legenda,
    color: cores.texto,
    paddingVertical: 2,
  },
  operadorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.md,
    backgroundColor: '#FDF6E3',
    borderRadius: raio.lg,
    padding: espacamento.lg,
    marginBottom: espacamento.md,
  },
  operadorRotulo: {
    ...tipografia.legenda,
    color: '#92710A',
  },
  operadorNome: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
    marginTop: 2,
  },
  operadorValor: {
    ...tipografia.rotulo,
    color: '#B7791F',
    fontWeight: '700',
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
