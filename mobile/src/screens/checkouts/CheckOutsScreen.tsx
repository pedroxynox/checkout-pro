/**
 * Seção Check-Outs — tablero das caixas.
 *
 * Mostra os check-outs (1..N) num quadro colorido: verde = tudo certo, vermelho
 * = tem avaria(s) aberta(s). Tocar em uma caixa abre o detalhe para reportar/ver
 * avarias. Disponível a todo fiscal (`CHECKOUTS`).
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { checkoutsService } from '../../api/services';
import {
  Aviso,
  Carregando,
  EstadoVazio,
  MensagemErro,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { PropsTela } from '../../navigation/types';
import { cores, espacamento, raio, tipografia } from '../../theme';

export function CheckOutsScreen({
  navigation,
}: PropsTela<'CheckOuts'>): React.ReactElement {
  const tablero = useRequisicao(() => checkoutsService.tablero(), []);

  const comAvaria = (tablero.dados?.checkouts ?? []).filter(
    (c) => c.abertos > 0,
  ).length;

  return (
    <Tela aoAtualizar={tablero.recarregar} atualizando={tablero.atualizando}>
      <Aviso
        texto={
          comAvaria > 0
            ? `${comAvaria} check-out(s) com avaria aberta. Toque numa caixa para ver ou reportar.`
            : 'Toque numa caixa para reportar um equipamento com defeito (CPU, teclado, scanner, pinpad, monitor e mais).'
        }
        tom={comAvaria > 0 ? 'alerta' : 'info'}
      />

      {tablero.carregando ? (
        <Carregando />
      ) : tablero.erro ? (
        <MensagemErro mensagem={tablero.erro} aoTentarNovamente={tablero.recarregar} />
      ) : !tablero.dados || tablero.dados.checkouts.length === 0 ? (
        <EstadoVazio icone="desktop-outline" titulo="Nenhum check-out configurado" />
      ) : (
        <View style={styles.grade}>
          {tablero.dados.checkouts.map((c) => {
            const temAvaria = c.abertos > 0;
            return (
              <TouchableOpacity
                key={c.numero}
                activeOpacity={0.7}
                onPress={() =>
                  navigation.navigate('CheckOutDetalhe', { numero: c.numero })
                }
                style={[styles.caixa, temAvaria ? styles.caixaAvaria : styles.caixaOk]}
              >
                <Text
                  style={[
                    styles.numero,
                    temAvaria ? styles.textoAvaria : styles.textoOk,
                  ]}
                >
                  {c.numero}
                </Text>
                {temAvaria ? (
                  <View style={styles.selo}>
                    <Ionicons name="alert" size={12} color={cores.textoInverso} />
                    <Text style={styles.seloTexto}>{c.abertos}</Text>
                  </View>
                ) : (
                  <Ionicons name="checkmark" size={14} color={cores.verde} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  grade: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.sm,
  },
  caixa: {
    width: 64,
    height: 64,
    borderRadius: raio.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    gap: 2,
  },
  caixaOk: {
    backgroundColor: cores.superficie,
    borderColor: cores.divisor,
  },
  caixaAvaria: {
    backgroundColor: cores.vermelhoFundo,
    borderColor: cores.vermelho,
  },
  numero: { ...tipografia.subtitulo, fontWeight: '700' },
  textoOk: { color: cores.texto },
  textoAvaria: { color: cores.vermelho },
  selo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: cores.vermelho,
    borderRadius: raio.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  seloTexto: {
    ...tipografia.legenda,
    color: cores.textoInverso,
    fontWeight: '700',
  },
});

export default CheckOutsScreen;
