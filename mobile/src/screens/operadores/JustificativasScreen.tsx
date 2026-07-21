/**
 * Justificativas de escala — faltas e não-retornos de intervalo.
 *
 * Reúne, num só lugar visível a toda a equipe, as ocorrências recentes com o
 * seu estado (pendente/justificada/não justificada), QUEM registrou e QUEM
 * justificou (auditoria). Quem lança faltas (inclui fiscal) pode justificar,
 * reabrir ou marcar como não justificada — resolvendo o "só eu sei quem
 * justificou". Justificar reduz o impacto no score conforme o motivo.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import {
  colaboradoresService,
  escalaService,
  operadoresService,
} from '../../api/services';
import {
  MotivoJustificativa,
  StatusJustificativa,
} from '../../api/types';
import {
  Botao,
  CampoTexto,
  Carregando,
  Cartao,
  EstadoVazio,
  MensagemErro,
  Selo,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { useAuth } from '../../auth/AuthContext';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { confirmar, notificar } from '../../utils/dialogos';
import { formatarData, hojeISO } from '../../utils/formato';

/** Perfis que podem excluir uma falta (rejeitar lançamento errado). */
const PERFIS_EXCLUEM_FALTA = ['GERENTE', 'ADMINISTRADOR', 'SUPERVISOR'];

/** Tipo de ocorrência justificável. */
type TipoOcorrencia = 'FALTA' | 'NAO_RETORNO';

interface Ocorrencia {
  id: string;
  tipo: TipoOcorrencia;
  nome: string;
  data: string;
  status: StatusJustificativa;
  motivo: MotivoJustificativa | null;
  registradaPorNome: string | null;
  justificadaPorNome: string | null;
}

const ROTULO_MOTIVO: Record<MotivoJustificativa, string> = {
  ATESTADO_MEDICO: 'Atestado médico',
  ABONADA: 'Abonada',
  LICENCA: 'Licença',
  ATRASO_JUSTIFICADO: 'Atraso justificado',
  OUTRO: 'Outro',
};
const MOTIVOS: MotivoJustificativa[] = [
  'ATESTADO_MEDICO',
  'ABONADA',
  'LICENCA',
  'ATRASO_JUSTIFICADO',
  'OUTRO',
];

/** Cor do selo por estado. */
function coresStatus(s: StatusJustificativa): { cor: string; fundo: string; rotulo: string } {
  if (s === 'JUSTIFICADA')
    return { cor: cores.verde, fundo: cores.verdeFundo, rotulo: 'Justificada' };
  if (s === 'INJUSTIFICADA')
    return { cor: cores.vermelho, fundo: cores.vermelhoFundo, rotulo: 'Não justificada' };
  return { cor: cores.amarelo, fundo: cores.amareloFundo, rotulo: 'Pendente' };
}

/**
 * Últimos 30 dias (ISO yyyy-mm-dd), em dia-calendário de Brasília. Usar o dia
 * de Brasília (e não o UTC) garante que uma falta marcada no fim da noite (ex.:
 * 23h) apareça no MESMO dia — antes o fim da janela usava a data UTC.
 */
