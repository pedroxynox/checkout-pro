/**
 * Fila de "Não reconhecidos".
 *
 * Lista os códigos (matrícula/login do arquivo) que NÃO casam com nenhum
 * colaborador cadastrado, agregados no mês. Esses lançamentos JÁ somam no total
 * dos indicadores (gente de fora também conta) — aqui o gestor pode, se quiser:
 *  - Associar o código a um colaborador existente (conserta o histórico de
 *    forma retroativa), ou
 *  - Criar um cadastro novo a partir do código.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ApiError } from '../../api/client';
import { arrecadacaoService, colaboradoresService } from '../../api/services';
import { Colaborador, ItemNaoReconhecido } from '../../api/types';
import {
  Aviso,
  Botao,
  CampoTexto,
  Carregando,
  Cartao,
  EstadoVazio,
  MensagemErro,
  SeletorData,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { PropsTela } from '../../navigation/types';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { confirmar, notificar } from '../../utils/dialogos';
import { formatarMoeda, hojeISO } from '../../utils/formato';
import { ROTULO_TIPO_ARRECADACAO } from '../../utils/rotulos';

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Primeiro e último dia do mês que contém a data (ISO). */
function mesDe(dataISO: string): { inicio: string; fim: string } {
  const d = new Date(`${dataISO}T00:00:00.000Z`);
  const ini = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const fim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { inicio: iso(ini), fim: iso(fim) };
}

