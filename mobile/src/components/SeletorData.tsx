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
}: {
  valor: string;
  aoMudar: (iso: string) => void;
  rotulo?: string;
  permitirFuturo?: boolean;
}): React.ReactElement {
  const hoje = hojeISO();
  const proximoBloqueado = !permitirFuturo && valor >= hoje;

  return (
    <View style={styles.container}>
      <Text style={styles.rotulo}>{rotulo}</Text>
      <View style={styles.controles}>
        <Pressable
          onPress={() => aoMudar(deslocarDias(valor, -1))}
          style={styles.botao}
          hitSlop={8}
          accessibilityLabel="Dia anterior"
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
