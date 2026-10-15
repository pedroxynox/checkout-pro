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
import { confirmar, notificar } from '../../utils/dialogos';
import { formatarData, formatarDataHora, hojeISO } from '../../utils/formato';
import { imprimirRelatorio } from '../../utils/impressao';
import {
  ColaboradorImpressao,
  PERGUNTAS_FEEDFORWARD,
  ROTULO_SITUACAO_FEEDFORWARD,
  htmlFormularioFeedforward,
  htmlHistoricoFeedforward,
  htmlRodadaFeedforward,
  rotuloCargo,
} from '../../utils/relatorioFeedforward';
import { Estrelas } from './EstrelasFeedforward';
import { ModalEditarRodada } from './ModalEditarRodada';
import { ModalRevisarPonto } from './ModalRevisarPonto';

/** Perguntas do formulário (referência para guiar a conversa — não editáveis). */
const PERGUNTAS_REFERENCIA = PERGUNTAS_FEEDFORWARD;

const COR_SITUACAO: Record<SituacaoPontoFeedforward, string> = {
  EM_DIA: cores.verde,
  PROXIMO: cores.amarelo,
  VENCIDO: cores.vermelho,
  ATINGIDO: cores.verde,
  NAO_ATINGIDO: cores.vermelho,
};
const ROTULO_SITUACAO = ROTULO_SITUACAO_FEEDFORWARD;

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

/**
 * Pede a permissão e abre a câmera ou a galeria. Devolve a imagem escolhida
 * ou `null` (cancelado / sem permissão — neste caso já avisa o usuário).
 */
async function selecionarImagem(
  origem: 'camera' | 'galeria',
): Promise<ImagemSelecionada | null> {
  const permissao =
    origem === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permissao.granted) {
    notificar('Permissão necessária', 'Conceda o acesso para anexar a foto.');
    return null;
  }
  const res =
    origem === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.6,
        });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return {
    uri: a.uri,
    name: a.fileName ?? 'feedforward.jpg',
    mimeType: a.mimeType ?? 'image/jpeg',
  };
}

