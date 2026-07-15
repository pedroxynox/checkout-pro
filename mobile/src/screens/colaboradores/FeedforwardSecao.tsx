/**
 * Seção "Feedforward" do perfil do colaborador.
 *
 * O colaborador preenche o formulário de feedforward em PAPEL (autoavaliação e
 * metas). O líder tira uma FOTO do formulário e registra aqui só o essencial
 * para dar seguimento: pontos fortes, oportunidades, nota de evolução (1–5) e
 * os PONTOS A MELHORAR, cada um com um PRAZO (data exata ou "em X dias/semanas/
 * meses"). Ao vencer o prazo, supervisores e gerentes são avisados.
 *
 * Visível a quem tem `FEEDFORWARD_VISUALIZAR`; criar/revisar exige
 * `FEEDFORWARD_GERIR` (supervisor e gerente).
 */
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ApiError } from '../../api/client';
import { API_BASE_URL } from '../../api/config';
import { feedforwardService } from '../../api/services';
import { ImagemSelecionada } from '../../api/services/checklist';
import { PontoNovoFeedforward } from '../../api/services/feedforward';
import {
  PontoFeedforward,
  RodadaFeedforward,
  SituacaoPontoFeedforward,
} from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import {
  Botao,
  CampoTexto,
  Carregando,
  Cartao,
  MensagemErro,
  SeletorData,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { notificar } from '../../utils/dialogos';
import { formatarData, hojeISO } from '../../utils/formato';

/** Perguntas do formulário (referência para guiar a conversa — não editáveis). */
const PERGUNTAS_REFERENCIA: { secao: string; itens: string[] }[] = [
  {
    secao: '1. Autoavaliação',
    itens: [
      'Qual foi sua principal conquista desde nossa última conversa?',
      'Qual comportamento seu mais contribuiu para esse resultado?',
      'Qual é seu maior desafio hoje?',
      'O que depende exclusivamente de você para superar esse desafio?',
    ],
  },
  {
    secao: '2. Olhando para o futuro',
    itens: [
      'Como você deseja ser reconhecido pela equipe nos próximos 90 dias?',
      'Qual hábito você precisa desenvolver para alcançar esse objetivo?',
      'Qual hábito você precisa reduzir ou eliminar?',
    ],
  },
  {
    secao: '3. Cliente e equipe',
    itens: [
      'O que você pode fazer para proporcionar uma experiência ainda melhor aos clientes?',
      'Como você pode contribuir mais com seus colegas de trabalho?',
    ],
  },
];

const COR_SITUACAO: Record<SituacaoPontoFeedforward, string> = {
  EM_DIA: cores.verde,
  PROXIMO: cores.amarelo,
  VENCIDO: cores.vermelho,
  ATINGIDO: cores.verde,
  NAO_ATINGIDO: cores.vermelho,
};
const ROTULO_SITUACAO: Record<SituacaoPontoFeedforward, string> = {
  EM_DIA: 'No prazo',
  PROXIMO: 'Vence em breve',
  VENCIDO: 'Prazo vencido',
  ATINGIDO: 'Atingido',
  NAO_ATINGIDO: 'Não atingido',
};

type UnidadePrazo = 'dias' | 'semanas' | 'meses';

/** Rascunho de um ponto a melhorar no formulário de criação. */
interface PontoRascunho {
  descricao: string;
  modo: 'DATA' | 'EM_X';
  dataISO: string;
  quantidade: string;
  unidade: UnidadePrazo;
}

function pontoVazio(): PontoRascunho {
  return {
    descricao: '',
    modo: 'EM_X',
    dataISO: hojeISO(),
    quantidade: '30',
    unidade: 'dias',
  };
}

/** Calcula o prazo (ISO yyyy-mm-dd) de um rascunho de ponto. */
function calcularPrazoISO(p: PontoRascunho): string {
  if (p.modo === 'DATA') return p.dataISO;
  const n = Math.max(1, Math.round(Number(p.quantidade) || 0));
  const base = new Date(`${hojeISO()}T00:00:00.000Z`);
  if (p.unidade === 'dias') base.setUTCDate(base.getUTCDate() + n);
  else if (p.unidade === 'semanas') base.setUTCDate(base.getUTCDate() + 7 * n);
  else base.setUTCMonth(base.getUTCMonth() + n);
  return base.toISOString().slice(0, 10);
}

function urlFoto(caminho: string): string {
  return `${API_BASE_URL.replace(/\/$/, '')}${caminho}`;
}

/** Estrelas 1–5 (leitura ou edição). */
function Estrelas({
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
          <Pressable key={n} onPress={() => aoMudar(n)} hitSlop={6}>
            {estrela}
          </Pressable>
        ) : (
          <View key={n}>{estrela}</View>
        );
      })}
    </View>
  );
}

