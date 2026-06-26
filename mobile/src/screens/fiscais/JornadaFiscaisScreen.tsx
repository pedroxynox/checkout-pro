/**
 * Log de jornada da equipe de fiscais (uso gerencial — funcionalidade
 * FISCAIS_JORNADA). Mostra, por fiscal, o tempo trabalhando, o tempo de
 * intervalo e a carga horária do dia com cores de status.
 *
 * Inclui:
 * - Card com a data de hoje
 * - Acumulado de horas extras do mês (excluindo domingos)
 * - Cards por fiscal com status colorido e tempos
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fiscaisService } from '../../api/services';
import { useAuth } from '../../auth/AuthContext';
import { ItemHorasExtrasFiscal, ItemJornadaFiscal, StatusFiscal } from '../../api/types';
import {
  Carregando,
  Cartao,
  EstadoVazio,
  MensagemErro,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { RootStackParamList } from '../../navigation/types';
import { formatarDuracao } from '../../utils/formato';
import { ROTULO_STATUS_FISCAL } from '../../utils/rotulos';
import { cores, espacamento, raio, tipografia } from '../../theme';

const VERDE = cores.sucesso ?? '#1E9E5A';
const AMARELO = cores.amarelo ?? '#C99700';
const CINZA = cores.textoSecundario;
const AZUL = '#2563EB';

function corStatus(status: StatusFiscal): string {
  if (status === 'DISPONIVEL') return VERDE;
  if (status === 'INTERVALO') return AMARELO;
  return CINZA;
}

function corFundoStatus(status: StatusFiscal): string {
  if (status === 'DISPONIVEL') return cores.verdeFundo ?? '#E4F6EC';
  if (status === 'INTERVALO') return cores.amareloFundo ?? '#FBF3DA';
  return cores.fundo;
}

function iconeStatus(status: StatusFiscal): keyof typeof Ionicons.glyphMap {
  if (status === 'DISPONIVEL') return 'checkmark-circle';
  if (status === 'INTERVALO') return 'cafe';
  return 'exit-outline';
}

/** Formata a data de hoje em português: "Segunda-feira, 21 de junho de 2026" */
function formatarDataHoje(): string {
  const dias = [
    'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
    'Quinta-feira', 'Sexta-feira', 'Sábado',
  ];
  const meses = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];
  const hoje = new Date();
  const diaSemana = dias[hoje.getDay()];
  const dia = hoje.getDate();
  const mes = meses[hoje.getMonth()];
  const ano = hoje.getFullYear();
  return `${diaSemana}, ${dia} de ${mes} de ${ano}`;
}

/** Nome do mês atual para o acumulado */
function nomeMesAtual(): string {
  const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];
  return meses[new Date().getMonth()];
}

