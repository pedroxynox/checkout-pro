/**
 * Seção "Sanções" (disciplina do colaborador).
 *
 * Centraliza o registro e o acompanhamento das sanções (advertência/suspensão):
 *  - **Suspensos agora**: quem está suspenso hoje, com os dias restantes;
 *  - **Contadores do mês**: total de advertências e suspensões + tendência;
 *  - **Por colaborador**: ranqueado por risco, com a sugestão de próximo passo
 *    (disciplina progressiva);
 *  - Registro por um botão (busca o colaborador) ou tocando numa linha.
 *
 * O registro exige a permissão de gestão de ausências; a visualização segue a
 * permissão da escala. Tudo vem pronto do backend (`/escala/incidencias/...`).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  advertenciasService,
  colaboradoresService,
  escalaService,
} from '../../api/services';
import { ApiError } from '../../api/client';
import {
  Colaborador,
  ItemSancaoColaborador,
  PanoramaSancoes,
  ProximoPassoDisciplinar,
  SolicitacaoAdvertencia,
} from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import {
  Carregando,
  CampoTexto,
  Cartao,
  EstadoVazio,
  MensagemErro,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { confirmar, notificar } from '../../utils/dialogos';
import { formatarData } from '../../utils/formato';
import { RegistrarSancaoModal } from './RegistrarSancaoModal';

/** Primeiro e último dia do mês atual (ISO). */
function mesAtualISO(): { inicio: string; fim: string } {
  const d = new Date();
  const ini = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const fim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return {
    inicio: ini.toISOString().slice(0, 10),
    fim: fim.toISOString().slice(0, 10),
  };
}

/** Cor (texto/fundo/rótulo) do semáforo de risco. */
function coresRisco(risco: string): { cor: string; fundo: string; rotulo: string } {
  if (risco === 'ALTO')
    return { cor: cores.vermelho, fundo: cores.vermelhoFundo, rotulo: 'Alto' };
  if (risco === 'MEDIO')
    return { cor: cores.amarelo, fundo: cores.amareloFundo, rotulo: 'Médio' };
  return { cor: cores.verde, fundo: cores.verdeFundo, rotulo: 'Baixo' };
}

/** Rótulo da sugestão de próximo passo disciplinar. */
const ROTULO_PROXIMO: Record<ProximoPassoDisciplinar, string> = {
  ADVERTENCIA: 'Próximo: advertência',
  SUSPENSAO: 'Próximo: suspensão',
  AVALIAR_DESLIGAMENTO: 'Avaliar desligamento',
};

/** Alvo selecionado para registrar (id + nome + resumo do período, se houver). */
interface Alvo {
  id: string;
  nome: string;
  resumo?: ItemSancaoColaborador;
}