export function FeedforwardSecao({
  colaboradorId,
}: {
  colaboradorId: string;
}): React.ReactElement | null {
  const { podeAcessar } = useAuth();
  const podeVer = podeAcessar('FEEDFORWARD_VISUALIZAR');
  const podeGerir = podeAcessar('FEEDFORWARD_GERIR');

  const req = useRequisicao<RodadaFeedforward[]>(
    () => (podeVer ? feedforwardService.doColaborador(colaboradorId) : Promise.resolve([])),
    [colaboradorId, podeVer],
  );

  const [modalAberto, setModalAberto] = useState(false);
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);

  if (!podeVer) return null;

  const rodadas = req.dados ?? [];

  const revisarPonto = (ponto: PontoFeedforward): void => {
    if (!podeGerir || ponto.status !== 'PENDENTE') return;
    Alert.alert(
      'Revisar ponto',
      ponto.descricao,
      [
        {
          text: 'Atingido',
          onPress: () => void aplicarRevisao(ponto.id, 'ATINGIDO'),
        },
        {
          text: 'Não atingido',
          onPress: () => void aplicarRevisao(ponto.id, 'NAO_ATINGIDO'),
        },
        { text: 'Cancelar', style: 'cancel' },
      ],
      { cancelable: true },
    );
  };

  const aplicarRevisao = async (
    pontoId: string,
    status: 'ATINGIDO' | 'NAO_ATINGIDO',
  ): Promise<void> => {
    try {
      await feedforwardService.revisarPonto(pontoId, status);
      req.recarregar();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao revisar.');
    }
  };

  return (
    <Cartao titulo="Feedforward">
      {podeGerir && (
        <Botao
          titulo="Nova rodada de feedforward"
          aoPressionar={() => setModalAberto(true)}
          estilo={styles.botaoNovo}
        />
      )}

      {req.carregando ? (
        <Carregando />
      ) : req.erro ? (
        <MensagemErro mensagem={req.erro} aoTentarNovamente={req.recarregar} />
      ) : rodadas.length === 0 ? (
        <Text style={styles.vazio}>
          Ainda não há feedforward registrado para este colaborador.
        </Text>
      ) : (
        rodadas.map((r) => (
          <View key={r.id} style={styles.rodada}>
            <View style={styles.rodadaTopo}>
              <Text style={styles.rodadaData}>{formatarData(r.data)}</Text>
              {r.evolucaoNota != null && <Estrelas nota={r.evolucaoNota} />}
            </View>
            {r.liderNome ? (
              <Text style={styles.rodadaLider}>Líder: {r.liderNome}</Text>
            ) : null}

            {r.fotoUrl ? (
              <Pressable
                style={styles.fotoWrap}
                onPress={() => setFotoAmpliada(urlFoto(r.fotoUrl as string))}
                accessibilityRole="imagebutton"
                accessibilityLabel="Ampliar a foto do formulário"
              >
                <Image
                  source={{ uri: urlFoto(r.fotoUrl) }}
                  style={styles.foto}
                  resizeMode="cover"
                />
                <View style={styles.ampliarSelo}>
                  <Ionicons name="expand-outline" size={13} color={cores.textoInverso} />
                  <Text style={styles.ampliarSeloTexto}>Toque para ampliar</Text>
                </View>
              </Pressable>
            ) : null}

            {r.pontosFortes ? (
              <View style={styles.bloco}>
                <Text style={styles.blocoTitulo}>Pontos fortes</Text>
                <Text style={styles.blocoTexto}>{r.pontosFortes}</Text>
              </View>
            ) : null}
            {r.oportunidades ? (
              <View style={styles.bloco}>
                <Text style={styles.blocoTitulo}>Oportunidades de desenvolvimento</Text>
                <Text style={styles.blocoTexto}>{r.oportunidades}</Text>
              </View>
            ) : null}

            {r.pontos.length > 0 && (
              <View style={styles.bloco}>
                <Text style={styles.blocoTitulo}>Pontos a melhorar (com prazo)</Text>
                {r.pontos.map((p) => (
                  <Pressable
                    key={p.id}
                    style={styles.ponto}
                    disabled={!podeGerir || p.status !== 'PENDENTE'}
                    onPress={() => revisarPonto(p)}
                  >
                    <View
                      style={[
                        styles.pontoBolinha,
                        { backgroundColor: COR_SITUACAO[p.situacao] },
                      ]}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pontoDescricao}>{p.descricao}</Text>
                      <Text style={styles.pontoMeta}>
                        Prazo {formatarData(p.prazo)} ·{' '}
                        <Text style={{ color: COR_SITUACAO[p.situacao] }}>
                          {ROTULO_SITUACAO[p.situacao]}
                        </Text>
                      </Text>
                    </View>
                    {podeGerir && p.status === 'PENDENTE' ? (
                      <Ionicons
                        name="ellipsis-vertical"
                        size={16}
                        color={cores.textoSecundario}
                      />
                    ) : null}
                  </Pressable>
                ))}
              </View>
            )}

            {r.compromissoFinal ? (
              <View style={styles.bloco}>
                <Text style={styles.blocoTitulo}>Compromisso final</Text>
                <Text style={styles.blocoTexto}>{r.compromissoFinal}</Text>
              </View>
            ) : null}
          </View>
        ))
      )}

      {/* Visualizador da foto em tela cheia */}
      <Modal
        visible={fotoAmpliada != null}
        transparent
        animationType="fade"
        onRequestClose={() => setFotoAmpliada(null)}
      >
        <Pressable style={styles.visor} onPress={() => setFotoAmpliada(null)}>
          {fotoAmpliada ? (
            <Image
              source={{ uri: fotoAmpliada }}
              style={styles.visorImg}
              resizeMode="contain"
            />
          ) : null}
        </Pressable>
      </Modal>

      {modalAberto && (
        <ModalNovaRodada
          colaboradorId={colaboradorId}
          aoFechar={() => setModalAberto(false)}
          aoRegistrado={() => {
            setModalAberto(false);
            req.recarregar();
          }}
        />
      )}
    </Cartao>
  );
}

