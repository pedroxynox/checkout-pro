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

/** Rótulos amigáveis dos equipamentos (para o resumo da card). */
const ROTULO_EQUIPAMENTO: Record<string, string> = {
  CPU: 'CPU',
  TECLADO: 'Teclado',
  SCANNER: 'Scanner',
  PINPAD: 'Pinpad',
  MONITOR: 'Monitor',
  IMPRESSORA: 'Impressora',
  GAVETA: 'Gaveta',
  BALANCA: 'Balança',
  OUTRO: 'Outro',
};

/** "PDV 01", "PDV 02"... (número com dois dígitos para alinhar as cards). */
function rotuloPdv(numero: number): string {
  return `PDV ${String(numero).padStart(2, '0')}`;
}

export function CheckOutsScreen({
  navigation,
}: PropsTela<'CheckOuts'>): React.ReactElement {
  const tablero = useRequisicao(() => checkoutsService.tablero(), []);

  const checkouts = tablero.dados?.checkouts ?? [];
  const comAvaria = checkouts.filter((c) => c.abertos > 0).length;
  // Ordena para destacar os problemas: primeiro os PDVs com avaria aberta
  // (mais avarias antes); os demais seguem em ordem numérica.
  const checkoutsOrdenados = [...checkouts].sort((a, b) => {
    const prioridadeA = a.abertos > 0 ? 0 : 1;
    const prioridadeB = b.abertos > 0 ? 0 : 1;
    if (prioridadeA !== prioridadeB) return prioridadeA - prioridadeB;
    if (a.abertos !== b.abertos) return b.abertos - a.abertos;
    return a.numero - b.numero;
  });

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
          {checkoutsOrdenados.map((c) => {
            const temAvaria = c.abertos > 0;
            const equipamentos = (c.equipamentos ?? [])
              .map((e) => ROTULO_EQUIPAMENTO[e] ?? e)
              .join(' · ');
            return (
              <TouchableOpacity
                key={c.numero}
                activeOpacity={0.7}
                onPress={() =>
                  navigation.navigate('CheckOutDetalhe', { numero: c.numero })
                }
                style={[styles.caixa, temAvaria ? styles.caixaAvaria : styles.caixaOk]}
              >
                <View style={styles.caixaTopo}>
                  <Text style={styles.pdv}>{rotuloPdv(c.numero)}</Text>
                  {temAvaria ? (
                    <View style={styles.selo}>
                      <Ionicons name="alert" size={12} color={cores.textoInverso} />
                      <Text style={styles.seloTexto}>{c.abertos}</Text>
                    </View>
                  ) : (
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={cores.verde}
                    />
                  )}
                </View>

                <Text
                  style={[
                    styles.status,
                    temAvaria ? styles.statusAvaria : styles.statusOk,
                  ]}
                >
                  {temAvaria
                    ? `${c.abertos} ${c.abertos > 1 ? 'avarias abertas' : 'avaria aberta'}`
                    : 'Sem problemas'}
                </Text>

                {equipamentos ? (
                  <Text style={styles.equipamentos} numberOfLines={2}>
                    {equipamentos}
                  </Text>
                ) : null}

                {c.recorrente ? (
                  <View style={styles.recorrente}>
                    <Ionicons name="repeat" size={12} color={cores.amarelo} />
                    <Text style={styles.recorrenteTexto}>Falha recorrente</Text>
                  </View>
                ) : null}
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
    justifyContent: 'space-between',
    rowGap: espacamento.sm,
  },
  caixa: {
    // Duas cards por linha (PDV 01 | PDV 02, e abaixo PDV 03 | PDV 04).
    width: '48%',
    minHeight: 88,
    borderRadius: raio.md,
    borderWidth: 1,
    padding: espacamento.md,
    gap: espacamento.xs,
  },
  caixaOk: {
    backgroundColor: cores.superficie,
    borderColor: cores.divisor,
  },
  caixaAvaria: {
    backgroundColor: cores.vermelhoFundo,
    borderColor: cores.vermelho,
  },
  caixaTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pdv: { ...tipografia.subtitulo, color: cores.texto },
  status: { ...tipografia.rotulo },
  statusOk: { color: cores.verde },
  statusAvaria: { color: cores.vermelho },
  equipamentos: { ...tipografia.legenda, color: cores.textoSecundario },
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
  recorrente: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  recorrenteTexto: {
    ...tipografia.legenda,
    color: cores.amarelo,
    fontWeight: '700',
  },
});

export default CheckOutsScreen;