export function NaoReconhecidosScreen({
  navigation,
}: PropsTela<'NaoReconhecidos'>): React.ReactElement {
  const [dataRef, setDataRef] = useState(hojeISO());
  const { inicio, fim } = mesDe(dataRef);

  const req = useRequisicao(async () => {
    const [itens, colaboradores] = await Promise.all([
      arrecadacaoService.listarNaoReconhecidos(inicio, fim),
      colaboradoresService.listar({ ativo: true }),
    ]);
    return { itens, colaboradores };
  }, [inicio, fim]);

  const itens: ItemNaoReconhecido[] = useMemo(
    () => req.dados?.itens ?? [],
    [req.dados],
  );
  const colaboradores: Colaborador[] = useMemo(
    () => req.dados?.colaboradores ?? [],
    [req.dados],
  );

  // Código (matrícula) atualmente em modo "associar"; e busca do seletor.
  const [associando, setAssociando] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const totalGeral = useMemo(
    () => itens.reduce((s, i) => s + i.total, 0),
    [itens],
  );

  const candidatos = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const base = b
      ? colaboradores.filter(
          (c) =>
            c.nome.toLowerCase().includes(b) ||
            c.matricula.toLowerCase().includes(b),
        )
      : colaboradores;
    return base.slice(0, 8);
  }, [colaboradores, busca]);

  const abrirAssociar = (matricula: string) => {
    setAssociando((atual) => (atual === matricula ? null : matricula));
    setBusca('');
  };

  const associar = async (item: ItemNaoReconhecido, c: Colaborador) => {
    if (ocupado) return;
    const ok = await confirmar(
      'Associar lançamentos',
      `Atribuir o código "${item.matricula}" (${item.nome}) a ${c.nome}? ` +
        'Os lançamentos passados também passam a contar para essa pessoa.',
      'Associar',
    );
    if (!ok) return;
    setOcupado(true);
    try {
      await colaboradoresService.adicionarIdentificador(c.id, item.matricula);
      notificar('Associado', `${item.matricula} agora pertence a ${c.nome}.`);
      setAssociando(null);
      setBusca('');
      req.recarregar();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao associar.');
    } finally {
      setOcupado(false);
    }
  };

  const criar = (item: ItemNaoReconhecido) => {
    navigation.navigate('GestaoColaboradores', {
      matriculaInicial: item.matricula,
      nomeInicial: item.nome,
    });
  };

  return (
    <Tela aoAtualizar={req.recarregar} atualizando={req.atualizando}>
      <Cartao>
        <Text style={styles.titulo}>Não reconhecidos</Text>
        <Text style={styles.descricao}>
          Códigos dos arquivos que não casam com nenhum cadastro. Eles JÁ somam
          no total dos indicadores — aqui você pode associá-los a alguém
          (conserta o histórico) ou criar o cadastro.
        </Text>
        <SeletorData valor={dataRef} aoMudar={setDataRef} rotulo="Mês (referência)" />
      </Cartao>

      {req.carregando ? (
        <Carregando />
      ) : req.erro ? (
        <MensagemErro mensagem={req.erro} aoTentarNovamente={req.recarregar} />
      ) : itens.length === 0 ? (
        <EstadoVazio
          icone="checkmark-done-outline"
          titulo="Tudo reconhecido 🎉"
          descricao="Nenhum código solto neste mês. Todos os lançamentos têm cadastro."
        />
      ) : (
        <>
          <Aviso
            texto={`${itens.length} código(s) sem cadastro · ${formatarMoeda(totalGeral)} no mês. Já incluídos nos totais.`}
          />
          {itens.map((item) => {
            const aberto = associando === item.matricula;
            return (
              <Cartao key={item.matricula}>
                <View style={styles.itemTopo}>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemNome} numberOfLines={1}>
                      {item.nome || 'Sem nome'}
                    </Text>
                    <Text style={styles.itemMeta} numberOfLines={2}>
                      Cód. {item.matricula} · {item.lancamentos} lançamento(s)
                    </Text>
                    <Text style={styles.itemTipos} numberOfLines={2}>
                      {item.tipos
                        .map((t) => ROTULO_TIPO_ARRECADACAO[t] ?? t)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Text style={styles.itemValor}>{formatarMoeda(item.total)}</Text>
                </View>

                <View style={styles.acoes}>
                  <View style={styles.acaoBotao}>
                    <Botao
                      titulo={aberto ? 'Cancelar' : 'Associar'}
                      variante={aberto ? 'texto' : 'secundario'}
                      aoPressionar={() => abrirAssociar(item.matricula)}
                    />
                  </View>
                  <View style={styles.acaoBotao}>
                    <Botao
                      titulo="Criar cadastro"
                      variante="texto"
                      aoPressionar={() => criar(item)}
                    />
                  </View>
                </View>

                {aberto ? (
                  <View style={styles.picker}>
                    <CampoTexto
                      rotulo="Associar a quem?"
                      value={busca}
                      onChangeText={setBusca}
                      placeholder="Buscar por nome ou matrícula"
                    />
                    {candidatos.length === 0 ? (
                      <Text style={styles.semCand}>Nenhum colaborador encontrado.</Text>
                    ) : (
                      candidatos.map((c) => (
                        <TouchableOpacity
                          key={c.id}
                          activeOpacity={0.7}
                          disabled={ocupado}
                          onPress={() => void associar(item, c)}
                          style={styles.candLinha}
                        >
                          <Ionicons
                            name={c.genero === 'M' ? 'man' : 'woman'}
                            size={18}
                            color={cores.primaria}
                          />
                          <Text style={styles.candNome} numberOfLines={1}>
                            {c.nome}
                          </Text>
                          <Text style={styles.candMat}>{c.matricula}</Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                ) : null}
              </Cartao>
            );
          })}
        </>
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  titulo: { ...tipografia.secao, color: cores.texto },
  descricao: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
    marginBottom: espacamento.sm,
  },
  itemTopo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: espacamento.sm,
  },
  itemInfo: { flex: 1 },
  itemNome: { ...tipografia.corpo, fontWeight: '700', color: cores.texto },
  itemMeta: { ...tipografia.legenda, color: cores.textoSecundario, marginTop: 1 },
  itemTipos: { ...tipografia.legenda, color: cores.textoSecundario, marginTop: 1 },
  itemValor: { ...tipografia.corpo, fontWeight: '700', color: cores.primaria },
  acoes: {
    flexDirection: 'row',
    gap: espacamento.sm,
    marginTop: espacamento.xs,
  },
  acaoBotao: { flex: 1 },
  picker: {
    marginTop: espacamento.sm,
    paddingTop: espacamento.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
  },
  semCand: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    paddingVertical: espacamento.sm,
  },
  candLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    paddingVertical: espacamento.sm,
    paddingHorizontal: espacamento.xs,
    borderRadius: raio.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  candNome: { ...tipografia.corpo, color: cores.texto, flex: 1 },
  candMat: { ...tipografia.legenda, color: cores.textoSecundario },
});

export default NaoReconhecidosScreen;
