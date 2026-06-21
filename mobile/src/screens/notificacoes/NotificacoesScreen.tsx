/**
 * Centro de Notificações in-app (Req 7.3.1, 7.3.3).
 *
 * Lista o histórico de notificações do usuário autenticado, com título,
 * mensagem e data/hora. As notificações chegam também por push (configurado no
 * provedor); aqui exibimos o histórico consultável dentro do aplicativo.
 */
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { notificacoesService } from '../../api/services';
import {
  Carregando,
  Cartao,
  EstadoVazio,
  MensagemErro,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { useNotificacoes } from '../../notificacoes/NotificacoesContext';
import { cores, espacamento, tipografia } from '../../theme';
import { formatarDataHora } from '../../utils/formato';

export function NotificacoesScreen(): React.ReactElement {
  const notificacoes = useRequisicao(() => notificacoesService.historico(), []);
  const { zerar, ultima } = useNotificacoes();

  // Ao abrir a tela, zera o contador de não lidas (badge) e recarrega o
  // histórico para refletir o que chegou em tempo real.
  useFocusEffect(
    React.useCallback(() => {
      zerar();
      notificacoes.recarregar();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  // Atualiza a lista em tempo real quando uma nova notificação chega com a
  // tela aberta.
  React.useEffect(() => {
    if (ultima) {
      notificacoes.recarregar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ultima]);

  return (
    <Tela aoAtualizar={notificacoes.recarregar} atualizando={notificacoes.atualizando}>
      {notificacoes.carregando ? (
        <Carregando />
      ) : notificacoes.erro ? (
        <MensagemErro mensagem={notificacoes.erro} aoTentarNovamente={notificacoes.recarregar} />
      ) : !notificacoes.dados || notificacoes.dados.length === 0 ? (
        <EstadoVazio
          icone="notifications-off-outline"
          titulo="Sem notificações"
          descricao="Você está em dia. Novas notificações aparecerão aqui."
        />
      ) : (
        notificacoes.dados.map((n) => (
          <Cartao key={n.id}>
            <View style={styles.topo}>
              <Ionicons
                name={n.lida ? 'notifications-outline' : 'notifications'}
                size={18}
                color={n.lida ? cores.textoSecundario : cores.primaria}
              />
              <Text style={styles.titulo}>{n.titulo}</Text>
            </View>
            <Text style={styles.mensagem}>{n.mensagem}</Text>
            <Text style={styles.data}>{formatarDataHora(n.criadaEm)}</Text>
          </Cartao>
        ))
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    marginBottom: espacamento.xs,
  },
  titulo: {
    ...tipografia.corpo,
    fontWeight: '700',
    color: cores.texto,
    flex: 1,
  },
  mensagem: {
    ...tipografia.corpo,
    color: cores.texto,
    marginBottom: espacamento.xs,
  },
  data: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
});

export default NotificacoesScreen;
