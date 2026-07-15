/**
 * "Ausências a prazo" — card + modal na seção de Escalas.
 *
 * Permite ausentar um colaborador por um PERÍODO (ex.: férias, licença),
 * escolhendo início, fim e o mesmo motivo de justificativa das faltas. O
 * backend cria uma **falta justificada** em cada dia corrido do período,
 * inclusive a folga (a folga também conta). Uso típico: gerente/supervisor.
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
import { ApiError } from '../../api/client';
import { colaboradoresService, operadoresService } from '../../api/services';
import { Colaborador, MotivoJustificativa } from '../../api/types';
import { Botao, CampoTexto, Carregando, SeletorData } from '../../components';
import { useConfigSistema } from '../../config/ConfigSistemaContext';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, raio, sombra, tipografia } from '../../theme';
import { notificar } from '../../utils/dialogos';
import { hojeISO } from '../../utils/formato';

/** Rótulos dos motivos (mesma lista das justificativas de falta). */
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

/** Máximo de colaboradores mostrados na busca (evita listas enormes). */
const MAX_RESULTADOS = 8;

export function AusenciasAPrazoCard({
  aoRegistrado,
}: {
  aoRegistrado: () => void;
}): React.ReactElement {
  const { dataInicial } = useConfigSistema();
  const [aberto, setAberto] = useState(false);

  const colaboradores = useRequisicao<Colaborador[]>(
    () => colaboradoresService.listar({ ativo: true }),
    [],
  );

  const [busca, setBusca] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const [selNome, setSelNome] = useState('');
  const [inicio, setInicio] = useState(hojeISO());
  const [fim, setFim] = useState(hojeISO());
  const [motivo, setMotivo] = useState<MotivoJustificativa | null>(null);
  const [obs, setObs] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const listaFiltrada = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const base = colaboradores.dados ?? [];
    const f = !b
      ? base
      : base.filter(
          (c) =>
            c.nome.toLowerCase().includes(b) ||
            c.matricula.toLowerCase().includes(b),
        );
    return f.slice(0, MAX_RESULTADOS);
  }, [colaboradores.dados, busca]);

  const resetar = (): void => {
    setBusca('');
    setSelId(null);
    setSelNome('');
    setInicio(hojeISO());
    setFim(hojeISO());
    setMotivo(null);
    setObs('');
  };

  const fechar = (): void => setAberto(false);

  // Ao mudar o início, empurra o fim junto se ele ficaria antes do início.
  const mudarInicio = (iso: string): void => {
    setInicio(iso);
    if (iso > fim) setFim(iso);
  };

  const podeConfirmar = !!selId && !!motivo && fim >= inicio && !ocupado;

  const registrar = async (): Promise<void> => {
    if (!selId || !motivo) return;
    setOcupado(true);
    try {
      const r = await operadoresService.registrarAusenciaPeriodo({
        pessoaId: selId,
        inicio,
        fim,
        motivo,
        observacao: obs.trim() || undefined,
      });
      notificar(
        'Ausência registrada',
        `${selNome}: ${r.dias} falta(s) justificada(s) no período.`,
      );
      fechar();
      resetar();
      aoRegistrado();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao registrar.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setAberto(true)}
        style={styles.cardAtalho}
        accessibilityRole="button"
        accessibilityLabel="Abrir ausências a prazo"
      >
        <View style={styles.icone}>
          <Ionicons name="calendar-outline" size={20} color={cores.primaria} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.titulo}>Ausências a prazo</Text>
          <Text style={styles.meta} numberOfLines={1}>
            Ausentar um colaborador por um período (falta justificada)
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={cores.textoSecundario} />
      </TouchableOpacity>

      <Modal
        visible={aberto}
        transparent
        animationType="fade"
        onRequestClose={fechar}
      >
        <Pressable style={styles.fundo} onPress={fechar}>
          {/* onPress vazio impede que tocar dentro do cartão o feche. */}
          <Pressable style={styles.cartao} onPress={() => {}}>
            <View style={styles.cabecalho}>
              <TouchableOpacity
                onPress={fechar}
                hitSlop={10}
                accessibilityLabel="Voltar"
              >
                <Ionicons name="arrow-back" size={22} color={cores.texto} />
              </TouchableOpacity>
              <Text style={styles.cabecalhoTitulo} numberOfLines={1}>
                Ausências a prazo
              </Text>
              <TouchableOpacity
                onPress={fechar}
                hitSlop={10}
                accessibilityLabel="Fechar"
              >
                <Ionicons name="close" size={24} color={cores.texto} />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={{ paddingBottom: espacamento.sm }}
              keyboardShouldPersistTaps="handled"
            >
              {/* 1) Colaborador */}
              {selId ? (
                <View style={styles.selecionado}>
                  <Ionicons name="person" size={16} color={cores.primaria} />
                  <Text style={styles.selecionadoNome} numberOfLines={1}>
                    {selNome}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setSelId(null);
                      setSelNome('');
                    }}
                    hitSlop={8}
                  >
                    <Text style={styles.trocar}>Trocar</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <CampoTexto
                    rotulo="Colaborador"
                    value={busca}
                    onChangeText={setBusca}
                    placeholder="Buscar por nome ou matrícula"
                  />
                  {colaboradores.carregando ? (
                    <Carregando />
                  ) : listaFiltrada.length === 0 ? (
                    <Text style={styles.vazio}>Nenhum colaborador encontrado.</Text>
                  ) : (
                    listaFiltrada.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        style={styles.opcao}
                        activeOpacity={0.7}
                        onPress={() => {
                          setSelId(c.id);
                          setSelNome(c.nome);
                        }}
                      >
                        <Ionicons
                          name={c.genero === 'M' ? 'man' : 'woman'}
                          size={18}
                          color={cores.primaria}
                        />
                        <Text style={styles.opcaoNome} numberOfLines={1}>
                          {c.nome}
                        </Text>
                      </TouchableOpacity>
                    ))
                  )}
                </>
              )}

              {/* 2) Período */}
              <View style={{ marginTop: espacamento.sm }}>
                <SeletorData
                  rotulo="Início"
                  valor={inicio}
                  aoMudar={mudarInicio}
                  dataMinima={dataInicial}
                />
                <SeletorData
                  rotulo="Fim"
                  valor={fim}
                  aoMudar={setFim}
                  dataMinima={inicio}
                />
              </View>

              {/* 3) Motivo */}
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

              {/* 4) Observação */}
              <CampoTexto
                rotulo="Observação (opcional)"
                value={obs}
                onChangeText={setObs}
                placeholder="Ex.: férias / licença de 15 dias"
              />

              <Botao
                titulo="Registrar ausência"
                aoPressionar={() => void registrar()}
                carregando={ocupado}
                desabilitado={!podeConfirmar}
              />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  cardAtalho: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: cores.superficie,
    borderRadius: raio.md,
    padding: espacamento.sm,
    marginBottom: espacamento.sm,
    borderWidth: 1,
    borderColor: cores.divisor,
  },
  icone: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: cores.primariaClara,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: espacamento.sm,
  },
  titulo: { ...tipografia.corpo, fontWeight: '600', color: cores.texto },
  meta: { ...tipografia.legenda, color: cores.textoSecundario, marginTop: 1 },
  fundo: {
    flex: 1,
    backgroundColor: 'rgba(10,37,64,0.45)',
    justifyContent: 'center',
    padding: espacamento.lg,
  },
  cartao: {
    backgroundColor: cores.superficie,
    borderRadius: raio.lg,
    padding: espacamento.lg,
    maxHeight: '86%',
    ...sombra.flutuante,
  },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.md,
    marginBottom: espacamento.md,
  },
  cabecalhoTitulo: { ...tipografia.subtitulo, color: cores.texto, flex: 1 },
  selecionado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    backgroundColor: cores.primariaClara,
    borderRadius: raio.md,
    paddingVertical: espacamento.sm,
    paddingHorizontal: espacamento.md,
  },
  selecionadoNome: {
    ...tipografia.corpo,
    fontWeight: '600',
    color: cores.texto,
    flex: 1,
  },
  trocar: { ...tipografia.rotulo, color: cores.primaria },
  opcao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    paddingVertical: espacamento.sm,
    paddingHorizontal: espacamento.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  opcaoNome: { ...tipografia.corpo, color: cores.texto, flex: 1 },
  vazio: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    paddingVertical: espacamento.sm,
  },
  rotulo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginBottom: espacamento.xs,
    marginTop: espacamento.xs,
  },
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
});

export default AusenciasAPrazoCard;
