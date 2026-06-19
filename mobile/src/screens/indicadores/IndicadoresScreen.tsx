/**
 * Tela de Indicadores (menu).
 *
 * Lista os cinco indicadores de arrecadação. Ao tocar em um deles, abre a tela
 * de detalhe correspondente (totais por período, meta, gráficos e ranking).
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Cartao, Tela } from '../../components';
import { PropsTela } from '../../navigation/types';
import { cores, espacamento, tipografia } from '../../theme';
import { ARRECADACAO } from '../../utils/rotulos';

export function IndicadoresScreen({
  navigation,
}: PropsTela<'Indicadores'>): React.ReactElement {
  return (
    <Tela>
      <Text style={styles.intro}>
        Escolha um indicador para ver os totais, a meta, os gráficos e o
        ranking.
      </Text>
      {ARRECADACAO.map((def) => (
        <Pressable
          key={def.tipo}
          onPress={() =>
            navigation.navigate('IndicadorDetalhe', { tipo: def.tipo })
          }
          style={({ pressed }) => (pressed ? styles.pressionado : undefined)}
        >
          <Cartao>
            <View style={styles.linha}>
              <View style={styles.icone}>
                <Ionicons
                  name={def.icone as keyof typeof Ionicons.glyphMap}
                  size={24}
                  color={cores.primaria}
                />
              </View>
              <View style={styles.textos}>
                <Text style={styles.titulo}>{def.titulo}</Text>
                <Text style={styles.descricao}>{def.descricao}</Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={22}
                color={cores.textoSecundario}
              />
            </View>
          </Cartao>
        </Pressable>
      ))}
    </Tela>
  );
}

const styles = StyleSheet.create({
  intro: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.sm,
  },
  pressionado: {
    opacity: 0.6,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.md,
  },
  icone: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: cores.primariaClara,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textos: {
    flex: 1,
  },
  titulo: {
    ...tipografia.secao,
    color: cores.texto,
  },
  descricao: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
});

export default IndicadoresScreen;
