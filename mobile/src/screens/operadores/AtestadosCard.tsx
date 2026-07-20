/**
 * "Atestados" — card + modal na seção de Escalas.
 *
 * Permite LANÇAR um atestado médico de um colaborador por um período, com o CID
 * (autocompletar do catálogo CID-10) ou explicitamente SEM CID. O backend cria
 * o documento e uma falta JUSTIFICADA (identificada como ATESTADO) em cada dia
 * do período, e avisa a gestão quando o mesmo CID passa de 15 dias em 60
 * (regra do INSS). Uso típico: gerente/supervisor.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
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
import {
  atestadosService,
  colaboradoresService,
  EntradaCid,
} from '../../api/services';
import { Colaborador } from '../../api/types';
import { Botao, CampoTexto, SeletorData } from '../../components';
import { useConfigSistema } from '../../config/ConfigSistemaContext';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, raio, sombra, tipografia } from '../../theme';
import { notificar } from '../../utils/dialogos';
import { hojeISO } from '../../utils/formato';

/** Máximo de colaboradores mostrados na busca. */
const MAX_RESULTADOS = 8;

export function AtestadosCard({
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
  const [semCid, setSemCid] = useState(false);
  const [cidTexto, setCidTexto] = useState('');
  const [cidSelecionado, setCidSelecionado] = useState<string | null>(null);
  const [cidResultados, setCidResultados] = useState<EntradaCid[]>([]);
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

  // Autocompletar do CID: busca no servidor quando o texto muda (debounce leve).
  useEffect(() => {
    if (semCid) {
      setCidResultados([]);
      return;
    }
    const termo = cidTexto.trim();
    // Se já selecionou (texto casa com "CODIGO — ..."), não reconsulta.
    if (cidSelecionado && cidTexto.startsWith(cidSelecionado)) {
      setCidResultados([]);
      return;
    }
    if (termo.length < 1) {
      setCidResultados([]);
      return;
    }
    let vivo = true;
    const t = setTimeout(() => {
      atestadosService
        .buscarCid(termo)
        .then((r) => {
          if (vivo) setCidResultados(r.slice(0, 8));
        })
        .catch(() => {
          if (vivo) setCidResultados([]);
        });
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [cidTexto, semCid, cidSelecionado]);

  const resetar = (): void => {
    setBusca('');
    setSelId(null);
    setSelNome('');
    setInicio(hojeISO());
    setFim(hojeISO());
    setSemCid(false);
    setCidTexto('');
    setCidSelecionado(null);
    setCidResultados([]);
    setObs('');
  };

  const fechar = (): void => setAberto(false);

  const mudarInicio = (iso: string): void => {
    setInicio(iso);
    if (iso > fim) setFim(iso);
  };

  const cidInformado = semCid ? '' : (cidSelecionado ?? cidTexto).trim();
  const podeConfirmar =
    !!selId && (semCid || cidInformado.length > 0) && fim >= inicio && !ocupado;

  const escolherCid = (e: EntradaCid): void => {
    setCidSelecionado(e.codigo);
    setCidTexto(`${e.codigo} — ${e.descricao}`);
    setCidResultados([]);
  };

  const registrar = async (): Promise<void> => {
    if (!selId) return;
    setOcupado(true);
    try {
      const r = await atestadosService.lancar({
        colaboradorId: selId,
        inicio,
        fim,
        cid: semCid ? undefined : cidInformado || undefined,
        semCid: semCid || undefined,
        observacao: obs.trim() || undefined,
      });
      const cidTxt = r.cid ? `CID ${r.cid}` : 'sem CID';
      notificar(
        'Atestado lançado',
        `${selNome}: ${r.dias} dia(s) de atestado (${cidTxt}).` +
          (r.ultrapassaInss
            ? `\n\n⚠️ Já são ${r.totalDiasMesmoCid} dias com o mesmo CID em 60 dias — encaminhar ao INSS.`
            : ''),
      );
      fechar();
      resetar();
      aoRegistrado();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao lançar o atestado.');
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
        accessibilityLabel="Abrir atestados"
      >
        <View style={styles.icone}>
          <Ionicons name="medkit-outline" size={20} color={cores.primaria} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.titulo}>Atestados</Text>
          <Text style={styles.meta} numberOfLines={1}>
            Lançar atestado médico com CID (falta identificada como atestado)
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={cores.textoSecundario} />
      </TouchableOpacity>

      <Modal visible={aberto} transparent animationType="fade" onRequestClose={fechar}>
        <Pressable style={styles.fundo} onPress={fechar}>
          <Pressable style={styles.cartao} onPress={() => {}}>
            <View style={styles.cabecalho}>
              <TouchableOpacity onPress={fechar} hitSlop={10} accessibilityLabel="Fechar">
                <Ionicons name="close" size={24} color={cores.texto} />
              </TouchableOpacity>
              <Text style={styles.cabecalhoTitulo} numberOfLines={1}>
                Lançar atestado
              </Text>
              <View style={{ width: 24 }} />
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: espacamento.sm }}
            >
              {/* 1) Colaborador */}
              {selId ? (
                <View style={styles.selecionado}>
                  <Ionicons name="person-circle-outline" size={22} color={cores.primaria} />
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
                    autoCorrect={false}
                  />
                  {listaFiltrada.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={styles.opcao}
                      onPress={() => {
                        setSelId(c.id);
                        setSelNome(c.nome);
                        setBusca('');
                      }}
                    >
                      <Text style={styles.opcaoNome}>{c.nome}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {/* 2) Período */}
              <View style={{ marginTop: espacamento.sm }}>
                <SeletorData rotulo="Início" valor={inicio} aoMudar={mudarInicio} dataMinima={dataInicial} />
                <SeletorData rotulo="Fim" valor={fim} aoMudar={setFim} dataMinima={inicio} />
              </View>

              {/* 3) CID */}
              <View style={styles.cidCabecalho}>
                <Text style={styles.rotulo}>CID</Text>
                <Pressable
                  onPress={() => {
                    setSemCid((s) => !s);
                    setCidTexto('');
                    setCidSelecionado(null);
                    setCidResultados([]);
                  }}
                  style={styles.semCidToggle}
                  hitSlop={6}
                >
                  <Ionicons
                    name={semCid ? 'checkbox' : 'square-outline'}
                    size={18}
                    color={semCid ? cores.primaria : cores.textoSecundario}
                  />
                  <Text style={[styles.semCidTexto, semCid && { color: cores.primaria }]}>
                    Sem CID
                  </Text>
                </Pressable>
              </View>

              {!semCid ? (
                <>
                  <CampoTexto
                    rotulo=""
                    value={cidTexto}
                    onChangeText={(t) => {
                      setCidTexto(t);
                      setCidSelecionado(null);
                    }}
                    placeholder="Código ou doença (ex.: J11, lombalgia)"
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                  {cidResultados.map((e) => (
                    <TouchableOpacity key={e.codigo} style={styles.opcao} onPress={() => escolherCid(e)}>
                      <Text style={styles.opcaoNome}>
                        <Text style={{ fontWeight: '700' }}>{e.codigo}</Text> — {e.descricao}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </>
              ) : null}

              {/* 4) Observação */}
              <CampoTexto
                rotulo="Observação (opcional)"
                value={obs}
                onChangeText={setObs}
                placeholder="Ex.: atestado de 3 dias"
              />

              <Botao
                titulo="Lançar atestado"
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
  cabecalhoTitulo: { ...tipografia.subtitulo, color: cores.texto, flex: 1, textAlign: 'center' },
  selecionado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    backgroundColor: cores.primariaClara,
    borderRadius: raio.md,
    padding: espacamento.sm,
  },
  selecionadoNome: { ...tipografia.corpo, color: cores.texto, flex: 1, fontWeight: '600' },
  trocar: { ...tipografia.legenda, color: cores.primaria, fontWeight: '700' },
  opcao: {
    paddingVertical: espacamento.sm,
    paddingHorizontal: espacamento.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  opcaoNome: { ...tipografia.corpo, color: cores.texto },
  rotulo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginBottom: espacamento.xs,
  },
  cidCabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: espacamento.sm,
  },
  semCidToggle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  semCidTexto: { ...tipografia.legenda, color: cores.textoSecundario },
});

export default AtestadosCard;
