/**
 * Tela de Operadores e Ausências (Req 6.1, 6.2, 6.3, 6.6).
 *
 * Permite cadastrar/editar operadores, registrar/remover ausências e gerar o
 * relatório de ausências por período. Exibe também a contagem de operadores por
 * turno (abertura, intermediário, fechamento) e o total do dia selecionado,
 * derivada do horário de entrada informado para cada operador trabalhando.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { operadoresService } from '../../api/services';
import { ContagemTurno, OperadorEscalaDia } from '../../api/types';
import {
  Aviso,
  Botao,
  CampoTexto,
  Carregando,
  Cartao,
  EstadoVazio,
  LinhaInfo,
  MensagemErro,
  SeletorData,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, tipografia } from '../../theme';
import { formatarData, hojeISO } from '../../utils/formato';

interface EscalaLinha {
  entrada: string;
  folga: boolean;
  ferias: boolean;
  desligado: boolean;
}

function inicioDoMesISO(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

export function OperadoresScreen(): React.ReactElement {
  const operadores = useRequisicao(() => operadoresService.listar(), []);

  const [dia, setDia] = useState(hojeISO());
  const [novoNome, setNovoNome] = useState('');
  const [salvando, setSalvando] = useState(false);

  // Edição de nome
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nomeEditado, setNomeEditado] = useState('');

  // Escala do dia (para contagem por turno) por operador
  const [escala, setEscala] = useState<Record<string, EscalaLinha>>({});
  const [contagem, setContagem] = useState<ContagemTurno | null>(null);
  const [calculando, setCalculando] = useState(false);

  // Ausências registradas nesta sessão (para permitir remoção por id)
  const [ausencias, setAusencias] = useState<
    { id: string; pessoaId: string; data: string }[]
  >([]);

  // Relatório
  const [inicio, setInicio] = useState(inicioDoMesISO());
  const [fim, setFim] = useState(hojeISO());
  const relatorio = useRequisicao(
    () => operadoresService.relatorioAusencias(inicio, fim),
    [inicio, fim],
  );

  const nomePorId = useMemo(() => {
    const mapa = new Map<string, string>();
    (operadores.dados ?? []).forEach((o) => mapa.set(o.id, o.nome));
    return mapa;
  }, [operadores.dados]);

  const linha = (id: string): EscalaLinha =>
    escala[id] ?? { entrada: '', folga: false, ferias: false, desligado: false };

  const atualizarLinha = (id: string, parcial: Partial<EscalaLinha>) =>
    setEscala((atual) => ({ ...atual, [id]: { ...linha(id), ...parcial } }));

  const cadastrar = async () => {
    if (!novoNome.trim()) {
      Alert.alert('Nome obrigatório', 'Informe o nome do operador.');
      return;
    }
    setSalvando(true);
    try {
      await operadoresService.cadastrar(novoNome.trim());
      setNovoNome('');
      operadores.recarregar();
    } catch (e) {
      Alert.alert('Erro', e instanceof ApiError ? e.message : 'Falha ao cadastrar.');
    } finally {
      setSalvando(false);
    }
  };

  const salvarEdicao = async () => {
    if (!editandoId || !nomeEditado.trim()) return;
    try {
      await operadoresService.editarNome(editandoId, nomeEditado.trim());
      setEditandoId(null);
      setNomeEditado('');
      operadores.recarregar();
    } catch (e) {
      Alert.alert('Erro', e instanceof ApiError ? e.message : 'Falha ao editar.');
    }
  };

  const registrarAusencia = async (pessoaId: string) => {
    try {
      const a = await operadoresService.registrarAusencia(pessoaId, dia);
      setAusencias((atual) => [
        { id: a.id, pessoaId, data: dia },
        ...atual,
      ]);
      relatorio.recarregar();
      Alert.alert('Ausência registrada', `${nomePorId.get(pessoaId) ?? pessoaId} em ${formatarData(dia)}.`);
    } catch (e) {
      Alert.alert('Erro', e instanceof ApiError ? e.message : 'Falha ao registrar ausência.');
    }
  };

  const removerAusencia = async (id: string) => {
    try {
      await operadoresService.removerAusencia(id);
      setAusencias((atual) => atual.filter((a) => a.id !== id));
      relatorio.recarregar();
    } catch (e) {
      Alert.alert('Erro', e instanceof ApiError ? e.message : 'Falha ao remover ausência.');
    }
  };

  const calcularContagem = async () => {
    const lista: OperadorEscalaDia[] = (operadores.dados ?? []).map((o) => {
      const l = linha(o.id);
      return {
        operadorId: o.id,
        entrada: l.entrada.trim() || null,
        folga: l.folga,
        ferias: l.ferias,
        desligado: l.desligado,
      };
    });
    setCalculando(true);
    try {
      const resultado = await operadoresService.contagemPorTurno(lista);
      setContagem(resultado);
    } catch (e) {
      Alert.alert('Erro', e instanceof ApiError ? e.message : 'Falha ao calcular contagem.');
    } finally {
      setCalculando(false);
    }
  };

  return (
    <Tela aoAtualizar={operadores.recarregar} atualizando={operadores.atualizando}>
      <SeletorData valor={dia} aoMudar={setDia} rotulo="Dia selecionado" />

      <Cartao titulo="Contagem por turno">
        {contagem ? (
          <>
            <LinhaInfo rotulo="Abertura" valor={contagem.abertura} />
            <LinhaInfo rotulo="Intermediário" valor={contagem.intermediario} />
            <LinhaInfo rotulo="Fechamento" valor={contagem.fechamento} />
            <LinhaInfo rotulo="Total trabalhando" valor={contagem.total} />
          </>
        ) : (
          <Aviso texto="Informe o horário de entrada (HH:mm) de cada operador trabalhando abaixo e calcule a contagem do dia." />
        )}
        <Botao
          titulo="Calcular contagem do dia"
          aoPressionar={calcularContagem}
          carregando={calculando}
          estilo={{ marginTop: espacamento.sm }}
        />
      </Cartao>

      <Cartao titulo="Cadastrar operador">
        <CampoTexto
          rotulo="Nome"
          value={novoNome}
          onChangeText={setNovoNome}
          placeholder="Nome do operador"
        />
        <Botao titulo="Cadastrar" aoPressionar={cadastrar} carregando={salvando} />
      </Cartao>

      <Text style={styles.tituloSecao}>Operadores</Text>
      {operadores.carregando ? (
        <Carregando />
      ) : operadores.erro ? (
        <MensagemErro mensagem={operadores.erro} aoTentarNovamente={operadores.recarregar} />
      ) : !operadores.dados || operadores.dados.length === 0 ? (
        <EstadoVazio icone="id-card-outline" titulo="Nenhum operador cadastrado" />
      ) : (
        operadores.dados.map((op) => {
          const l = linha(op.id);
          const editando = editandoId === op.id;
          return (
            <Cartao key={op.id}>
              {editando ? (
                <View style={styles.edicao}>
                  <CampoTexto rotulo="Nome" value={nomeEditado} onChangeText={setNomeEditado} />
                  <View style={styles.botoesLinha}>
                    <Botao titulo="Salvar" aoPressionar={salvarEdicao} estilo={styles.botaoFlex} />
                    <Botao
                      titulo="Cancelar"
                      variante="texto"
                      aoPressionar={() => setEditandoId(null)}
                      estilo={styles.botaoFlex}
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.opCabecalho}>
                  <Text style={styles.opNome} numberOfLines={1}>
                    {op.nome}
                  </Text>
                  <View style={styles.opAcoes}>
                    <Ionicons
                      name="create-outline"
                      size={20}
                      color={cores.primaria}
                      onPress={() => {
                        setEditandoId(op.id);
                        setNomeEditado(op.nome);
                      }}
                    />
                    <Ionicons
                      name="calendar-clear-outline"
                      size={20}
                      color={cores.amarelo}
                      onPress={() => void registrarAusencia(op.id)}
                    />
                  </View>
                </View>
              )}

              <View style={styles.escalaLinha}>
                <CampoTexto
                  rotulo="Entrada (HH:mm)"
                  value={l.entrada}
                  onChangeText={(t) => atualizarLinha(op.id, { entrada: t })}
                  placeholder="08:00"
                  style={styles.entradaInput}
                />
              </View>
              <View style={styles.toggles}>
                {(['folga', 'ferias', 'desligado'] as const).map((flag) => (
                  <View key={flag} style={styles.toggle}>
                    <Text style={styles.toggleRotulo}>
                      {flag === 'folga' ? 'Folga' : flag === 'ferias' ? 'Férias' : 'Deslig.'}
                    </Text>
                    <Switch
                      value={l[flag]}
                      onValueChange={(v) => atualizarLinha(op.id, { [flag]: v })}
                      trackColor={{ true: cores.primaria }}
                    />
                  </View>
                ))}
              </View>
            </Cartao>
          );
        })
      )}

      {ausencias.length > 0 ? (
        <Cartao titulo="Ausências registradas (nesta sessão)">
          {ausencias.map((a) => (
            <View key={a.id} style={styles.ausenciaLinha}>
              <Text style={styles.ausenciaTexto}>
                {nomePorId.get(a.pessoaId) ?? a.pessoaId} · {formatarData(a.data)}
              </Text>
              <Ionicons
                name="trash-outline"
                size={20}
                color={cores.erro}
                onPress={() => void removerAusencia(a.id)}
              />
            </View>
          ))}
        </Cartao>
      ) : null}

      <Cartao titulo="Relatório de ausências">
        <SeletorData valor={inicio} aoMudar={setInicio} rotulo="Início" />
        <SeletorData valor={fim} aoMudar={setFim} rotulo="Fim" />
        {relatorio.carregando ? (
          <Carregando />
        ) : relatorio.erro ? (
          <MensagemErro mensagem={relatorio.erro} aoTentarNovamente={relatorio.recarregar} />
        ) : !relatorio.dados || relatorio.dados.length === 0 ? (
          <EstadoVazio
            icone="checkmark-done-outline"
            titulo="Sem ausências"
            descricao="Nenhuma ausência no período."
          />
        ) : (
          relatorio.dados.map((item) => (
            <LinhaInfo
              key={item.pessoaId}
              rotulo={nomePorId.get(item.pessoaId) ?? item.pessoaId}
              valor={`${item.quantidade} ausência(s)`}
            />
          ))
        )}
      </Cartao>
    </Tela>
  );
}

const styles = StyleSheet.create({
  tituloSecao: {
    ...tipografia.secao,
    color: cores.texto,
    marginTop: espacamento.sm,
    marginBottom: espacamento.md,
  },
  opCabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  opNome: {
    ...tipografia.corpo,
    fontWeight: '700',
    color: cores.texto,
    flex: 1,
    paddingRight: espacamento.sm,
  },
  opAcoes: {
    flexDirection: 'row',
    gap: espacamento.md,
    alignItems: 'center',
  },
  escalaLinha: {
    marginTop: espacamento.sm,
  },
  entradaInput: {
    maxWidth: 140,
  },
  toggles: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  toggle: {
    alignItems: 'center',
  },
  toggleRotulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.xs,
  },
  edicao: {
    marginBottom: espacamento.sm,
  },
  botoesLinha: {
    flexDirection: 'row',
    gap: espacamento.sm,
  },
  botaoFlex: {
    flex: 1,
  },
  ausenciaLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: espacamento.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  ausenciaTexto: {
    ...tipografia.corpo,
    color: cores.texto,
    flex: 1,
  },
});

export default OperadoresScreen;
