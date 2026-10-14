/**
 * Modal de edição de uma rodada de feedforward já registrada: data da
 * conversa, nota de evolução, textos e **novos pontos a melhorar**.
 *
 * Os pontos existentes são geridos um a um pelo modal do ponto (revisar,
 * prorrogar, editar descrição ou remover). Aqui só se acrescentam pontos.
 * Texto apagado limpa o campo; a nota pode ser removida.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { feedforwardService } from '../../api/services';
import { RodadaFeedforward } from '../../api/types';
import { Botao, CampoTexto, SeletorData } from '../../components';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { notificar } from '../../utils/dialogos';
import { hojeISO } from '../../utils/formato';
import { Estrelas } from './EstrelasFeedforward';
import { somarDiasISO } from './ModalRevisarPonto';

interface PontoNovo {
  descricao: string;
  prazo: string;
}

export function ModalEditarRodada({
  rodada,
  aoFechar,
  aoSalvo,
}: {
  rodada: RodadaFeedforward;
  aoFechar: () => void;
  aoSalvo: () => void;
}): React.ReactElement {
  const [data, setData] = useState(rodada.data.slice(0, 10));
  const [nota, setNota] = useState<number | null>(rodada.evolucaoNota);
  const [pontosFortes, setPontosFortes] = useState(rodada.pontosFortes ?? '');
  const [oportunidades, setOportunidades] = useState(rodada.oportunidades ?? '');
  const [compromissoFinal, setCompromissoFinal] = useState(
    rodada.compromissoFinal ?? '',
  );
  const [novos, setNovos] = useState<PontoNovo[]>([]);
  const [ocupado, setOcupado] = useState(false);

  const atualizarNovo = (i: number, patch: Partial<PontoNovo>): void => {
    setNovos((atual) => atual.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  };

  const salvar = async (): Promise<void> => {
    const validos = novos.filter((p) => p.descricao.trim().length >= 2);
    setOcupado(true);
    try {
      await feedforwardService.editar(rodada.id, {
        data,
        evolucaoNota: nota,
        pontosFortes: pontosFortes.trim(),
        oportunidades: oportunidades.trim(),
        compromissoFinal: compromissoFinal.trim(),
      });
      for (const p of validos) {
        await feedforwardService.adicionarPonto(rodada.id, {
          descricao: p.descricao.trim(),
          prazo: p.prazo,
        });
      }
      notificar('Feedforward atualizado', 'As alterações foram salvas.');
      aoSalvo();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao salvar.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={aoFechar}>
      <View style={styles.fundo}>
        <View style={styles.cartao}>
          <View style={styles.cabecalho}>
            <Text style={styles.titulo}>Editar rodada</Text>
            <Pressable
              onPress={aoFechar}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Fechar"
            >
              <Ionicons name="close" size={22} color={cores.textoSecundario} />
            </Pressable>
          </View>

          <ScrollView style={styles.corpo} keyboardShouldPersistTaps="handled">
            <SeletorData valor={data} aoMudar={setData} rotulo="Data da conversa" />

            <Text style={styles.rotulo}>Nota de evolução (1–5)</Text>
            <View style={styles.notaLinha}>
              <Estrelas nota={nota} aoMudar={setNota} />
              {nota != null ? (
                <Pressable onPress={() => setNota(null)} hitSlop={6}>
                  <Text style={styles.link}>Sem nota</Text>
                </Pressable>
              ) : null}
            </View>

            <CampoTexto
              rotulo="Pontos fortes observados"
              value={pontosFortes}
              onChangeText={setPontosFortes}
              multiline
              maxLength={1000}
            />
            <CampoTexto
              rotulo="Oportunidades de desenvolvimento"
              value={oportunidades}
              onChangeText={setOportunidades}
              multiline
              maxLength={1000}
            />
            <CampoTexto
              rotulo="Compromisso final"
              value={compromissoFinal}
              onChangeText={setCompromissoFinal}
              multiline
              maxLength={1000}
            />

            <Text style={styles.rotulo}>Novos pontos a melhorar</Text>
            <Text style={styles.ajuda}>
              Os pontos já existentes são revisados, prorrogados ou editados
              tocando neles na rodada.
            </Text>
            {novos.map((p, i) => (
              <View key={i} style={styles.pontoEditor}>
                <CampoTexto
                  rotulo={`Novo ponto ${i + 1}`}
                  value={p.descricao}
                  onChangeText={(t) => atualizarNovo(i, { descricao: t })}
                  maxLength={300}
                  placeholder="O que precisa melhorar…"
                />
                <SeletorData
                  valor={p.prazo}
                  aoMudar={(iso) => atualizarNovo(i, { prazo: iso })}
                  rotulo="Prazo"
                  dataMinima={hojeISO()}
                />
                <Pressable
                  style={styles.removerLinha}
                  onPress={() =>
                    setNovos((atual) => atual.filter((_, idx) => idx !== i))
                  }
                >
                  <Ionicons name="trash-outline" size={16} color={cores.vermelho} />
                  <Text style={styles.removerTexto}>Descartar</Text>
                </Pressable>
              </View>
            ))}
            <Pressable
              style={styles.adicionar}
              onPress={() =>
                setNovos((atual) => [
                  ...atual,
                  { descricao: '', prazo: somarDiasISO(hojeISO(), 30) },
                ])
              }
            >
              <Ionicons name="add-circle-outline" size={18} color={cores.primaria} />
              <Text style={styles.link}>Adicionar ponto</Text>
            </Pressable>
          </ScrollView>

          <View style={styles.rodape}>
            <Botao
              titulo="Cancelar"
              variante="secundario"
              aoPressionar={aoFechar}
              estilo={styles.botaoFlex}
            />
            <Botao
              titulo="Salvar alterações"
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
    maxHeight: '90%',
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
  corpo: { paddingHorizontal: espacamento.md },
  rotulo: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
    marginTop: espacamento.md,
    marginBottom: espacamento.xs,
  },
  ajuda: { ...tipografia.legenda, color: cores.textoSecundario, marginBottom: espacamento.xs },
  notaLinha: { flexDirection: 'row', alignItems: 'center', gap: espacamento.md },
  link: { ...tipografia.rotulo, color: cores.primaria, fontWeight: '600' },
  pontoEditor: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: cores.divisor,
    borderRadius: raio.md,
    padding: espacamento.sm,
    marginBottom: espacamento.sm,
    gap: espacamento.xs,
  },
  removerLinha: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  removerTexto: { ...tipografia.legenda, color: cores.vermelho },
  adicionar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    paddingVertical: espacamento.sm,
    marginBottom: espacamento.md,
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
