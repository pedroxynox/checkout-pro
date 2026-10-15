/**
 * Seção "Feedforward" do perfil do colaborador.
 *
 * O colaborador preenche o formulário de feedforward em PAPEL (autoavaliação e
 * metas). O líder tira uma FOTO do formulário e registra aqui só o essencial
 * para dar seguimento: pontos fortes, oportunidades, nota de evolução (1–5) e
 * os PONTOS A MELHORAR, cada um com um PRAZO. Ao vencer o prazo, supervisores e
 * gerentes são avisados.
 *
 * Esta peça **orquestra**: carrega as rodadas, controla os modais e executa as
 * ações (remover, enviar foto, imprimir). A exibição fica em
 * `ResumoFeedforward` e `RodadaFeedforwardItem`; os formulários, em
 * `ModalNovaRodada`, `ModalEditarRodada` e `ModalRevisarPonto`.
 *
 * Visível a quem tem `FEEDFORWARD_VISUALIZAR`; criar/editar/revisar exige
 * `FEEDFORWARD_GERIR` (supervisor e gerente).
 */
import React, { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { feedforwardService } from '../../api/services';
import { PontoFeedforward, RodadaFeedforward } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Botao, Carregando, Cartao, MensagemErro } from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, tipografia } from '../../theme';
import { confirmar, notificar } from '../../utils/dialogos';
import { formatarData } from '../../utils/formato';
import { imprimirRelatorio } from '../../utils/impressao';
import {
  ColaboradorImpressao,
  htmlFormularioFeedforward,
  htmlHistoricoFeedforward,
  htmlRodadaFeedforward,
} from '../../utils/relatorioFeedforward';
import { selecionarImagem, urlFoto } from './feedforwardApoio';
import { ModalEditarRodada } from './ModalEditarRodada';
import { ModalNovaRodada } from './ModalNovaRodada';
import { ModalRevisarPonto } from './ModalRevisarPonto';
import { ResumoFeedforward } from './ResumoFeedforward';
import { RodadaFeedforwardItem } from './RodadaFeedforwardItem';

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

  /** Fecha um modal e recarrega o histórico. */
  const concluir = (fechar: () => void) => (): void => {
    fechar();
    req.recarregar();
  };

  /** Abre a impressão/PDF de um documento já montado em HTML. */
  const imprimir = async (html: string): Promise<void> => {
    try {
      await imprimirRelatorio(html);
    } catch {
      notificar('Erro', 'Não foi possível abrir a impressão do feedforward.');
    }
  };

  const tocarPonto = (ponto: PontoFeedforward): void => {
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
      {!req.carregando && !req.erro ? <ResumoFeedforward rodadas={rodadas} /> : null}

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
          <RodadaFeedforwardItem
            key={r.id}
            rodada={r}
            podeGerir={podeGerir}
            ocupado={ocupadoId === r.id}
            aoEditar={() => setRodadaEditando(r)}
            aoImprimir={() =>
              void imprimir(htmlRodadaFeedforward(r, ident, opcoesImpressao))
            }
            aoRemover={() => void removerRodada(r)}
            aoEnviarFoto={(origem) => void enviarFotoRodada(r, origem)}
            aoAmpliarFoto={setFotoAmpliada}
            aoTocarPonto={tocarPonto}
          />
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
          aoSalvo={concluir(() => setRodadaEditando(null))}
        />
      )}

      {pontoRevisando && (
        <ModalRevisarPonto
          ponto={pontoRevisando}
          aoFechar={() => setPontoRevisando(null)}
          aoRevisado={concluir(() => setPontoRevisando(null))}
        />
      )}

      {modalAberto && (
        <ModalNovaRodada
          colaboradorId={colaboradorId}
          aoFechar={() => setModalAberto(false)}
          aoRegistrado={concluir(() => setModalAberto(false))}
        />
      )}
    </Cartao>
  );
}

const styles = StyleSheet.create({
  botaoNovo: { marginBottom: espacamento.md },
  impressaoLinha: {
    flexDirection: 'row',
    gap: espacamento.sm,
    marginBottom: espacamento.sm,
  },
  botaoFlex: { flex: 1 },
  vazio: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    fontStyle: 'italic',
  },
  visor: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  visorImg: { width: '100%', height: '80%' },
});