export function JornadaFiscaisScreen(): React.ReactElement {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { podeAcessar } = useAuth();
  const podeVerPerfil = podeAcessar('OPERADORES_AUSENCIAS');
  const jornada = useRequisicao<ItemJornadaFiscal[]>(
    () => fiscaisService.jornada(),
    [],
  );

  const horasExtras = useRequisicao<ItemHorasExtrasFiscal[]>(
    () => fiscaisService.horasExtrasMes(),
    [],
  );

  /** Cria mapa de horas extras por fiscalId para lookup rápido */
  const mapaExtras = React.useMemo(() => {
    const m = new Map<string, number>();
    if (horasExtras.dados) {
      for (const he of horasExtras.dados) {
        m.set(he.fiscalId, he.horasExtrasMs);
      }
    }
    return m;
  }, [horasExtras.dados]);

  /** Total geral de horas extras da equipe no mês */
  const totalExtrasEquipe = React.useMemo(() => {
    if (!horasExtras.dados) return 0;
    return horasExtras.dados.reduce((acc, he) => acc + he.horasExtrasMs, 0);
  }, [horasExtras.dados]);

  const recarregarTudo = async () => {
    await Promise.all([jornada.recarregar(), horasExtras.recarregar()]);
  };

  return (
    <Tela aoAtualizar={recarregarTudo} atualizando={jornada.atualizando || horasExtras.atualizando}>
      {/* Card com a data de hoje */}
      <Cartao style={styles.cardData}>
        <View style={styles.dataRow}>
          <View style={styles.dataIcone}>
            <Ionicons name="calendar" size={22} color={cores.primaria} />
          </View>
          <View>
            <Text style={styles.dataLabel}>Jornada de hoje</Text>
            <Text style={styles.dataTexto}>{formatarDataHoje()}</Text>
          </View>
        </View>
      </Cartao>

      {/* Card acumulado de horas extras do mês */}
      <Cartao style={styles.cardExtras}>
        <View style={styles.extrasRow}>
          <View style={[styles.dataIcone, { backgroundColor: '#EFF6FF' }]}>
            <Ionicons name="trending-up" size={22} color={AZUL} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.extrasLabel}>Horas extras — {nomeMesAtual()}</Text>
            <Text style={styles.extrasTotalValor}>{formatarDuracao(totalExtrasEquipe)}</Text>
          </View>
        </View>

        {/* Detalhamento por fiscal */}
        {horasExtras.dados && horasExtras.dados.length > 0 && (
          <View style={styles.extrasLista}>
            {horasExtras.dados
              .filter((he) => he.horasExtrasMs > 0)
              .sort((a, b) => b.horasExtrasMs - a.horasExtrasMs)
              .map((he) => (
                <View key={he.fiscalId} style={styles.extrasItem}>
                  <Text style={styles.extrasNome}>{he.primeiroNome}</Text>
                  <Text style={styles.extrasValor}>+{formatarDuracao(he.horasExtrasMs)}</Text>
                </View>
              ))}
            {horasExtras.dados.every((he) => he.horasExtrasMs === 0) && (
              <Text style={styles.extrasSemDados}>Nenhuma hora extra registrada neste mês.</Text>
            )}
          </View>
        )}
      </Cartao>

      {/* Título da seção de jornada individual */}
      <Text style={styles.secaoTitulo}>Equipe</Text>

      {jornada.carregando ? (
        <Carregando />
      ) : jornada.erro ? (
        <MensagemErro
          mensagem={jornada.erro}
          aoTentarNovamente={recarregarTudo}
        />
      ) : !jornada.dados || jornada.dados.length === 0 ? (
        <EstadoVazio
          icone="time-outline"
          titulo="Sem registros"
          descricao="Ainda não há ponto registrado hoje."
        />
      ) : (
        jornada.dados.map((f) => {
          const navegavel = podeVerPerfil && !!f.colaboradorId;
          return (
          <Pressable
            key={f.fiscalId}
            disabled={!navegavel}
            onPress={() =>
              f.colaboradorId &&
              navigation.navigate('PerfilColaborador', {
                colaboradorId: f.colaboradorId,
              })
            }
            style={({ pressed }) => (pressed && navegavel ? { opacity: 0.6 } : null)}
          >
          <Cartao style={styles.cartaoFiscal}>
            {/* Borda lateral colorida */}
            <View style={[styles.bordaLateral, { backgroundColor: corStatus(f.status) }]} />

            {/* Cabeçalho: ícone + nome + badge status */}
            <View style={styles.topo}>
              <View style={[styles.iconeContainer, { backgroundColor: corFundoStatus(f.status) }]}>
                <Ionicons
                  name={iconeStatus(f.status)}
                  size={18}
                  color={corStatus(f.status)}
                />
              </View>
              <Text style={styles.nome}>{f.primeiroNome}</Text>
              <View style={[styles.badgeStatus, { backgroundColor: corFundoStatus(f.status) }]}>
                <View style={[styles.pontinho, { backgroundColor: corStatus(f.status) }]} />
                <Text style={[styles.statusTexto, { color: corStatus(f.status) }]}>
                  {ROTULO_STATUS_FISCAL[f.status]}
                </Text>
              </View>
            </View>

            {/* Tempos */}
            <View style={styles.tempos}>
              <ItemTempo rotulo="Trabalhando" valor={formatarDuracao(f.tempoTrabalhandoMs)} cor={VERDE} />
              <ItemTempo rotulo="Intervalo" valor={formatarDuracao(f.tempoIntervaloMs)} cor={AMARELO} />
              <ItemTempo rotulo="Carga" valor={formatarDuracao(f.cargaHorariaMs)} cor={cores.texto} />
            </View>

            {/* Horas extras do mês deste fiscal */}
            {(mapaExtras.get(f.fiscalId) ?? 0) > 0 && (
              <View style={styles.extrasFiscalRow}>
                <Ionicons name="trending-up" size={14} color={AZUL} />
                <Text style={styles.extrasFiscalTexto}>
                  +{formatarDuracao(mapaExtras.get(f.fiscalId)!)} extras no mês
                </Text>
              </View>
            )}
          </Cartao>
          </Pressable>
          );
        })
      )}
    </Tela>
  );
}

