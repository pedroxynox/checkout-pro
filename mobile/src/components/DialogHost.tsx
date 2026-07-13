/**
 * Host único das janelas de diálogo (confirmação e aviso) do app.
 *
 * Fica montado na raiz (App.tsx) e escuta os pedidos publicados por
 * `utils/dialogos` (`confirmar`/`notificar`). Exibe uma janela flutuante
 * padronizada, com ícone temático, título, mensagem e botões — no celular e na
 * web. Só existe UM host; os pedidos são exibidos um de cada vez (fila).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { ComponentProps, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { cores, espacamento, raio, sombra, tipografia } from '../theme';
import {
  PedidoDialogo,
  registrarOuvinteDialogo,
  responderDialogo,
} from '../utils/dialogos';

type NomeIcone = ComponentProps<typeof Ionicons>['name'];

/** Ícone/cores conforme o tipo (confirmação) e o tom (sucesso/erro). */
function visualDe(pedido: PedidoDialogo): {
  icone: NomeIcone;
  cor: string;
  fundo: string;
} {
  if (pedido.tipo === 'confirmar') {
    return { icone: 'help-circle', cor: cores.primaria, fundo: cores.primariaClara };
  }
  if (pedido.tom === 'erro') {
    return { icone: 'alert-circle', cor: cores.vermelho, fundo: cores.vermelhoFundo };
  }
  return { icone: 'checkmark-circle', cor: cores.verde, fundo: cores.verdeFundo };
}

export function DialogHost(): React.ReactElement {
  const [pedido, setPedido] = useState<PedidoDialogo | null>(null);

  useEffect(() => {
    registrarOuvinteDialogo(setPedido);
    return () => registrarOuvinteDialogo(null);
  }, []);

  const ehConfirmar = pedido?.tipo === 'confirmar';
  const visual = pedido
    ? visualDe(pedido)
    : { icone: 'help-circle' as NomeIcone, cor: cores.primaria, fundo: cores.primariaClara };

  return (
    <Modal
      visible={pedido !== null}
      transparent
      animationType="fade"
      onRequestClose={() => responderDialogo(false)}
    >
      <Pressable style={styles.fundo} onPress={() => responderDialogo(false)}>
        {/* onPress vazio: tocar dentro do cartão não fecha. */}
        <Pressable style={styles.cartao} onPress={() => {}}>
          <View style={styles.handle} />

          <View style={[styles.iconeCirculo, { backgroundColor: visual.fundo }]}>
            <Ionicons name={visual.icone} size={32} color={visual.cor} />
          </View>

          <Text style={styles.titulo}>{pedido?.titulo}</Text>
          {pedido?.mensagem ? (
            <Text style={styles.mensagem}>{pedido.mensagem}</Text>
          ) : null}

          {ehConfirmar ? (
            <View style={styles.linhaBotoes}>
              <Pressable
                style={({ pressed }) => [
                  styles.botao,
                  styles.botaoSecundario,
                  pressed && styles.pressionado,
                ]}
                onPress={() => responderDialogo(false)}
                accessibilityRole="button"
              >
                <Text style={styles.textoSecundario}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.botao,
                  styles.botaoPrimario,
                  pressed && styles.pressionado,
                ]}
                onPress={() => responderDialogo(true)}
                accessibilityRole="button"
              >
                <Ionicons name="checkmark" size={18} color={cores.textoInverso} />
                <Text style={styles.textoPrimario}>{pedido?.textoConfirmar}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.botao,
                styles.botaoPrimario,
                styles.botaoFull,
                pressed && styles.pressionado,
              ]}
              onPress={() => responderDialogo(true)}
              accessibilityRole="button"
            >
              <Text style={styles.textoPrimario}>OK</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fundo: {
    flex: 1,
    backgroundColor: 'rgba(10, 37, 64, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: espacamento.xl,
  },
  cartao: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: cores.superficie,
    borderRadius: 24,
    paddingHorizontal: espacamento.xl,
    paddingTop: espacamento.md,
    paddingBottom: espacamento.xl,
    alignItems: 'center',
    ...sombra.cartao,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: raio.pill,
    backgroundColor: cores.borda,
    marginBottom: espacamento.lg,
  },
  iconeCirculo: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: espacamento.lg,
  },
  titulo: {
    ...tipografia.titulo,
    fontSize: 20,
    color: cores.texto,
    textAlign: 'center',
    marginBottom: espacamento.xs,
  },
  mensagem: {
    ...tipografia.corpo,
    color: cores.textoSecundario,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: espacamento.xl,
  },
  linhaBotoes: {
    flexDirection: 'row',
    gap: espacamento.md,
    width: '100%',
  },
  botao: {
    flex: 1,
    minHeight: 52,
    borderRadius: raio.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacamento.xs,
  },
  botaoFull: {
    flex: 0,
    width: '100%',
  },
  botaoPrimario: {
    backgroundColor: cores.primaria,
  },
  botaoSecundario: {
    backgroundColor: cores.superficieAlternativa,
  },
  textoPrimario: {
    ...tipografia.rotulo,
    fontSize: 15,
    color: cores.textoInverso,
  },
  textoSecundario: {
    ...tipografia.rotulo,
    fontSize: 15,
    color: cores.texto,
  },
  pressionado: {
    opacity: 0.85,
  },
});

export default DialogHost;