function janela(): { inicio: string; fim: string } {
  const fim = hojeISO();
  const d = new Date(`${fim}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 30);
  return { inicio: d.toISOString().slice(0, 10), fim };
}

/**
 * Conteúdo das Justificativas (sem `Tela`), para ser embutido em outra tela
 * (ex.: dentro de Escalas, abaixo do painel de faltas) ou usado pela tela
 * própria `JustificativasScreen`.
 */
export function JustificativasLista({
  versao,
}: {
  /** Muda para forçar recarregar em tempo real (ex.: após marcar uma falta). */
  versao?: number;
} = {}): React.ReactElement {
  const req = useRequisicao<Ocorrencia[]>(async () => {
    const { inicio, fim } = janela();
    const [faltas, incidencias, colaboradores] = await Promise.all([
      operadoresService.listarAusencias(inicio, fim),
      escalaService.listarIncidencias({ inicio, fim }),
      colaboradoresService.listar(),
    ]);
    const nomePorId = new Map(colaboradores.map((c) => [c.id, c.nome]));
    const deFaltas: Ocorrencia[] = faltas.map((a) => ({
      id: a.id,
      tipo: 'FALTA',
      nome: a.nome,
      data: a.data,
      status: a.statusJustificativa,
      motivo: a.motivoJustificativa ?? null,
      registradaPorNome: a.registradaPorNome,
      justificadaPorNome: a.justificadaPorNome ?? null,
    }));
    const deIncidencias: Ocorrencia[] = incidencias.map((i) => ({
      id: i.id,
      tipo: 'NAO_RETORNO',
      nome: nomePorId.get(i.colaboradorId) ?? i.colaboradorId,
      data: i.data.slice(0, 10),
      status: i.statusJustificativa ?? 'PENDENTE',
      motivo: i.motivoJustificativa ?? null,
      registradaPorNome: i.registradoPorNome ?? null,
      justificadaPorNome: i.justificadaPorNome ?? null,
    }));
    const ordem: Record<StatusJustificativa, number> = {
      PENDENTE: 0,
      INJUSTIFICADA: 1,
      JUSTIFICADA: 2,
    };
    return [...deFaltas, ...deIncidencias].sort(
      (a, b) => ordem[a.status] - ordem[b.status] || b.data.localeCompare(a.data),
    );
  }, [versao]);

  const { perfil } = useAuth();
  const podeExcluir = !!perfil && PERFIS_EXCLUEM_FALTA.includes(perfil);

  const [filtro, setFiltro] = useState<'PENDENTES' | 'TODAS'>('PENDENTES');
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState<MotivoJustificativa | null>(null);
  const [obs, setObs] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const lista = useMemo(() => {
    const dados = req.dados ?? [];
    return filtro === 'PENDENTES'
      ? dados.filter((o) => o.status === 'PENDENTE')
      : dados;
  }, [req.dados, filtro]);

  const pendentes = (req.dados ?? []).filter((o) => o.status === 'PENDENTE').length;

  const aplicar = useCallback(
    async (
      o: Ocorrencia,
      status: StatusJustificativa,
      motivoEscolhido?: MotivoJustificativa,
      observacao?: string,
    ) => {
      setOcupado(true);
      try {
        const dados = { status, motivo: motivoEscolhido, observacao };
        if (o.tipo === 'FALTA') {
          await operadoresService.justificarAusencia(o.id, dados);
        } else {
          await escalaService.justificarIncidencia(o.id, dados);
        }
        setAbertoId(null);
        setMotivo(null);
        setObs('');
        req.recarregar();
      } catch (e) {
        notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao salvar.');
      } finally {
        setOcupado(false);
      }
    },
    [req],
  );

  const confirmarJustificar = async (o: Ocorrencia) => {
    if (!motivo) {
      notificar('Escolha o motivo', 'Selecione o motivo da justificativa.');
      return;
    }
    await aplicar(o, 'JUSTIFICADA', motivo, obs.trim() || undefined);
  };

  const injustificar = async (o: Ocorrencia) => {
    const ok = await confirmar(
      'Marcar como não justificada',
      `Confirmar que a ${o.tipo === 'FALTA' ? 'falta' : 'ocorrência'} de ${o.nome} não está justificada?`,
      'Confirmar',
    );
    if (ok) await aplicar(o, 'INJUSTIFICADA');
  };

  const reabrir = (o: Ocorrencia) => aplicar(o, 'PENDENTE');

  /**
   * Exclui uma FALTA ou um NÃO-RETORNO lançado por engano (ex.: escala
   * desatualizada, ou retorno do intervalo anotado em atraso — o verificador
   * marcou o não-retorno antes de a batida entrar). Diferente de justificar:
   * apaga a ocorrência de vez, para não pesar no colaborador. Só
   * gerente/supervisor/administrador.
   */
  const excluir = async (o: Ocorrencia): Promise<void> => {
    const rotulo = o.tipo === 'FALTA' ? 'falta' : 'ocorrência de não retorno';
    const ok = await confirmar(
      o.tipo === 'FALTA' ? 'Excluir falta' : 'Excluir não retorno',
      `Excluir a ${rotulo} de ${o.nome} em ${formatarData(o.data)}? Use quando foi registrada por engano (ex.: retorno anotado em atraso). Esta ação não pode ser desfeita.`,
      'Excluir',
    );
    if (!ok) return;
    setOcupado(true);
    try {
      if (o.tipo === 'FALTA') {
        await operadoresService.removerAusencia(o.id);
      } else {
        await escalaService.removerIncidencia(o.id);
      }
      notificar(
        o.tipo === 'FALTA' ? 'Falta excluída' : 'Não retorno excluído',
        `A ${rotulo} de ${o.nome} foi removida.`,
      );
      req.recarregar();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao excluir.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <>
      <View style={styles.chips}>
        {(['PENDENTES', 'TODAS'] as const).map((f) => (
          <Text
            key={f}
            onPress={() => setFiltro(f)}
            style={[styles.chip, filtro === f && styles.chipAtivo]}
          >
            {f === 'PENDENTES' ? `Pendentes (${pendentes})` : 'Todas'}
          </Text>
        ))}
      </View>

      {req.carregando ? (
        <Carregando />
      ) : req.erro ? (
        <MensagemErro mensagem={req.erro} aoTentarNovamente={req.recarregar} />
      ) : lista.length === 0 ? (
        <EstadoVazio
          icone="checkmark-done-outline"
          titulo={filtro === 'PENDENTES' ? 'Nada pendente' : 'Sem ocorrências'}
          descricao="Faltas e não-retornos dos últimos 30 dias aparecem aqui."
        />
      ) : (
        lista.map((o) => {
          const sc = coresStatus(o.status);
          const aberto = abertoId === o.id;
          return (
            <Cartao key={`${o.tipo}-${o.id}`}>
              <View style={styles.topo}>
                <View style={styles.flex1}>
                  <Text style={styles.nome} numberOfLines={1}>
                    {o.nome}
                  </Text>
                  <Text style={styles.meta}>
                    {o.tipo === 'FALTA' ? 'Falta' : 'Não retorno'} ·{' '}
                    {formatarData(o.data)}
                    {o.registradaPorNome ? ` · marcou ${o.registradaPorNome}` : ''}
                  </Text>
                  {o.status === 'JUSTIFICADA' && (
                    <Text style={styles.meta}>
                      {o.motivo ? ROTULO_MOTIVO[o.motivo] : 'Justificada'}
                      {o.justificadaPorNome ? ` · por ${o.justificadaPorNome}` : ''}
                    </Text>
                  )}
                </View>
                <Selo texto={sc.rotulo} cor={sc.cor} fundo={sc.fundo} />
              </View>

              {aberto ? (
                <View style={styles.editor}>
                  <Text style={styles.rotulo}>Motivo</Text>
                  <View style={styles.chips}>
                    {MOTIVOS.map((m) => (
                      <Text
                        key={m}
                        onPress={() => setMotivo(m)}
                        style={[styles.chip, motivo === m && styles.chipAtivo]}
                      >
                        {ROTULO_MOTIVO[m]}
                      </Text>
                    ))}
                  </View>
                  <CampoTexto
                    rotulo="Observação (opcional)"
                    value={obs}
                    onChangeText={setObs}
                    placeholder="Ex.: atestado de 2 dias"
                  />
                  <Botao
                    titulo="Confirmar justificativa"
                    aoPressionar={() => void confirmarJustificar(o)}
                    carregando={ocupado}
                  />
                  <Botao
                    titulo="Cancelar"
                    variante="texto"
                    aoPressionar={() => {
                      setAbertoId(null);
                      setMotivo(null);
                      setObs('');
                    }}
                  />
                </View>
              ) : (
                <View style={styles.acoes}>
                  {o.status !== 'JUSTIFICADA' && (
                    <Pressable
                      onPress={() => {
                        setAbertoId(o.id);
                        setMotivo(null);
                        setObs('');
                      }}
                      style={[styles.btn, styles.btnJustificar]}
                    >
                      <Ionicons name="checkmark-circle-outline" size={16} color={cores.verde} />
                      <Text style={[styles.btnTxt, { color: cores.verde }]}>Justificar</Text>
                    </Pressable>
                  )}
                  {o.status !== 'INJUSTIFICADA' && (
                    <Pressable
                      onPress={() => void injustificar(o)}
                      disabled={ocupado}
                      style={[styles.btn, styles.btnInjust]}
                    >
                      <Ionicons name="close-circle-outline" size={16} color={cores.vermelho} />
                      <Text style={[styles.btnTxt, { color: cores.vermelho }]}>Não justificar</Text>
                    </Pressable>
                  )}
                  {o.status !== 'PENDENTE' && (
                    <Pressable
                      onPress={() => void reabrir(o)}
                      disabled={ocupado}
                      style={[styles.btn, styles.btnReabrir]}
                    >
                      <Ionicons name="refresh-outline" size={16} color={cores.textoSecundario} />
                      <Text style={[styles.btnTxt, { color: cores.textoSecundario }]}>Reabrir</Text>
                    </Pressable>
                  )}
                  {podeExcluir && (
                    <Pressable
                      onPress={() => void excluir(o)}
                      disabled={ocupado}
                      style={[styles.btn, styles.btnExcluir]}
                    >
                      <Ionicons name="trash-outline" size={16} color={cores.vermelho} />
                      <Text style={[styles.btnTxt, { color: cores.vermelho }]}>Excluir</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </Cartao>
          );
        })
      )}
    </>
  );
}

/** Tela própria de Justificativas (envolve a lista com pull-to-refresh). */
export function JustificativasScreen(): React.ReactElement {
  return (
    <Tela>
      <JustificativasLista />
    </Tela>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.xs,
    marginBottom: espacamento.sm,
  },
  chip: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    paddingVertical: espacamento.xs,
    paddingHorizontal: espacamento.sm,
    borderRadius: raio.pill,
    backgroundColor: cores.divisor,
    overflow: 'hidden',
  },
  chipAtivo: { backgroundColor: cores.primaria, color: cores.textoInverso },
  topo: { flexDirection: 'row', alignItems: 'flex-start', gap: espacamento.sm },
  flex1: { flex: 1 },
  nome: { ...tipografia.corpo, fontWeight: '600', color: cores.texto },
  meta: { ...tipografia.legenda, color: cores.textoSecundario, marginTop: 1 },
  acoes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.xs,
    marginTop: espacamento.sm,
    paddingTop: espacamento.sm,
    borderTopWidth: 1,
    borderTopColor: cores.divisor,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: espacamento.xs,
    paddingHorizontal: espacamento.sm,
    borderRadius: raio.md,
    borderWidth: 1,
  },
  btnJustificar: { borderColor: cores.verde, backgroundColor: cores.verdeFundo },
  btnInjust: { borderColor: cores.vermelho, backgroundColor: cores.vermelhoFundo },
  btnReabrir: { borderColor: cores.borda },
  btnExcluir: { borderColor: cores.vermelho },
  btnTxt: { ...tipografia.legenda, fontWeight: '700' },
  editor: {
    marginTop: espacamento.sm,
    paddingTop: espacamento.sm,
    borderTopWidth: 1,
    borderTopColor: cores.divisor,
  },
  rotulo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginBottom: espacamento.xs,
  },
});

export default JustificativasScreen;
