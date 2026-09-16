/**
 * Card "Compensação de horas" da Central de Jornada (ADR 0021).
 *
 * É um **resumo tocável que leva à tela** `Compensacao`, e não um bloco
 * recolhível. Era recolhível e mudou por dois motivos: a Central já é longa
 * (hero, atalhos, resumo do time, uma card por pessoa, comparativo) e abrir aqui
 * uma lista de sugestões com dois botões cada empurrava a lista de pessoas para
 * fora do alcance; e um recolhível esconde justamente o trabalho que a seção
 * existe para provocar — quem não abre, não age.
 *
 * O que fica aqui é só o que se lê de relance: quanto o time tem de 50% em
 * aberto, quanto **não cabe** no ciclo (que é o número que exige ação) e quantas
 * sugestões esperam decisão. O resto — os dias mais fracos, as liberações, as
 * coberturas de falta e o que já foi concedido — vive na tela.
 */
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { compensacaoHorasService } from '../../api/services';
import { CompensacaoPainel } from '../../api/services/compensacaoHoras';
import { Cartao } from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { RootStackParamList } from '../../navigation/types';
import { formatarDuracao } from '../../utils/formato';
import { cores, espacamento, raio, tipografia } from '../../theme';

/** "1 sugestão" / "3 sugestões" — plural por palavra inteira. */
function pluralSugestoes(n: number): string {
  return n === 1 ? '1 sugestão' : `${n} sugestões`;
}

export function CartaoCompensacao({
  ciclo,
  podeConceder,
}: {
  ciclo: number;
  /** `OPERADORES_AUSENCIAS` — a mesma permissão do botão "Débito". */
  podeConceder: boolean;
}): React.ReactElement | null {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // Sem permissão de conceder, nem se pede o painel: a consulta é pesada (lê a
  // apuração do ciclo, a escala, as férias e 90 dias de venda) e o servidor a
  // recusaria de todo modo. O hook em si roda sempre — trocar a chamada por uma
  // promessa vazia é o que respeita as regras dos hooks, como já faz o
  // comparativo por ciclo da Central.
  const painel = useRequisicao<CompensacaoPainel | null>(
    () =>
      podeConceder ? compensacaoHorasService.painel(ciclo) : Promise.resolve(null),
    [ciclo, podeConceder],
  );

  // A seção inteira depende da permissão de conceder: quem não pode agir não
  // precisa dela (e a Central já mostra o saldo de cada pessoa nas cards).
  if (!podeConceder) return null;

  const dados = painel.dados;
  const carteira = dados?.carteira;
  const totalSugestoes =
    (dados?.liberacoes.length ?? 0) + (dados?.coberturas.length ?? 0);
  const naoCabe = carteira?.naoAlocadoMs ?? 0;

  return (
    <Pressable
      onPress={() => navigation.navigate('Compensacao')}
      accessibilityRole="button"
      accessibilityLabel={`Compensação de horas. ${pluralSugestoes(totalSugestoes)}.`}
    >
      <Cartao style={styles.card}>
        <View style={styles.cabecalho}>
          <View style={styles.iconeBox}>
            <Ionicons name="swap-horizontal" size={18} color={cores.azul} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.titulo}>Compensação de horas</Text>
            <Text style={styles.ajuda}>
              {painel.carregando
                ? 'Calculando…'
                : totalSugestoes > 0
                  ? `${pluralSugestoes(totalSugestoes)} para zerar as horas de 50%`
                  : 'Zerar as horas de 50% antes de o ciclo fechar'}
            </Text>
          </View>
          {totalSugestoes > 0 && (
            <View style={styles.contador}>
              <Text style={styles.contadorTexto}>{totalSugestoes}</Text>
            </View>
          )}
          <Ionicons
            name="chevron-forward"
            size={18}
            color={cores.textoSecundario}
          />
        </View>

        {/* Os dois números que se leem de relance. O "não cabe no ciclo" é o que
            exige ação: como compensar no ciclo seguinte é proibido, essas horas
            serão pagas. */}
        {carteira && (
          <View style={styles.resumo}>
            <View style={styles.resumoItem}>
              <Text style={styles.resumoRotulo}>50% em aberto</Text>
              <Text style={styles.resumoValor}>
                {formatarDuracao(carteira.totalSaldoMs)}
              </Text>
            </View>
            <View style={styles.resumoItem}>
              <Text style={styles.resumoRotulo}>Não cabe no ciclo</Text>
              <Text
                style={[
                  styles.resumoValor,
                  { color: naoCabe > 0 ? cores.vermelho : cores.verde },
                ]}
              >
                {formatarDuracao(naoCabe)}
              </Text>
            </View>
          </View>
        )}
      </Cartao>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: espacamento.lg },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.md,
  },
  iconeBox: {
    width: 36,
    height: 36,
    borderRadius: raio.sm,
    backgroundColor: cores.azulFundo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titulo: { ...tipografia.secao, color: cores.texto },
  ajuda: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  contador: {
    minWidth: 24,
    paddingHorizontal: espacamento.xs,
    paddingVertical: 2,
    borderRadius: raio.pill,
    backgroundColor: cores.azul,
    alignItems: 'center',
  },
  contadorTexto: {
    ...tipografia.legenda,
    color: cores.textoInverso,
    fontWeight: '700',
  },

  resumo: {
    flexDirection: 'row',
    gap: espacamento.sm,
    marginTop: espacamento.lg,
  },
  resumoItem: {
    flex: 1,
    backgroundColor: cores.superficieAlternativa,
    borderRadius: raio.md,
    padding: espacamento.md,
  },
  resumoRotulo: { ...tipografia.legenda, color: cores.textoSecundario },
  resumoValor: { ...tipografia.subtitulo, color: cores.texto, marginTop: 2 },
});

export default CartaoCompensacao;
