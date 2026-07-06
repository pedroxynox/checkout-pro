/**
 * Modal de registro de uma **sanção** disciplinar (advertência ou suspensão),
 * usado na seção "Sanções". Diferente do modal de incidências dos fiscais, é
 * focado no fluxo disciplinar:
 *  - escolha do tipo (Advertência / Suspensão);
 *  - a suspensão pede a **duração em dias** e mostra até quando vai;
 *  - **motivo obrigatório** + observação;
 *  - sugestão de **disciplina progressiva** (a partir do histórico do período);
 *  - vínculo **opcional** com uma falta/não-retorno recente que a motivou.
 *
 * Persiste via `escalaService.registrarIncidencia` (backend genérico por tipo).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { escalaService, operadoresService } from '../../api/services';
import {
  ItemSancaoColaborador,
  META_TIPO_INCIDENCIA,
  ProximoPassoDisciplinar,
  TipoIncidenciaEscala,
} from '../../api/types';
import { Botao, CampoTexto } from '../../components';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { formatarData, hojeISO } from '../../utils/formato';

/** Rótulo da sugestão de próximo passo disciplinar. */
const ROTULO_PROXIMO: Record<ProximoPassoDisciplinar, string> = {
  ADVERTENCIA: 'Advertência',
  SUSPENSAO: 'Suspensão',
  AVALIAR_DESLIGAMENTO: 'Avaliar desligamento',
};

/** Uma ocorrência recente que pode ter motivado a sanção (causa opcional). */
interface OpcaoCausa {
  tipo: string; // 'FALTA' | TipoIncidenciaEscala
  data: string; // ISO yyyy-mm-dd
  rotulo: string;
}

