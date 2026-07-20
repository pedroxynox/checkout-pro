/**
 * "Férias" — card + modal na seção de Escalas.
 *
 * Permite colocar um colaborador de FÉRIAS por um período (início/fim). É uma
 * inativação NÃO rígida: enquanto vigente, o colaborador some da escala do dia
 * e não gera falta automática, mas continua ativo (não é desligamento). O modal
 * também lista as férias já cadastradas e permite cancelá-las. Uso típico:
 * gerente/supervisor.
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
import { colaboradoresService, feriasService } from '../../api/services';
import { Colaborador, FeriasDetalhada } from '../../api/types';
import { Botao, CampoTexto, Carregando, SeletorData } from '../../components';
import { useConfigSistema } from '../../config/ConfigSistemaContext';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, raio, sombra, tipografia } from '../../theme';
import { confirmar, notificar } from '../../utils/dialogos';
import { hojeISO } from '../../utils/formato';

/** Máximo de colaboradores mostrados na busca (evita listas enormes). */
const MAX_RESULTADOS = 8;

/** Formata "yyyy-mm-dd" como "dd/mm". */
function ddmm(iso: string): string {
  const [, mm, dd] = iso.slice(0, 10).split('-');
  return `${dd}/${mm}`;
}

export function FeriasCard({
  aoMudar,
}: {
  aoMudar: () => void;
}): React.ReactElement {
  const { dataInicial } = useConfigSistema();
  const [aberto, setAberto] = useState(false);

  const colaboradores = useRequisicao<Colaborador[]>(
    () => colaboradoresService.listar({ ativo: true }),
    [],
  );
  const ferias = useRequisicao<FeriasDetalhada[]>(
    () => feriasService.listar(),
    [],
  );

  const [busca, setBusca] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const [selNome, setSelNome] = useState('');
  const [inicio, setInicio] = useState(hojeISO());
  const [fim, setFim] = useState(hojeISO());
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
    setObs('');
  };

  const fechar = (): void => setAberto(false);

  const mudarInicio = (iso: string): void => {
    setInicio(iso);
    if (iso > fim) setFim(iso);
  };

  const recarregar = (): void => {
    ferias.recarregar();
    aoMudar();
  };

  const podeConfirmar = !!selId && fim >= inicio && !ocupado;

  const registrar = async (): Promise<void> => {
    if (!selId) return;
    setOcupado(true);
    try {
      await feriasService.registrar({
        colaboradorId: selId,
        inicio,
        fim,
        observacao: obs.trim() || undefined,
      });
      notificar(
        'Férias registradas',
        `${selNome}: ${ddmm(inicio)} a ${ddmm(fim)}.`,
      );
      resetar();
      recarregar();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao registrar.');
    } finally {
      setOcupado(false);
    }
  };

  const cancelar = async (f: FeriasDetalhada): Promise<void> => {
    const ok = await confirmar(
      'Cancelar férias',
      `Cancelar as férias de ${f.nome} (${ddmm(f.inicio)} a ${ddmm(f.fim)})?`,
    );
    if (!ok) return;
    try {
      await feriasService.remover(f.id);
      notificar('Férias canceladas', `${f.nome} volta à escala normalmente.`);
      recarregar();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao cancelar.');
    }
  };

  const lista = ferias.dados ?? [];

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setAberto(true)}
        style={styles.cardAtalho}
        accessibilityRole="button"
        accessibilityLabel="Abrir férias"
      >
        <View style={styles.icone}>
          <Ionicons name="airplane-outline" size={20} color={cores.primaria} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.titulo}>Férias</Text>
          <Text style={styles.meta} numberOfLines={1}>
            Colocar um colaborador de férias (sai da escala, sem falta)
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
          <Pressable style={styles.cartao} onPress={() => {}}>
            <View style={styles.cabecalho}>
              <TouchableOpacity onPress={fechar} hitSlop={10} accessibilityLabel="Voltar">
                <Ionicons name="arrow-back" size={22} color={cores.texto} />
              </TouchableOpacity>
              <Text style={styles.cabecalhoTitulo} numberOfLines={1}>
                Férias
              </Text>
              <TouchableOpacity onPress={fechar} hitSlop={10} accessibilityLabel="Fechar">
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

              {/* 3) Observação */}
              <CampoTexto
                rotulo="Observação (opcional)"
                value={obs}
                onChangeText={setObs}
                placeholder="Ex.: férias 30 dias"
              />

              <Botao
                titulo="Registrar férias"
                aoPressionar={() => void registrar()}
                carregando={ocupado}
                desabilitado={!podeConfirmar}
              />

              {/* Lista de férias cadastradas */}
              <Text style={styles.secao}>Férias cadastradas</Text>
              {ferias.carregando ? (
                <Carregando />
              ) : lista.length === 0 ? (
                <Text style={styles.vazio}>Nenhuma férias cadastrada.</Text>
              ) : (
                lista.map((f) => (
                  <View key={f.id} style={styles.itemFerias}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemNome} numberOfLines={1}>
                        {f.nome}
                        {f.vigente ? '  •  em férias' : ''}
                      </Text>
                      <Text style={styles.itemMeta}>
                        {ddmm(f.inicio)} a {ddmm(f.fim)}
                        {f.observacao ? ` — ${f.observacao}` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => void cancelar(f)}
                      hitSlop={8}
                      accessibilityLabel={`Cancelar férias de ${f.nome}`}
                    >
                      <Text style={styles.cancelar}>Cancelar</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
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
  secao: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginTop: espacamento.md,
    marginBottom: espacamento.xs,
  },
  itemFerias: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    paddingVertical: espacamento.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  itemNome: { ...tipografia.corpo, fontWeight: '600', color: cores.texto },
  itemMeta: { ...tipografia.legenda, color: cores.textoSecundario, marginTop: 1 },
  cancelar: { ...tipografia.rotulo, color: cores.erro },
});

export default FeriasCard;