export function SancoesScreen(): React.ReactElement {
  const { podeAcessar } = useAuth();
  const podeRegistrar = podeAcessar('OPERADORES_AUSENCIAS');
  const podeDecidir = podeAcessar('ADVERTENCIAS_DECIDIR');
  const mes = useMemo(() => mesAtualISO(), []);

  const panorama = useRequisicao<PanoramaSancoes>(
    () => escalaService.panoramaSancoes(mes.inicio, mes.fim),
    [mes.inicio, mes.fim],
  );

  // Solicitações automáticas de advertência (falta não justificada), pendentes.
  const solicitacoes = useRequisicao<SolicitacaoAdvertencia[]>(
    () =>
      podeDecidir
        ? advertenciasService.listarPendentes().catch(() => [])
        : Promise.resolve([]),
    [podeDecidir],
  );
  const [decidindo, setDecidindo] = useState(false);
  const colaboradores = useRequisicao<Colaborador[]>(
    () => (podeRegistrar ? colaboradoresService.listar({ ativo: true }) : Promise.resolve([])),
    [podeRegistrar],
  );

  const [seletorAberto, setSeletorAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [alvo, setAlvo] = useState<Alvo | null>(null);

  const dados = panorama.dados;

  const filtrados = useMemo(() => {
    const lista = colaboradores.dados ?? [];
    const b = busca.trim().toLowerCase();
    if (!b) return lista;
    return lista.filter(
      (c) =>
        c.nome.toLowerCase().includes(b) ||
        c.matricula.toLowerCase().includes(b),
    );
  }, [colaboradores.dados, busca]);

  const abrirRegistroPara = (id: string, nome: string): void => {
    const resumo = dados?.porColaborador.find((p) => p.colaboradorId === id);
    setSeletorAberto(false);
    setBusca('');
    setAlvo({ id, nome, resumo });
  };

  const aoSalvar = (): void => {
    panorama.recarregar();
  };

  /** Aprova uma solicitação de advertência: lança a advertência em Sanções. */
  const aprovarSolicitacao = async (s: SolicitacaoAdvertencia): Promise<void> => {
    if (decidindo) return;
    const ok = await confirmar(
      'Aprovar advertência',
      `Lançar advertência por desídia para ${s.colaboradorNome} (falta em ${formatarData(s.dataFalta)})?`,
      'Aprovar',
    );
    if (!ok) return;
    setDecidindo(true);
    try {
      await advertenciasService.aprovar(s.id);
      solicitacoes.recarregar();
      panorama.recarregar();
      notificar('Advertência lançada', `Registrada em Sanções para ${s.colaboradorNome}.`);
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao aprovar.');
      solicitacoes.recarregar();
    } finally {
      setDecidindo(false);
    }
  };

  /** Cancela uma solicitação (ex.: a falta já foi justificada). */
  const cancelarSolicitacao = async (s: SolicitacaoAdvertencia): Promise<void> => {
    if (decidindo) return;
    const ok = await confirmar(
      'Cancelar solicitação',
      `Descartar a solicitação de advertência de ${s.colaboradorNome}? (ex.: a falta já foi justificada)`,
      'Cancelar solicitação',
    );
    if (!ok) return;
    setDecidindo(true);
    try {
      await advertenciasService.cancelar(s.id);
      solicitacoes.recarregar();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao cancelar.');
    } finally {
      setDecidindo(false);
    }
  };

  const tendenciaTexto = (delta: number): React.ReactElement | null => {
    if (delta === 0) return null;
    const piorou = delta > 0;
    return (
      <Text
        style={[
          styles.tend,
          { color: piorou ? cores.vermelho : cores.verde },
        ]}
      >
        {piorou ? '▲ +' : '▼ '}
        {Math.abs(delta)} vs. mês anterior
      </Text>
    );
  };

  const recarregarTudo = (): void => {
    panorama.recarregar();
    solicitacoes.recarregar();
  };

  const listaSolicitacoes = solicitacoes.dados ?? [];

  return (
    <Tela aoAtualizar={recarregarTudo} atualizando={panorama.atualizando}>
      {podeRegistrar ? (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setSeletorAberto(true)}
          style={styles.btnRegistrar}
        >
          <Ionicons name="add-circle-outline" size={20} color={cores.textoInverso} />
          <Text style={styles.btnRegistrarTexto}>Registrar sanção</Text>
        </TouchableOpacity>
      ) : null}

      {/* Solicitações automáticas de advertência (falta não justificada) */}
      {podeDecidir && listaSolicitacoes.length > 0 ? (
        <Cartao titulo={`Solicitações de advertência (${listaSolicitacoes.length})`}>
          <Text style={styles.solicitacaoIntro}>
            Faltas sem justificar geraram pedido de advertência por desídia.
            Aprove para lançar em Sanções, ou cancele se a falta já foi
            justificada.
          </Text>
          {listaSolicitacoes.map((s) => (
            <View key={s.id} style={styles.solicitacaoItem}>
              <View style={styles.flex1}>
                <Text style={styles.colNome} numberOfLines={1}>
                  {s.colaboradorNome}
                </Text>
                <Text style={styles.colMeta} numberOfLines={1}>
                  Falta em {formatarData(s.dataFalta)} · sem justificar
                </Text>
              </View>
              <View style={styles.solicitacaoAcoes}>
                <TouchableOpacity
                  onPress={() => void cancelarSolicitacao(s)}
                  disabled={decidindo}
                  style={[styles.btnMini, styles.btnMiniCancelar]}
                  hitSlop={6}
                >
                  <Text style={styles.btnMiniCancelarTexto}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void aprovarSolicitacao(s)}
                  disabled={decidindo}
                  style={[styles.btnMini, styles.btnMiniAprovar]}
                  hitSlop={6}
                >
                  <Text style={styles.btnMiniAprovarTexto}>Aprovar</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </Cartao>
      ) : null}

      {panorama.carregando ? (
        <Carregando />
      ) : panorama.erro ? (
        <MensagemErro mensagem={panorama.erro} aoTentarNovamente={panorama.recarregar} />
      ) : !dados ? (
        <EstadoVazio
          icone="shield-outline"
          titulo="Sem sanções"
          descricao="As advertências e suspensões aparecerão aqui."
        />
      ) : (
        <>
          {/* Suspensos agora */}
          {dados.suspensosAgora.length > 0 ? (
            <Cartao titulo="Suspensos agora">
              {dados.suspensosAgora.map((s) => (
                <View key={s.colaboradorId} style={styles.suspLinha}>
                  <View style={styles.suspIcone}>
                    <Ionicons name="pause-circle" size={18} color={cores.vermelho} />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.suspNome} numberOfLines={1}>
                      {s.nome}
                    </Text>
                    <Text style={styles.suspMeta}>
                      Até {formatarData(s.fim)} · {s.diasRestantes} dia
                      {s.diasRestantes === 1 ? '' : 's'} restante
                      {s.diasRestantes === 1 ? '' : 's'}
                    </Text>
                  </View>
                </View>
              ))}
            </Cartao>
          ) : null}

          {/* Contadores do mês */}
          <Cartao titulo="Sanções do mês">
            <View style={styles.contadores}>
              <View style={styles.contaBox}>
                <Text style={[styles.contaNum, { color: cores.amarelo }]}>
                  {dados.totalAdvertencias}
                </Text>
                <Text style={styles.contaRotulo}>Advertências</Text>
                {tendenciaTexto(dados.tendenciaAdvertencias)}
              </View>
              <View style={styles.contaBox}>
                <Text style={[styles.contaNum, { color: cores.vermelho }]}>
                  {dados.totalSuspensoes}
                </Text>
                <Text style={styles.contaRotulo}>Suspensões</Text>
                {tendenciaTexto(dados.tendenciaSuspensoes)}
              </View>
            </View>
          </Cartao>

          {/* Por colaborador */}
          <Cartao titulo="Por colaborador">
            {dados.porColaborador.length === 0 ? (
              <Text style={styles.vazio}>Sem sanções no mês.</Text>
            ) : (
              dados.porColaborador.map((c) => {
                const risco = coresRisco(c.risco);
                const linha = (
                  <View style={styles.colLinha}>
                    <View style={[styles.riscoDot, { backgroundColor: risco.cor }]} />
                    <View style={styles.flex1}>
                      <Text style={styles.colNome} numberOfLines={1}>
                        {c.nome}
                      </Text>
                      <Text style={styles.colMeta} numberOfLines={1}>
                        {c.advertencias} advert. · {c.suspensoes} susp. ·{' '}
                        {ROTULO_PROXIMO[c.proximoPasso]}
                      </Text>
                    </View>
                    {podeRegistrar ? (
                      <Ionicons
                        name="add-circle-outline"
                        size={20}
                        color={cores.primaria}
                      />
                    ) : null}
                  </View>
                );
                return podeRegistrar ? (
                  <Pressable
                    key={c.colaboradorId}
                    onPress={() => abrirRegistroPara(c.colaboradorId, c.nome)}
                    style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
                  >
                    {linha}
                  </Pressable>
                ) : (
                  <View key={c.colaboradorId}>{linha}</View>
                );
              })
            )}
            <Text style={styles.rodape}>
              🔴 alto · 🟡 médio · 🟢 baixo risco. Sugestão de disciplina
              progressiva — decisão sempre do gestor.
            </Text>
          </Cartao>
        </>
      )}

      {/* Seletor de colaborador para registrar */}
      <Modal
        visible={seletorAberto}
        animationType="slide"
        transparent
        onRequestClose={() => setSeletorAberto(false)}
      >
        <View style={styles.seletorFundo}>
          <View style={styles.seletorFolha}>
            <View style={styles.seletorTopo}>
              <Text style={styles.seletorTitulo}>Escolher colaborador</Text>
              <Pressable
                onPress={() => setSeletorAberto(false)}
                hitSlop={12}
                accessibilityLabel="Fechar"
              >
                <Ionicons name="close" size={24} color={cores.texto} />
              </Pressable>
            </View>
            <CampoTexto
              rotulo="Buscar"
              value={busca}
              onChangeText={setBusca}
              placeholder="Nome ou matrícula"
            />
            {colaboradores.carregando ? (
              <Carregando />
            ) : (
              <ScrollView
                style={styles.seletorLista}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {filtrados.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    activeOpacity={0.7}
                    onPress={() => abrirRegistroPara(c.id, c.nome)}
                    style={styles.seletorItem}
                  >
                    <Ionicons
                      name={c.genero === 'M' ? 'man' : 'woman'}
                      size={18}
                      color={cores.primaria}
                    />
                    <Text style={styles.seletorNome} numberOfLines={1}>
                      {c.nome}
                    </Text>
                    <Text style={styles.seletorMat}>Mat. {c.matricula}</Text>
                  </TouchableOpacity>
                ))}
                {filtrados.length === 0 ? (
                  <Text style={styles.vazio}>Nenhum colaborador encontrado.</Text>
                ) : null}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Registro da sanção */}
      {alvo ? (
        <RegistrarSancaoModal
          visivel={!!alvo}
          aoFechar={() => setAlvo(null)}
          aoSalvar={aoSalvar}
          colaboradorId={alvo.id}
          colaboradorNome={alvo.nome}
          resumo={alvo.resumo}
        />
      ) : null}
    </Tela>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  btnRegistrar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacamento.xs,
    backgroundColor: cores.primaria,
    borderRadius: raio.md,
    paddingVertical: espacamento.md,
    marginBottom: espacamento.sm,
  },
  btnRegistrarTexto: {
    ...tipografia.corpo,
    color: cores.textoInverso,
    fontWeight: '700',
  },
  // Solicitações de advertência
  solicitacaoIntro: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.sm,
  },
  solicitacaoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    paddingVertical: espacamento.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  solicitacaoAcoes: {
    flexDirection: 'row',
    gap: espacamento.xs,
  },
  btnMini: {
    paddingVertical: espacamento.xs,
    paddingHorizontal: espacamento.sm,
    borderRadius: raio.pill,
    borderWidth: 1,
  },
  btnMiniCancelar: {
    borderColor: cores.divisor,
    backgroundColor: cores.superficie,
  },
  btnMiniCancelarTexto: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    fontWeight: '700',
  },
  btnMiniAprovar: {
    borderColor: cores.vermelho,
    backgroundColor: cores.vermelho,
  },
  btnMiniAprovarTexto: {
    ...tipografia.legenda,
    color: cores.textoInverso,
    fontWeight: '700',
  },
  // Suspensos
  suspLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    paddingVertical: espacamento.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  suspIcone: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: cores.vermelhoFundo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suspNome: { ...tipografia.corpo, fontWeight: '600', color: cores.texto },
  suspMeta: { ...tipografia.legenda, color: cores.textoSecundario, marginTop: 1 },
  // Contadores
  contadores: { flexDirection: 'row', gap: espacamento.sm },
  contaBox: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: cores.superficieAlternativa,
    borderRadius: raio.md,
    paddingVertical: espacamento.md,
  },
  contaNum: { ...tipografia.titulo, fontWeight: '700' },
  contaRotulo: { ...tipografia.legenda, color: cores.textoSecundario, marginTop: 2 },
  tend: { ...tipografia.legenda, fontWeight: '700', marginTop: 2 },
  // Por colaborador
  colLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    paddingVertical: espacamento.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  riscoDot: { width: 10, height: 10, borderRadius: 5 },
  colNome: { ...tipografia.corpo, fontWeight: '600', color: cores.texto },
  colMeta: { ...tipografia.legenda, color: cores.textoSecundario, marginTop: 1 },
  rodape: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    fontStyle: 'italic',
    marginTop: espacamento.sm,
  },
  vazio: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    fontStyle: 'italic',
    paddingVertical: espacamento.sm,
  },
  // Seletor
  seletorFundo: {
    flex: 1,
    backgroundColor: 'rgba(10, 37, 64, 0.45)',
    justifyContent: 'flex-end',
  },
  seletorFolha: {
    backgroundColor: cores.fundo,
    borderTopLeftRadius: raio.lg,
    borderTopRightRadius: raio.lg,
    paddingHorizontal: espacamento.lg,
    paddingTop: espacamento.lg,
    paddingBottom: espacamento.xl,
    maxHeight: '80%',
  },
  seletorTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: espacamento.sm,
  },
  seletorTitulo: { ...tipografia.subtitulo, color: cores.texto },
  seletorLista: { marginTop: espacamento.xs, flexShrink: 1 },
  seletorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    paddingVertical: espacamento.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  seletorNome: { ...tipografia.corpo, color: cores.texto, flex: 1 },
  seletorMat: { ...tipografia.legenda, color: cores.textoSecundario },
});

export default SancoesScreen;