/** ISO de N dias atrás (para buscar as ocorrências recentes). */
function isoDiasAtras(dias: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/** Soma N dias a uma data ISO e devolve ISO (para prever o fim da suspensão). */
function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

interface RegistrarSancaoModalProps {
  visivel: boolean;
  aoFechar: () => void;
  /** Chamado após salvar com sucesso (recarrega o panorama). */
  aoSalvar: () => void;
  colaboradorId: string;
  colaboradorNome: string;
  /** Resumo do colaborador no período (para a sugestão de disciplina). */
  resumo?: ItemSancaoColaborador;
}

export function RegistrarSancaoModal({
  visivel,
  aoFechar,
  aoSalvar,
  colaboradorId,
  colaboradorNome,
  resumo,
}: RegistrarSancaoModalProps): React.ReactElement {
  const [tipo, setTipo] = useState<TipoIncidenciaEscala>('ADVERTENCIA');
  const [data, setData] = useState(hojeISO());
  const [dias, setDias] = useState('1');
  const [motivo, setMotivo] = useState('');
  const [observacao, setObservacao] = useState('');
  const [causa, setCausa] = useState<OpcaoCausa | null>(null);
  const [opcoesCausa, setOpcoesCausa] = useState<OpcaoCausa[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const proximoSugerido: ProximoPassoDisciplinar =
    resumo?.proximoPasso ?? 'ADVERTENCIA';

  // Reseta os campos ao abrir e pré-seleciona o tipo sugerido pela disciplina
  // progressiva (advertência quando a sugestão é "avaliar desligamento").
  useEffect(() => {
    if (!visivel) return;
    setErro(null);
    setData(hojeISO());
    setDias('1');
    setMotivo('');
    setObservacao('');
    setCausa(null);
    setTipo(proximoSugerido === 'SUSPENSAO' ? 'SUSPENSAO' : 'ADVERTENCIA');
  }, [visivel, proximoSugerido]);

  // Busca as ocorrências recentes (faltas + incidências) para o vínculo opcional.
  const carregarCausas = useCallback(async () => {
    const inicio = isoDiasAtras(30);
    const fim = hojeISO();
    try {
      const [faltas, incidencias] = await Promise.all([
        operadoresService.listarAusencias(inicio, fim).catch(() => []),
        escalaService
          .listarIncidencias({ colaboradorId, inicio, fim })
          .catch(() => []),
      ]);
      const opcoes: OpcaoCausa[] = [];
      for (const f of faltas) {
        if (f.pessoaId !== colaboradorId) continue;
        const dia = f.data.slice(0, 10);
        opcoes.push({ tipo: 'FALTA', data: dia, rotulo: `Falta · ${formatarData(dia)}` });
      }
      for (const i of incidencias) {
        // Só ocorrências (não as próprias sanções) servem de causa.
        if (META_TIPO_INCIDENCIA[i.tipo]?.registro === 'PERFIL') continue;
        const dia = i.data.slice(0, 10);
        opcoes.push({
          tipo: i.tipo,
          data: dia,
          rotulo: `${META_TIPO_INCIDENCIA[i.tipo]?.rotulo ?? i.tipo} · ${formatarData(dia)}`,
        });
      }
      opcoes.sort((a, b) => b.data.localeCompare(a.data));
      setOpcoesCausa(opcoes.slice(0, 8));
    } catch {
      setOpcoesCausa([]);
    }
  }, [colaboradorId]);

  useEffect(() => {
    if (visivel) void carregarCausas();
  }, [visivel, carregarCausas]);

  const ehSuspensao = tipo === 'SUSPENSAO';
  const diasNum = Math.max(1, Math.min(60, parseInt(dias || '1', 10) || 1));
  const fimSuspensao = somarDias(data, diasNum - 1);

  const salvar = async (): Promise<void> => {
    setErro(null);
    if (!motivo.trim()) {
      setErro('Informe o motivo da sanção.');
      return;
    }
    setSalvando(true);
    try {
      await escalaService.registrarIncidencia({
        colaboradorId,
        tipo,
        data,
        motivo: motivo.trim(),
        observacao: observacao.trim() || undefined,
        diasSuspensao: ehSuspensao ? diasNum : undefined,
        causaTipo: causa?.tipo,
        causaData: causa?.data,
      });
      aoSalvar();
      aoFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      visible={visivel}
      animationType="slide"
      transparent
      onRequestClose={aoFechar}
    >
      <KeyboardAvoidingView
        style={styles.fundo}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.folha}>
          <View style={styles.topo}>
            <Text style={styles.titulo}>Registrar sanção</Text>
            <Pressable onPress={aoFechar} hitSlop={12} accessibilityLabel="Fechar">
              <Ionicons name="close" size={24} color={cores.texto} />
            </Pressable>
          </View>
          <Text style={styles.subtitulo} numberOfLines={1}>
            {colaboradorNome}
          </Text>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Sugestão de disciplina progressiva */}
            {resumo ? (
              <View style={styles.sugestaoBox}>
                <Ionicons name="bulb-outline" size={16} color={cores.primaria} />
                <Text style={styles.sugestaoTexto}>
                  No período: {resumo.advertencias} advertência
                  {resumo.advertencias === 1 ? '' : 's'} ·{' '}
                  {resumo.suspensoes} suspensão
                  {resumo.suspensoes === 1 ? '' : 'ões'}. Sugestão:{' '}
                  <Text style={styles.sugestaoForte}>
                    {ROTULO_PROXIMO[proximoSugerido]}
                  </Text>
                  .
                </Text>
              </View>
            ) : null}

            {/* Tipo de sanção */}
            <View style={styles.tipos}>
              {(['ADVERTENCIA', 'SUSPENSAO'] as TipoIncidenciaEscala[]).map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setTipo(t)}
                  style={[styles.chipTipo, tipo === t && styles.chipTipoAtivo]}
                >
                  <Text
                    style={[
                      styles.chipTipoTexto,
                      tipo === t && styles.chipTipoTextoAtivo,
                    ]}
                  >
                    {META_TIPO_INCIDENCIA[t].rotulo}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.linhaData}>
              <Text style={styles.dataRotulo}>Data</Text>
              <Text style={styles.dataValor}>{formatarData(data)}</Text>
            </View>

            {/* Duração da suspensão */}
            {ehSuspensao ? (
              <>
                <CampoTexto
                  rotulo="Duração (dias)"
                  value={dias}
                  onChangeText={(v) => setDias(v.replace(/\D/g, '').slice(0, 2))}
                  placeholder="1"
                  keyboardType="number-pad"
                  maxLength={2}
                />
                <Text style={styles.previsao}>
                  Suspenso de {formatarData(data)} até {formatarData(fimSuspensao)}{' '}
                  ({diasNum} dia{diasNum === 1 ? '' : 's'}).
                </Text>
              </>
            ) : null}

            <CampoTexto
              rotulo="Motivo *"
              value={motivo}
              onChangeText={setMotivo}
              placeholder="Motivo da sanção (obrigatório)"
            />
            <CampoTexto
              rotulo="Observação"
              value={observacao}
              onChangeText={setObservacao}
              placeholder="Observação (opcional)"
              multiline
              numberOfLines={3}
              style={styles.multiline}
            />

            {/* Vínculo opcional com a ocorrência que motivou */}
            {opcoesCausa.length > 0 ? (
              <View style={styles.causaBloco}>
                <Text style={styles.causaRotulo}>Motivada por (opcional)</Text>
                <View style={styles.causaChips}>
                  {opcoesCausa.map((op) => {
                    const ativo =
                      causa?.tipo === op.tipo && causa?.data === op.data;
                    return (
                      <Pressable
                        key={`${op.tipo}-${op.data}`}
                        onPress={() => setCausa(ativo ? null : op)}
                        style={[styles.causaChip, ativo && styles.causaChipAtivo]}
                      >
                        <Text
                          style={[
                            styles.causaChipTexto,
                            ativo && styles.causaChipTextoAtivo,
                          ]}
                        >
                          {op.rotulo}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {erro ? (
              <View style={styles.erroBox}>
                <Ionicons
                  name="alert-circle-outline"
                  size={18}
                  color={cores.erro}
                />
                <Text style={styles.erroTexto}>{erro}</Text>
              </View>
            ) : null}

            <Botao
              titulo="Registrar sanção"
              aoPressionar={() => void salvar()}
              carregando={salvando}
              desabilitado={salvando}
              estilo={styles.acao}
            />
            <Botao
              titulo="Cancelar"
              variante="texto"
              aoPressionar={aoFechar}
              desabilitado={salvando}
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fundo: {
    flex: 1,
    backgroundColor: 'rgba(10, 37, 64, 0.45)',
    justifyContent: 'flex-end',
  },
  folha: {
    backgroundColor: cores.fundo,
    borderTopLeftRadius: raio.lg,
    borderTopRightRadius: raio.lg,
    paddingHorizontal: espacamento.lg,
    paddingTop: espacamento.lg,
    paddingBottom: espacamento.xl,
    maxHeight: '90%',
  },
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titulo: { ...tipografia.subtitulo, color: cores.texto },
  subtitulo: {
    ...tipografia.corpo,
    color: cores.textoSecundario,
    marginBottom: espacamento.md,
  },
  sugestaoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacamento.xs,
    backgroundColor: cores.primariaClara,
    borderRadius: raio.md,
    padding: espacamento.sm,
    marginBottom: espacamento.md,
  },
  sugestaoTexto: {
    ...tipografia.legenda,
    color: cores.texto,
    flex: 1,
    lineHeight: 18,
  },
  sugestaoForte: { fontWeight: '700', color: cores.primaria },
  tipos: {
    flexDirection: 'row',
    gap: espacamento.sm,
    marginBottom: espacamento.md,
  },
  chipTipo: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: espacamento.sm,
    borderRadius: raio.md,
    borderWidth: 1,
    borderColor: cores.divisor,
    backgroundColor: cores.superficie,
  },
  chipTipoAtivo: {
    borderColor: cores.primaria,
    backgroundColor: cores.primariaClara,
  },
  chipTipoTexto: { ...tipografia.corpo, color: cores.textoSecundario, fontWeight: '600' },
  chipTipoTextoAtivo: { color: cores.primaria },
  linhaData: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: espacamento.sm,
    marginBottom: espacamento.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  dataRotulo: { ...tipografia.rotulo, color: cores.textoSecundario },
  dataValor: { ...tipografia.corpo, color: cores.texto, fontWeight: '600' },
  previsao: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.sm,
    fontStyle: 'italic',
  },
  multiline: {
    minHeight: 72,
    textAlignVertical: 'top',
    paddingTop: espacamento.sm,
  },
  causaBloco: { marginTop: espacamento.xs, marginBottom: espacamento.sm },
  causaRotulo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginBottom: espacamento.xs,
  },
  causaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: espacamento.xs },
  causaChip: {
    paddingVertical: espacamento.xs,
    paddingHorizontal: espacamento.sm,
    borderRadius: raio.pill,
    borderWidth: 1,
    borderColor: cores.divisor,
    backgroundColor: cores.superficie,
  },
  causaChipAtivo: {
    borderColor: cores.primaria,
    backgroundColor: cores.primariaClara,
  },
  causaChipTexto: { ...tipografia.legenda, color: cores.textoSecundario },
  causaChipTextoAtivo: { color: cores.primaria, fontWeight: '700' },
  erroBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    backgroundColor: cores.vermelhoFundo,
    borderRadius: raio.md,
    padding: espacamento.md,
    marginBottom: espacamento.md,
  },
  erroTexto: { ...tipografia.legenda, color: cores.erro, flex: 1 },
  acao: { marginTop: espacamento.sm, marginBottom: espacamento.sm },
});

export default RegistrarSancaoModal;
