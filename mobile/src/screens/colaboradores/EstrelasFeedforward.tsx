/**
 * Estrelas 1–5 da nota de evolução do feedforward (leitura ou edição).
 * Na edição, cada estrela tem rótulo acessível ("Nota 1" … "Nota 5").
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { cores } from '../../theme';

export function Estrelas({
  nota,
  aoMudar,
}: {
  nota: number | null;
  aoMudar?: (n: number) => void;
}): React.ReactElement {
  return (
    <View style={styles.estrelas}>
      {[1, 2, 3, 4, 5].map((n) => {
        const cheia = (nota ?? 0) >= n;
        const estrela = (
          <Ionicons
            name={cheia ? 'star' : 'star-outline'}
            size={aoMudar ? 28 : 16}
            color={cheia ? '#F5A623' : cores.textoSecundario}
          />
        );
        return aoMudar ? (
          <Pressable
            key={n}
            onPress={() => aoMudar(n)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Nota ${n}`}
          >
            {estrela}
          </Pressable>
        ) : (
          <View key={n}>{estrela}</View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  estrelas: { flexDirection: 'row', gap: 2 },
});
