/**
 * Componente base de tela: aplica área segura, fundo do tema e, opcionalmente,
 * rolagem e "pull-to-refresh". Padroniza o enquadramento de todas as telas.
 */
import React from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cores, espacamento } from '../theme';

interface TelaProps {
  children: React.ReactNode;
  rolavel?: boolean;
  aoAtualizar?: () => void;
  atualizando?: boolean;
  estilo?: ViewStyle;
  semPadding?: boolean;
}

export function Tela({
  children,
  rolavel = true,
  aoAtualizar,
  atualizando = false,
  estilo,
  semPadding = false,
}: TelaProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const padding = semPadding ? undefined : espacamento.lg;

  const conteudoBase: ViewStyle = {
    paddingHorizontal: padding,
    paddingTop: padding,
    paddingBottom: (padding ?? 0) + insets.bottom,
  };

  if (!rolavel) {
    return (
      <View style={[styles.container, conteudoBase, estilo]}>{children}</View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[conteudoBase, estilo]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        aoAtualizar ? (
          <RefreshControl
            refreshing={atualizando}
            onRefresh={aoAtualizar}
            colors={[cores.primaria]}
            tintColor={cores.primaria}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: cores.fundo,
  },
});

export default Tela;