export function FeedforwardSecao({
  colaboradorId,
  colaborador,
}: {
  colaboradorId: string;
  /** Identificação impressa nos documentos (nome, matrícula, função). */
  colaborador?: ColaboradorImpressao;
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
  const [pontoRevisando, setPontoRevisando] = useState<PontoFeedforward | null>(
    null,
  );
  const [rodadaEditando, setRodadaEditando] = useState<RodadaFeedforward | null>(
    null,
  );
  /** Rodada com uma ação em andamento (envio de foto ou remoção). */
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);

  if (!podeVer) return null;

  const rodadas = req.dados ?? [];

  const ident: ColaboradorImpressao = colaborador ?? { nome: 'Colaborador(a)' };
  const opcoesImpressao = { urlFoto };

  /** Abre a impressão/PDF de um documento já montado em HTML. */
  const imprimir = async (html: string): Promise<void> => {
    try {
      await imprimirRelatorio(html);
    } catch {
      notificar('Erro', 'Não foi possível abrir a impressão do feedforward.');
    }
  };

  const revisarPonto = (ponto: PontoFeedforward): void => {
    if (!podeGerir || ponto.status !== 'PENDENTE') return;
    setPontoRevisando(ponto);
  };

  const removerRodada = async (r: RodadaFeedforward): Promise<void> => {
    const ok = await confirmar(
      'Remover feedforward',
      `Remover a rodada de ${formatarData(r.data)}? Os pontos a melhorar e a foto também serão removidos. Esta ação não pode ser desfeita.`,
      'Remover',
    );
    if (!ok) return;
    setOcupadoId(r.id);
    try {
      await feedforwardService.remover(r.id);
      req.recarregar();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao remover.');
    } finally {
      setOcupadoId(null);
    }
  };

  const enviarFotoRodada = async (
    r: RodadaFeedforward,
    origem: 'camera' | 'galeria',
  ): Promise<void> => {
    const imagem = await selecionarImagem(origem);
    if (!imagem) return;
    setOcupadoId(r.id);
    try {
      await feedforwardService.enviarFoto(r.id, imagem);
      req.recarregar();
    } catch (e) {
      notificar(
        'Erro',
        e instanceof ApiError ? e.message : 'Falha ao enviar a foto.',
      );
    } finally {
      setOcupadoId(null);
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

      {/* Impressão: formulário em branco (papel) e histórico completo */}
      <View style={styles.impressaoLinha}>
        <Botao
          titulo="Imprimir formulário"
          variante="secundario"
          aoPressionar={() =>
            void imprimir(htmlFormularioFeedforward(colaborador ?? null))
          }
          estilo={styles.botaoFlex}
        />
        {rodadas.length > 0 ? (
          <Botao
            titulo="Imprimir histórico"
            variante="secundario"
            aoPressionar={() =>
              void imprimir(
                htmlHistoricoFeedforward(rodadas, ident, opcoesImpressao),
              )
            }
            estilo={styles.botaoFlex}
          />
        ) : null}
      </View>

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
              <View style={styles.rodadaTopoDireita}>
                {r.evolucaoNota != null && <Estrelas nota={r.evolucaoNota} />}
                {podeGerir ? (
                  <Pressable
                    onPress={() => setRodadaEditando(r)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Editar esta rodada de feedforward"
                  >
                    <Ionicons name="create-outline" size={18} color={cores.primaria} />
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() =>
                    void imprimir(htmlRodadaFeedforward(r, ident, opcoesImpressao))
                  }
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Imprimir esta rodada de feedforward"
                >
                  <Ionicons name="print-outline" size={18} color={cores.primaria} />
                </Pressable>
                {podeGerir ? (
                  <Pressable
                    onPress={() => void removerRodada(r)}
                    disabled={ocupadoId === r.id}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Remover esta rodada de feedforward"
                  >
                    <Ionicons name="trash-outline" size={18} color={cores.vermelho} />
                  </Pressable>
                ) : null}
              </View>
            </View>
            {r.liderNome ? (
              <Text style={styles.rodadaLider}>Líder: {r.liderNome}</Text>
            ) : null}
            {r.cargo ? (
              <Text style={styles.rodadaLider}>
                Cargo na data: {rotuloCargo(r.cargo)}
              </Text>
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

            {/* Enviar (ou trocar) a foto de uma rodada já salva */}
            {podeGerir ? (
              <View style={styles.fotoAcoes}>
                <Ionicons name="camera-outline" size={15} color={cores.primaria} />
                <Text style={styles.fotoAcoesRotulo}>
                  {ocupadoId === r.id
                    ? 'Aguarde…'
                    : r.fotoUrl
                      ? 'Trocar foto:'
                      : 'Sem foto do formulário:'}
                </Text>
                {ocupadoId !== r.id ? (
                  <>
                    <Pressable
                      onPress={() => void enviarFotoRodada(r, 'camera')}
                      hitSlop={6}
                      accessibilityRole="button"
                    >
                      <Text style={styles.fotoAcoesLink}>Tirar foto</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void enviarFotoRodada(r, 'galeria')}
                      hitSlop={6}
                      accessibilityRole="button"
                    >
                      <Text style={styles.fotoAcoesLink}>Da galeria</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
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
                      {p.status !== 'PENDENTE' &&
                      (p.revisadoPorNome || p.revisadoEm) ? (
                        <Text style={styles.pontoRevisao}>
                          Revisado
                          {p.revisadoPorNome ? ` por ${p.revisadoPorNome}` : ''}
                          {p.revisadoEm ? ` em ${formatarDataHora(p.revisadoEm)}` : ''}
                        </Text>
                      ) : null}
                      {p.prorrogacoes ? (
                        <Text style={styles.pontoRevisao}>
                          Prorrogado {p.prorrogacoes}x
                          {p.prazoOriginal
                            ? ` · prazo original ${formatarData(p.prazoOriginal)}`
                            : ''}
                          {p.prorrogadoPorNome ? ` · por ${p.prorrogadoPorNome}` : ''}
                        </Text>
                      ) : null}
                      {p.motivoProrrogacao ? (
                        <Text style={styles.pontoObservacao}>
                          Motivo: {p.motivoProrrogacao}
                        </Text>
                      ) : null}
                      {p.observacaoRevisao ? (
                        <Text style={styles.pontoObservacao}>
                          “{p.observacaoRevisao}”
                        </Text>
                      ) : null}
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

      {rodadaEditando && (
        <ModalEditarRodada
          rodada={rodadaEditando}
          aoFechar={() => setRodadaEditando(null)}
          aoSalvo={() => {
            setRodadaEditando(null);
            req.recarregar();
          }}
        />
      )}

      {pontoRevisando && (
        <ModalRevisarPonto
          ponto={pontoRevisando}
          aoFechar={() => setPontoRevisando(null)}
          aoRevisado={() => {
            setPontoRevisando(null);
            req.recarregar();
          }}
        />
      )}

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
  impressaoLinha: {
    flexDirection: 'row',
    gap: espacamento.sm,
    marginBottom: espacamento.sm,
  },
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
  rodadaTopoDireita: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
  },
  rodadaData: { ...tipografia.rotulo, fontWeight: '700', color: cores.texto },
  fotoAcoes: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: espacamento.sm,
    marginTop: espacamento.xs,
  },
  fotoAcoesRotulo: { ...tipografia.legenda, color: cores.textoSecundario },
  fotoAcoesLink: {
    ...tipografia.legenda,
    color: cores.primaria,
    fontWeight: '700',
  },
  pontoRevisao: { ...tipografia.legenda, color: cores.textoSecundario },
  pontoObservacao: {
    ...tipografia.legenda,
    color: cores.texto,
    fontStyle: 'italic',
  },
  rodadaLider: { ...tipografia.legenda, color: cores.textoSecundario },
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
