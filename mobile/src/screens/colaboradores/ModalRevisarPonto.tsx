/**
 * Modal de revisão de um ponto a melhorar do feedforward.
 *
 * Substitui o antigo `Alert.alert` (que não funciona no navegador): o líder
 * escolhe "Atingido" ou "Não atingido" e pode registrar uma observação, que
 * fica guardada na auditoria do ponto (quem revisou, quando e por quê).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { feedforwardService } from '../../api/services';
import { PontoFeedforward } from '../../api/types';
import { Botao, CampoTexto, Segmentado } from '../../components';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { notificar } from '../../utils/dialogos';
import { formatarData } from '../../utils/formato';

type StatusRevisao = 'ATINGIDO' | 'NAO_ATINGIDO';

export function ModalRevisarPonto({
  ponto,
  aoFechar,
  aoRevisado,
}: {
  ponto: PontoFeedforward;
  aoFechar: () => void;
  aoRevisado: () => void;
}): React.ReactElement {
  const [status, setStatus] = useState<StatusRevisao>('ATINGIDO');
  const [observacao, setObservacao] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const salvar = async (): Promise<void> => {
    setOcupado(true);
    try {
      await feedforwardService.revisarPonto(
        ponto.id,
        status,
        observacao.trim() || undefined,
      );
      aoRevisado();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao revisar.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={aoFechar}>
      <View style={styles.fundo}>
        <View style={styles.cartao}>
          <View style={styles.cabecalho}>
            <Text style={styles.titulo}>Revisar ponto</Text>
            <Pressable
              onPress={aoFechar}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Fechar"
            >
              <Ionicons name="close" size={22} color={cores.textoSecundario} />
            </Pressable>
          </View>

          <View style={styles.corpo}>
            <Text style={styles.descricao}>{ponto.descricao}</Text>
            <Text style={styles.prazo}>Prazo {formatarData(ponto.prazo)}</Text>

            <Text style={styles.rotulo}>Resultado</Text>
            <Segmentado<StatusRevisao>
              opcoes={[
                { valor: 'ATINGIDO', rotulo: 'Atingido' },
                { valor: 'NAO_ATINGIDO', rotulo: 'Não atingido' },
              ]}
              selecionado={status}
              aoSelecionar={setStatus}
            />

            <CampoTexto
              rotulo="Observação (opcional)"
              value={observacao}
              onChangeText={setObservacao}
              multiline
              maxLength={500}
              placeholder="Como foi a evolução neste ponto…"
            />
          </View>

          <View style={styles.rodape}>
            <Botao
              titulo="Cancelar"
              variante="secundario"
              aoPressionar={aoFechar}
              estilo={styles.botaoFlex}
            />
            <Botao
              titulo="Salvar revisão"
              aoPressionar={() => void salvar()}
              carregando={ocupado}
              estilo={styles.botaoFlex}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fundo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: espacamento.md,
  },
  cartao: {
    backgroundColor: cores.superficie,
    borderRadius: raio.lg,
    overflow: 'hidden',
  },
  cabecalho: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: espacamento.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  titulo: { ...tipografia.subtitulo, color: cores.texto },
  corpo: { padding: espacamento.md, gap: espacamento.xs },
  descricao: { ...tipografia.corpo, color: cores.texto, fontWeight: '600' },
  prazo: { ...tipografia.legenda, color: cores.textoSecundario },
  rotulo: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
    marginTop: espacamento.md,
    marginBottom: espacamento.xs,
  },
  rodape: {
    flexDirection: 'row',
    gap: espacamento.sm,
    padding: espacamento.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
  },
  botaoFlex: { flex: 1 },
});