function ItemTempo({
  rotulo,
  valor,
  cor,
}: {
  rotulo: string;
  valor: string;
  cor: string;
}): React.ReactElement {
  return (
    <View style={styles.item}>
      <Text style={[styles.itemValor, { color: cor }]}>{valor}</Text>
      <Text style={styles.itemRotulo}>{rotulo}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cardData: {
    marginBottom: 0,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.md,
  },
  dataIcone: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: cores.primariaClara,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dataLabel: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  dataTexto: {
    ...tipografia.rotulo,
    color: cores.texto,
    marginTop: 2,
  },
  cardExtras: {
    marginBottom: 0,
  },
  extrasRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.md,
  },
  extrasLabel: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  extrasTotalValor: {
    ...tipografia.subtitulo,
    color: AZUL,
    marginTop: 2,
  },
  extrasLista: {
    marginTop: espacamento.md,
    borderTopWidth: 1,
    borderTopColor: cores.divisor,
    paddingTop: espacamento.sm,
  },
  extrasItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: espacamento.xs,
  },
  extrasNome: {
    ...tipografia.rotulo,
    color: cores.texto,
  },
  extrasValor: {
    ...tipografia.rotulo,
    color: AZUL,
  },
  extrasSemDados: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    textAlign: 'center',
    paddingVertical: espacamento.sm,
  },
  secaoTitulo: {
    ...tipografia.secao,
    color: cores.texto,
    marginTop: espacamento.lg,
    marginBottom: espacamento.sm,
  },
  cartaoFiscal: {
    overflow: 'hidden',
    position: 'relative',
  },
  bordaLateral: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: raio.lg,
    borderBottomLeftRadius: raio.lg,
  },
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
  },
  iconeContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nome: {
    ...tipografia.rotulo,
    color: cores.texto,
    flex: 1,
  },
  badgeStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    paddingHorizontal: espacamento.sm,
    paddingVertical: 4,
    borderRadius: raio.pill,
  },
  pontinho: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusTexto: {
    ...tipografia.legenda,
    fontWeight: '700',
  },
  tempos: {
    flexDirection: 'row',
    gap: espacamento.sm,
    marginTop: espacamento.md,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: cores.fundo,
    borderRadius: raio.md,
    paddingVertical: espacamento.sm,
  },
  itemValor: {
    ...tipografia.rotulo,
    fontWeight: '700',
  },
  itemRotulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  extrasFiscalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    marginTop: espacamento.sm,
    paddingTop: espacamento.sm,
    borderTopWidth: 1,
    borderTopColor: cores.divisor,
  },
  extrasFiscalTexto: {
    ...tipografia.legenda,
    color: AZUL,
    fontWeight: '600',
  },
});

export default JornadaFiscaisScreen;
