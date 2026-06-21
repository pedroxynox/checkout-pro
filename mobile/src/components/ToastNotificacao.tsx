/**
 * Toast in-app de notificações em tempo real.
 *
 * Exibe, no topo da tela, a última notificação recebida via WebSocket por
 * alguns segundos. Some sozinho ou ao ser tocado. Renderizado na raiz do app
 * autenticado, fica visível sobre qualquer tela.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotificacoes } from '../notificacoes/NotificacoesContext';
import { cores, espacamento, raio, sombra, tipografia } from '../theme';

/** Tempo (ms) que o toast permanece visível. */
const DURACAO_MS = 5000;

export function ToastNotificacao(): React.ReactElement | null {
  const { ultima, descartarUltima } = useNotificacoes();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!ultima) {
      return;
    }
    const timer = setTimeout(descartarUltima, DURACAO_MS);
    return () => clearTimeout(timer);
  }, [ultima, descartarUltima]);

  if (!ultima) {
    return null;
  }

  return (
    <Pressable
      onPress={descartarUltima}
      accessibilityRole="button"
      style={[styles.container, { top: insets.top + espacamento.sm }]}
    >
      <View style={styles.icone}>
        <Ionicons name="notifications" size={20} color={cores.textoInverso} />
      </View>
      <View style={styles.texto}>
        <Text style={styles.titulo} numberOfLines={1}>
          {ultima.titulo}
        </Text>
        <Text style={styles.mensagem} numberOfLines={2}>
          {ultima.mensagem}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: espacamento.md,
    right: espacamento.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    backgroundColor: cores.superficie,
    borderRadius: raio.lg,
    borderLeftWidth: 4,
    borderLeftColor: cores.primaria,
    padding: espacamento.md,
    ...sombra.cartao,
    shadowOpacity: 0.2,
    elevation: 8,
    zIndex: 1000,
  },
  icone: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: cores.primaria,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texto: {
    flex: 1,
  },
  titulo: {
    ...tipografia.rotulo,
    color: cores.texto,
  },
  mensagem: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
});

export default ToastNotificacao;
