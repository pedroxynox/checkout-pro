/**
 * Seletor de data simples (anterior/seguinte) sem dependência nativa de
 * date-picker. Opera sobre uma data ISO (yyyy-mm-dd) em UTC e exibe a data
 * formatada em pt-BR.
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { cores, espacamento, raio, tipografia } from '../theme';
import { formatarData, hojeISO } from '../utils/formato';

function deslocarDias(iso: string, dias: number): string {
  const data = new Date(`${iso}T00:00:00.000Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

export function SeletorData({
  valor,
  aoMudar,
  rotulo = 'Data',
  permitirFuturo = true,
  dataMinima,
}: {
  valor: string;
  aoMudar: (iso: string) => void;
  rotulo?: string;
  permitirFuturo?: boolean;
  /**
   * Data mínima (ISO `yyyy-mm-dd`) permitida. Quando definida, bloqueia o botão
   * "dia anterior" e a navegação abaixo dela (espelha `permitirFuturo`). A
   * fronteira é inclusiva: `valor === dataMinima` já bloqueia voltar.
   */
  dataMinima?: string;
}): React.ReactElement {
  const hoje = hojeISO();
  const proximoBloqueado = !permitirFuturo && valor >= hoje;
  const anteriorBloqueado = !!dataMinima && valor <= dataMinima;

  return (
    <View style={styles.container}>
      <Text style={styles.rotulo}>{rotulo}</Text>
      <View style={styles.controles}>
        <Pressable
          onPress={() => !anteriorBloqueado && aoMudar(deslocarDias(valor, -1))}
          style={[styles.botao, anteriorBloqueado && styles.inativo]}
          hitSlop={8}
          accessibilityLabel="Dia anterior"
          accessibilityState={{ disabled: anteriorBloqueado }}
        >
          <Ionicons name="chevron-back" size={20} color={cores.primaria} />
        </Pressable>
        <Text style={styles.data}>{formatarData(valor)}</Text>
        <Pressable
          onPress={() => !proximoBloqueado && aoMudar(deslocarDias(valor, 1))}
          style={[styles.botao, proximoBloqueado && styles.inativo]}
          hitSlop={8}
          accessibilityLabel="Próximo dia"
        >
          <Ionicons name="chevron-forward" size={20} color={cores.primaria} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: espacamento.md,
  },
  rotulo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginBottom: espacamento.xs,
  },
  controles: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.md,
    paddingHorizontal: espacamento.sm,
    height: 48,
  },
  botao: {
    padding: espacamento.sm,
  },
  inativo: {
    opacity: 0.3,
  },
  data: {
    ...tipografia.corpo,
    fontWeight: '600',
    color: cores.texto,
  },
});

export default SeletorData;