/** Modal de criação de uma rodada de feedforward. */
function ModalNovaRodada({
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
    const permissao =
      origem === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) {
      notificar('Permissão necessária', 'Conceda o acesso para anexar a foto.');
      return;
    }
    const res =
      origem === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.6,
          });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setFoto({
      uri: a.uri,
      name: a.fileName ?? 'feedforward.jpg',
      mimeType: a.mimeType ?? 'image/jpeg',
    });
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
            'A rodada foi salva, mas a foto não pôde ser enviada. Tente reenviá-la.',
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
              PERGUNTAS_REFERENCIA.map((g) => (
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
  botaoNovo: { marginBottom: espacamento.md },
  vazio: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    fontStyle: 'italic',
  },
  rodada: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
    paddingTop: espacamento.md,
    marginTop: espacamento.md,
    gap: espacamento.xs,
  },
  rodadaTopo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rodadaData: { ...tipografia.rotulo, fontWeight: '700', color: cores.texto },
  rodadaLider: { ...tipografia.legenda, color: cores.textoSecundario },
  estrelas: { flexDirection: 'row', gap: 2 },
  fotoWrap: {
    marginTop: espacamento.sm,
    borderRadius: raio.md,
    overflow: 'hidden',
  },
  foto: { width: '100%', height: 180, backgroundColor: cores.divisor },
  ampliarSelo: {
    position: 'absolute',
    right: espacamento.sm,
    bottom: espacamento.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: espacamento.sm,
    paddingVertical: 2,
    borderRadius: raio.pill,
  },
  ampliarSeloTexto: { ...tipografia.legenda, color: cores.textoInverso },
  bloco: { marginTop: espacamento.sm },
  blocoTitulo: {
    ...tipografia.legenda,
    fontWeight: '700',
    color: cores.textoSecundario,
    marginBottom: 2,
  },
  blocoTexto: { ...tipografia.corpo, color: cores.texto },
  ponto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    paddingVertical: espacamento.xs,
  },
  pontoBolinha: { width: 10, height: 10, borderRadius: 5 },
  pontoDescricao: { ...tipografia.corpo, color: cores.texto },
  pontoMeta: { ...tipografia.legenda, color: cores.textoSecundario },
  // Visor de foto
  visor: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  visorImg: { width: '100%', height: '80%' },
  // Modal
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
