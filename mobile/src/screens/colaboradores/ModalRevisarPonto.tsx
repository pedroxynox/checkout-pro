/**
 * Modal de acompanhamento de um ponto a melhorar (pendente) do feedforward.
 *
 * Três modos:
 *  - **Revisar:** "Atingido" ou "Não atingido" + observação (auditoria).
 *  - **Prorrogar:** novo prazo (futuro e posterior ao atual) + motivo — para
 *    quando o colaborador precisa de mais tempo, sem marcar "não atingido".
 *  - **Editar:** corrige a descrição ou remove o ponto.
 *
 * Substitui o antigo `Alert.alert` (que não funciona no navegador).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { feedforwardService } from '../../api/services';
import { PontoFeedforward } from '../../api/types';
import { Botao, CampoTexto, SeletorData, Segmentado } from '../../components';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { confirmar, notificar } from '../../utils/dialogos';
import { formatarData, hojeISO } from '../../utils/formato';

type StatusRevisao = 'ATINGIDO' | 'NAO_ATINGIDO';
type Modo = 'REVISAR' | 'PRORROGAR' | 'EDITAR';

/** Soma `dias` a uma data ISO (yyyy-mm-dd), em UTC. */
export function somarDiasISO(iso: string, dias: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Menor prazo aceito numa prorrogação: o dia seguinte ao prazo atual ou
 * amanhã — o que for mais tarde (espelha a regra do backend).
 */
export function prazoMinimoProrrogacao(prazoAtualISO: string, hoje: string): string {
  const depoisDoAtual = somarDiasISO(prazoAtualISO, 1);
  const amanha = somarDiasISO(hoje, 1);
  return depoisDoAtual > amanha ? depoisDoAtual : amanha;
}

export function ModalRevisarPonto({
  ponto,
  aoFechar,
  aoRevisado,
}: {
  ponto: PontoFeedforward;
  aoFechar: () => void;
  /** Chamado após qualquer alteração salva (revisão, prorrogação, edição, remoção). */
  aoRevisado: () => void;
}): React.ReactElement {
  const minimo = prazoMinimoProrrogacao(ponto.prazo, hojeISO());
  const [modo, setModo] = useState<Modo>('REVISAR');
  const [status, setStatus] = useState<StatusRevisao>('ATINGIDO');
  const [observacao, setObservacao] = useState('');
  const [novoPrazo, setNovoPrazo] = useState(somarDiasISO(minimo, 6));
  const [motivo, setMotivo] = useState('');
  const [descricao, setDescricao] = useState(ponto.descricao);
  const [ocupado, setOcupado] = useState(false);

  const executar = async (acao: () => Promise<unknown>, falha: string): Promise<void> => {
    setOcupado(true);
    try {
      await acao();
      aoRevisado();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : falha);
    } finally {
      setOcupado(false);
    }
  };

  const salvar = (): void => {
    if (modo === 'REVISAR') {
      void executar(
        () =>
          feedforwardService.revisarPonto(
            ponto.id,
            status,
            observacao.trim() || undefined,
          ),
        'Falha ao revisar.',
      );
    } else if (modo === 'PRORROGAR') {
      void executar(
        () =>
          feedforwardService.prorrogarPonto(
            ponto.id,
            novoPrazo,
            motivo.trim() || undefined,
          ),
        'Falha ao prorrogar.',
      );
    } else {
      const texto = descricao.trim();
      if (texto.length < 2) {
        notificar('Descrição inválida', 'Descreva o ponto a melhorar.');
        return;
      }
      void executar(
        () => feedforwardService.editarPonto(ponto.id, texto),
        'Falha ao salvar o ponto.',
      );
    }
  };

  const remover = async (): Promise<void> => {
    const ok = await confirmar(
      'Remover ponto',
      `Remover o ponto "${ponto.descricao}"? Esta ação não pode ser desfeita.`,
      'Remover',
    );
    if (!ok) return;
    void executar(
      () => feedforwardService.removerPonto(ponto.id),
      'Falha ao remover o ponto.',
    );
  };

  const tituloBotao =
    modo === 'REVISAR'
      ? 'Salvar revisão'
      : modo === 'PRORROGAR'
        ? 'Prorrogar prazo'
        : 'Salvar descrição';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={aoFechar}>
      <View style={styles.fundo}>
        <View style={styles.cartao}>
          <View style={styles.cabecalho}>
            <Text style={styles.titulo}>Acompanhar ponto</Text>
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
            <Text style={styles.prazo}>
              Prazo atual {formatarData(ponto.prazo)}
              {ponto.prorrogacoes
                ? ` · prorrogado ${ponto.prorrogacoes}x`
                : ''}
            </Text>

            <View style={styles.modos}>
              <Segmentado<Modo>
                opcoes={[
                  { valor: 'REVISAR', rotulo: 'Revisar' },
                  { valor: 'PRORROGAR', rotulo: 'Prorrogar' },
                  { valor: 'EDITAR', rotulo: 'Editar' },
                ]}
                selecionado={modo}
                aoSelecionar={setModo}
              />
            </View>

            {modo === 'REVISAR' ? (
              <>
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
              </>
            ) : modo === 'PRORROGAR' ? (
              <>
                <SeletorData
                  valor={novoPrazo}
                  aoMudar={setNovoPrazo}
                  rotulo="Novo prazo"
                  dataMinima={minimo}
                />
                <CampoTexto
                  rotulo="Motivo (opcional)"
                  value={motivo}
                  onChangeText={setMotivo}
                  multiline
                  maxLength={500}
                  placeholder="Por que precisa de mais tempo…"
                />
              </>
            ) : (
              <>
                <CampoTexto
                  rotulo="Descrição do ponto"
                  value={descricao}
                  onChangeText={setDescricao}
                  maxLength={300}
                  placeholder="O que precisa melhorar…"
                />
                <Pressable
                  style={styles.removerPonto}
                  onPress={() => void remover()}
                  disabled={ocupado}
                  accessibilityRole="button"
                >
                  <Ionicons name="trash-outline" size={16} color={cores.vermelho} />
                  <Text style={styles.removerPontoTexto}>Remover este ponto</Text>
                </Pressable>
              </>
            )}
          </View>

          <View style={styles.rodape}>
            <Botao
              titulo="Cancelar"
              variante="secundario"
              aoPressionar={aoFechar}
              estilo={styles.botaoFlex}
            />
            <Botao
              titulo={tituloBotao}
              aoPressionar={salvar}
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
  modos: { marginTop: espacamento.sm },
  rotulo: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
    marginTop: espacamento.md,
    marginBottom: espacamento.xs,
  },
  removerPonto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: espacamento.sm,
  },
  removerPontoTexto: { ...tipografia.legenda, color: cores.vermelho },
  rodape: {
    flexDirection: 'row',
    gap: espacamento.sm,
    padding: espacamento.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
  },
  botaoFlex: { flex: 1 },
});
