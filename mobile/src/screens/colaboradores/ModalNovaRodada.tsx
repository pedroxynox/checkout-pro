/**
 * Modal de criação de uma rodada de feedforward: data da conversa, perguntas
 * de referência (respondidas no papel), nota, textos, pontos a melhorar com
 * prazo ("em X dias/semanas/meses" ou data exata) e a foto do formulário.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ApiError } from '../../api/client';
import { feedforwardService } from '../../api/services';
import { ImagemSelecionada } from '../../api/services/checklist';
import { PontoNovoFeedforward } from '../../api/services/feedforward';
import { Botao, CampoTexto, SeletorData } from '../../components';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { notificar } from '../../utils/dialogos';
import { formatarData, hojeISO } from '../../utils/formato';
import { PERGUNTAS_FEEDFORWARD } from '../../utils/relatorioFeedforward';
import { Estrelas } from './EstrelasFeedforward';
import {
  PontoRascunho,
  UnidadePrazo,
  calcularPrazoISO,
  pontoVazio,
  selecionarImagem,
} from './feedforwardApoio';

/** Modal de criação de uma rodada de feedforward. */
export function ModalNovaRodada({
  colaboradorId,
  aoFechar,
  aoRegistrado,
}: {
  colaboradorId: string;
  aoFechar: () => void;
  aoRegistrado: () => void;
}): React.ReactElement {
  const [data, setData] = useState(hojeISO());
  const [pontosFortes, setPontosFortes] = useState('');
  const [oportunidades, setOportunidades] = useState('');
  const [compromissoFinal, setCompromissoFinal] = useState('');
  const [nota, setNota] = useState<number | null>(null);
  const [pontos, setPontos] = useState<PontoRascunho[]>([pontoVazio()]);
  const [foto, setFoto] = useState<ImagemSelecionada | null>(null);
  const [verPerguntas, setVerPerguntas] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const pontosValidos = useMemo(
    () => pontos.filter((p) => p.descricao.trim().length >= 2),
    [pontos],
  );

  const atualizarPonto = (i: number, patch: Partial<PontoRascunho>): void => {
    setPontos((atual) =>
      atual.map((p, idx) => (idx === i ? { ...p, ...patch } : p)),
    );
  };

  const escolherFoto = async (origem: 'camera' | 'galeria'): Promise<void> => {
    const imagem = await selecionarImagem(origem);
    if (imagem) setFoto(imagem);
  };

  const registrar = async (): Promise<void> => {
    setOcupado(true);
    try {
      const pontosEnvio: PontoNovoFeedforward[] = pontosValidos.map((p) => ({
        descricao: p.descricao.trim(),
        prazo: calcularPrazoISO(p),
      }));
      const rodada = await feedforwardService.criar({
        colaboradorId,
        data,
        pontosFortes: pontosFortes.trim() || undefined,
        oportunidades: oportunidades.trim() || undefined,
        compromissoFinal: compromissoFinal.trim() || undefined,
        evolucaoNota: nota ?? undefined,
        pontos: pontosEnvio,
      });
      if (foto) {
        try {
          await feedforwardService.enviarFoto(rodada.id, foto);
        } catch {
          notificar(
            'Atenção',
            'A rodada foi salva, mas a foto não pôde ser enviada. Reenvie-a pela opção "Tirar foto" ou "Da galeria" na própria rodada.',
          );
        }
      }
      notificar('Feedforward registrado', 'A rodada foi salva com sucesso.');
      aoRegistrado();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao registrar.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={aoFechar}>
      <View style={styles.fundo}>
        <View style={styles.cartaoModal}>
          <View style={styles.cabecalhoModal}>
            <Text style={styles.tituloModal}>Nova rodada de feedforward</Text>
            <Pressable onPress={aoFechar} hitSlop={8}>
              <Ionicons name="close" size={22} color={cores.textoSecundario} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.corpoModal}
            keyboardShouldPersistTaps="handled"
          >
            <SeletorData valor={data} aoMudar={setData} rotulo="Data da conversa" />

            {/* Perguntas de referência (o colaborador responde no papel) */}
            <Pressable
              style={styles.refCabecalho}
              onPress={() => setVerPerguntas((v) => !v)}
            >
              <Ionicons
                name={verPerguntas ? 'chevron-down' : 'chevron-forward'}
                size={16}
                color={cores.primaria}
              />
              <Text style={styles.refTitulo}>
                Perguntas do formulário (referência)
              </Text>
            </Pressable>
            {verPerguntas &&
              PERGUNTAS_FEEDFORWARD.map((g) => (
                <View key={g.secao} style={styles.refGrupo}>
                  <Text style={styles.refSecao}>{g.secao}</Text>
                  {g.itens.map((q, i) => (
                    <Text key={i} style={styles.refItem}>
                      • {q}
                    </Text>
                  ))}
                </View>
              ))}

            <Text style={styles.rotuloCampo}>Nota de evolução (1–5)</Text>
            <Estrelas nota={nota} aoMudar={setNota} />

            <CampoTexto
              rotulo="Pontos fortes observados"
              value={pontosFortes}
              onChangeText={setPontosFortes}
              multiline
              placeholder="O que o colaborador faz bem…"
            />
            <CampoTexto
              rotulo="Oportunidades de desenvolvimento"
              value={oportunidades}
              onChangeText={setOportunidades}
              multiline
              placeholder="No que pode melhorar…"
            />

            <Text style={styles.rotuloCampo}>Pontos a melhorar (com prazo)</Text>
            {pontos.map((p, i) => (
              <View key={i} style={styles.pontoEditor}>
                <CampoTexto
                  rotulo={`Ponto ${i + 1}`}
                  value={p.descricao}
                  onChangeText={(t) => atualizarPonto(i, { descricao: t })}
                  placeholder="O que precisa melhorar…"
                />
                <View style={styles.modoLinha}>
                  <Pressable
                    style={[
                      styles.chip,
                      p.modo === 'EM_X' && styles.chipAtivo,
                    ]}
                    onPress={() => atualizarPonto(i, { modo: 'EM_X' })}
                  >
                    <Text
                      style={[
                        styles.chipTexto,
                        p.modo === 'EM_X' && styles.chipTextoAtivo,
                      ]}
                    >
                      Em…
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.chip,
                      p.modo === 'DATA' && styles.chipAtivo,
                    ]}
                    onPress={() => atualizarPonto(i, { modo: 'DATA' })}
                  >
                    <Text
                      style={[
                        styles.chipTexto,
                        p.modo === 'DATA' && styles.chipTextoAtivo,
                      ]}
                    >
                      Data exata
                    </Text>
                  </Pressable>
                </View>

                {p.modo === 'EM_X' ? (
                  <View style={styles.emXLinha}>
                    <View style={styles.campoQtd}>
                      <CampoTexto
                        rotulo="Quantidade"
                        value={p.quantidade}
                        onChangeText={(t) =>
                          atualizarPonto(i, {
                            quantidade: t.replace(/[^0-9]/g, ''),
                          })
                        }
                        keyboardType="number-pad"
                      />
                    </View>
                    <View style={styles.unidades}>
                      {(['dias', 'semanas', 'meses'] as UnidadePrazo[]).map(
                        (u) => (
                          <Pressable
                            key={u}
                            style={[
                              styles.chip,
                              p.unidade === u && styles.chipAtivo,
                            ]}
                            onPress={() => atualizarPonto(i, { unidade: u })}
                          >
                            <Text
                              style={[
                                styles.chipTexto,
                                p.unidade === u && styles.chipTextoAtivo,
                              ]}
                            >
                              {u}
                            </Text>
                          </Pressable>
                        ),
                      )}
                    </View>
                  </View>
                ) : (
                  <SeletorData
                    valor={p.dataISO}
                    aoMudar={(iso) => atualizarPonto(i, { dataISO: iso })}
                    rotulo="Prazo"
                    dataMinima={hojeISO()}
                  />
                )}

                <Text style={styles.prazoPrevisto}>
                  Vence em {formatarData(calcularPrazoISO(p))}
                </Text>

                {pontos.length > 1 && (
                  <Pressable
                    style={styles.removerPonto}
                    onPress={() =>
                      setPontos((atual) => atual.filter((_, idx) => idx !== i))
                    }
                  >
                    <Ionicons name="trash-outline" size={16} color={cores.vermelho} />
                    <Text style={styles.removerPontoTexto}>Remover ponto</Text>
                  </Pressable>
                )}
              </View>
            ))}
            <Pressable
              style={styles.adicionarPonto}
              onPress={() => setPontos((atual) => [...atual, pontoVazio()])}
            >
              <Ionicons name="add-circle-outline" size={18} color={cores.primaria} />
              <Text style={styles.adicionarPontoTexto}>Adicionar ponto</Text>
            </Pressable>

            <CampoTexto
              rotulo="Compromisso final (opcional)"
              value={compromissoFinal}
              onChangeText={setCompromissoFinal}
              multiline
              placeholder="A principal atitude a colocar em prática…"
            />

            {/* Foto do formulário */}
            <Text style={styles.rotuloCampo}>Foto do formulário</Text>
            {foto ? (
              <Image
                source={{ uri: foto.uri }}
                style={styles.fotoPrevia}
                resizeMode="cover"
              />
            ) : null}
            <View style={styles.fotoBotoes}>
              <Botao
                titulo={foto ? 'Trocar (foto)' : 'Tirar foto'}
                variante="secundario"
                aoPressionar={() => void escolherFoto('camera')}
                estilo={styles.botaoFlex}
              />
              <Botao
                titulo="Da galeria"
                variante="secundario"
                aoPressionar={() => void escolherFoto('galeria')}
                estilo={styles.botaoFlex}
              />
            </View>
          </ScrollView>

          <View style={styles.rodapeModal}>
            <Botao
              titulo="Salvar feedforward"
              aoPressionar={() => void registrar()}
              carregando={ocupado}
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
  cartaoModal: {
    backgroundColor: cores.superficie,
    borderRadius: raio.lg,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  cabecalhoModal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: espacamento.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  tituloModal: { ...tipografia.subtitulo, color: cores.texto },
  corpoModal: { paddingHorizontal: espacamento.md },
  rodapeModal: {
    padding: espacamento.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
  },
  rotuloCampo: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
    marginTop: espacamento.md,
    marginBottom: espacamento.xs,
  },
  refCabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    marginTop: espacamento.md,
  },
  refTitulo: { ...tipografia.rotulo, color: cores.primaria, fontWeight: '600' },
  refGrupo: { marginTop: espacamento.xs, paddingLeft: espacamento.sm },
  refSecao: {
    ...tipografia.legenda,
    fontWeight: '700',
    color: cores.textoSecundario,
    marginTop: espacamento.xs,
  },
  refItem: { ...tipografia.legenda, color: cores.textoSecundario },
  pontoEditor: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: cores.divisor,
    borderRadius: raio.md,
    padding: espacamento.sm,
    marginBottom: espacamento.sm,
    gap: espacamento.xs,
  },
  modoLinha: { flexDirection: 'row', gap: espacamento.xs },
  emXLinha: {
    flexDirection: 'row',
    gap: espacamento.sm,
    alignItems: 'flex-end',
  },
  campoQtd: { width: 90 },
  unidades: { flexDirection: 'row', gap: espacamento.xs, flex: 1, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: espacamento.sm,
    paddingVertical: 6,
    borderRadius: raio.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: cores.divisor,
    backgroundColor: cores.fundo,
  },
  chipAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  chipTexto: { ...tipografia.legenda, color: cores.texto },
  chipTextoAtivo: { color: cores.textoInverso, fontWeight: '700' },
  prazoPrevisto: {
    ...tipografia.legenda,
    color: cores.primaria,
    fontWeight: '600',
  },
  removerPonto: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  removerPontoTexto: { ...tipografia.legenda, color: cores.vermelho },
  adicionarPonto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    paddingVertical: espacamento.sm,
  },
  adicionarPontoTexto: { ...tipografia.rotulo, color: cores.primaria, fontWeight: '600' },
  fotoPrevia: {
    width: '100%',
    height: 160,
    borderRadius: raio.md,
    marginBottom: espacamento.sm,
    backgroundColor: cores.divisor,
  },
  fotoBotoes: { flexDirection: 'row', gap: espacamento.sm },
  botaoFlex: { flex: 1 },
});
