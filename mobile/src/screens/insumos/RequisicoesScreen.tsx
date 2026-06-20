/**
 * Tela de Requisições de insumos.
 *
 * Qualquer usuário com acesso a Insumos pode **solicitar** uma requisição
 * (insumo + quantidade + observação). Gerente/supervisor (INSUMOS_GERENCIAR)
 * pode **aprovar** (gera entrada no estoque) ou **negar**. Tudo medido em
 * quantidade.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { insumosService, requisicoesService } from '../../api/services';
import { InsumoResumo, Requisicao, StatusRequisicao } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
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
import { cores, espacamento, raio, tipografia } from '../../theme';
import { confirmar, notificar } from '../../utils/dialogos';
import { formatarDataHora, formatarNumero } from '../../utils/formato';

function comUnidade(qtd: number, unidade: string): string {
  const plural = qtd === 1 ? unidade : `${unidade}s`;
  return `${formatarNumero(qtd)} ${plural}`;
}

const ESTILO_STATUS: Record<
  StatusRequisicao,
  { rotulo: string; cor: string; fundo: string }
> = {
  PENDENTE: { rotulo: 'Pendente', cor: cores.amarelo, fundo: cores.amareloFundo },
  APROVADA: { rotulo: 'Aprovada', cor: cores.verde, fundo: cores.verdeFundo },
  NEGADA: { rotulo: 'Negada', cor: cores.vermelho, fundo: cores.vermelhoFundo },
};

export function RequisicoesScreen(): React.ReactElement {
  const { podeAcessar } = useAuth();
  const podeDecidir = podeAcessar('INSUMOS_GERENCIAR');

  const [insumos, setInsumos] = useState<InsumoResumo[]>([]);
  const [requisicoes, setRequisicoes] = useState<Requisicao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [insumoSel, setInsumoSel] = useState<string | null>(null);
  const [quantidade, setQuantidade] = useState('');
  const [observacao, setObservacao] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [decidindo, setDecidindo] = useState<string | null>(null);

  const carregar = useCallback(async (ehAtualizacao = false) => {
    if (ehAtualizacao) setAtualizando(true);
    else setCarregando(true);
    try {
      const [listaInsumos, listaReqs] = await Promise.all([
        insumosService.listar(),
        requisicoesService.listar(),
      ]);
      setInsumos(listaInsumos);
      setRequisicoes(listaReqs);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar requisições.');
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const solicitar = async () => {
    if (!insumoSel) {
      notificar('Selecione o insumo', 'Escolha o insumo a requisitar.');
      return;
    }
    const q = Number(quantidade);
    if (!Number.isInteger(q) || q <= 0) {
      notificar('Quantidade inválida', 'Informe um inteiro maior que zero.');
      return;
    }
    setOcupado(true);
    try {
      await requisicoesService.criar(insumoSel, q, observacao.trim() || undefined);
      setQuantidade('');
      setObservacao('');
      setInsumoSel(null);
      await carregar(true);
      notificar('Requisição enviada', 'O gestor foi notificado para aprovar ou negar.');
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao solicitar.');
    } finally {
      setOcupado(false);
    }
  };

  const aprovar = async (req: Requisicao) => {
    const ok = await confirmar(
      'Aprovar requisição',
      `Aprovar ${comUnidade(req.quantidade, req.unidade)} de ${req.insumoNome}? A quantidade será somada ao estoque.`,
      'Aprovar',
    );
    if (!ok) return;
    setDecidindo(req.id);
    try {
      await requisicoesService.aprovar(req.id);
      await carregar(true);
      notificar('Requisição aprovada', 'A entrada foi somada ao estoque.');
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao aprovar.');
    } finally {
      setDecidindo(null);
    }
  };

  const negar = async (req: Requisicao) => {
    const ok = await confirmar(
      'Negar requisição',
      `Negar a requisição de ${comUnidade(req.quantidade, req.unidade)} de ${req.insumoNome}?`,
      'Negar',
    );
    if (!ok) return;
    setDecidindo(req.id);
    try {
      await requisicoesService.negar(req.id);
      await carregar(true);
      notificar('Requisição negada', 'O solicitante foi notificado.');
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao negar.');
    } finally {
      setDecidindo(null);
    }
  };

  return (
    <Tela aoAtualizar={() => void carregar(true)} atualizando={atualizando}>
      <Cartao titulo="Solicitar requisição">
        <Text style={styles.rotulo}>Insumo</Text>
        {insumos.length === 0 ? (
          <Text style={styles.vazioInline}>Nenhum insumo disponível.</Text>
        ) : (
          <View style={styles.chips}>
            {insumos.map((i) => {
              const ativo = i.id === insumoSel;
              return (
                <Pressable
                  key={i.id}
                  onPress={() => setInsumoSel(i.id)}
                  style={[styles.chip, ativo && styles.chipAtivo]}
                >
                  <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]}>
                    {i.nome}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
        <CampoTexto
          rotulo="Quantidade (na unidade do insumo)"
          keyboardType="number-pad"
          value={quantidade}
          onChangeText={setQuantidade}
          placeholder="0"
        />
        <CampoTexto
          rotulo="Observação (opcional)"
          value={observacao}
          onChangeText={setObservacao}
          placeholder="Ex.: para o turno da tarde"
        />
        <Botao titulo="Solicitar" aoPressionar={solicitar} carregando={ocupado} />
      </Cartao>

      <Text style={styles.tituloSecao}>Requisições</Text>
      {carregando ? (
        <Carregando />
      ) : erro ? (
        <MensagemErro mensagem={erro} aoTentarNovamente={() => void carregar()} />
      ) : requisicoes.length === 0 ? (
        <EstadoVazio
          icone="file-tray-outline"
          titulo="Sem requisições"
          descricao="As requisições solicitadas aparecerão aqui."
        />
      ) : (
        requisicoes.map((r) => {
          const st = ESTILO_STATUS[r.status];
          return (
            <Cartao key={r.id}>
              <View style={styles.cabecalho}>
                <View style={styles.flex1}>
                  <Text style={styles.nome}>{r.insumoNome}</Text>
                  <Text style={styles.detalhe}>{comUnidade(r.quantidade, r.unidade)}</Text>
                </View>
                <Selo texto={st.rotulo} cor={st.cor} fundo={st.fundo} />
              </View>
              {r.observacao ? (
                <Text style={styles.obs}>“{r.observacao}”</Text>
              ) : null}
              <Text style={styles.meta}>
                {r.solicitanteNome ?? 'Solicitante'} · {formatarDataHora(r.criadaEm)}
              </Text>
              {r.status === 'NEGADA' && r.motivo ? (
                <Text style={styles.motivo}>Motivo: {r.motivo}</Text>
              ) : null}
              {r.status !== 'PENDENTE' && r.decididaPorNome ? (
                <Text style={styles.meta}>
                  {r.status === 'APROVADA' ? 'Aprovada' : 'Negada'} por {r.decididaPorNome}
                </Text>
              ) : null}

              {podeDecidir && r.status === 'PENDENTE' ? (
                <View style={styles.acoes}>
                  <View style={styles.flex1}>
                    <Botao
                      titulo="Aprovar"
                      aoPressionar={() => aprovar(r)}
                      carregando={decidindo === r.id}
                    />
                  </View>
                  <View style={styles.flex1}>
                    <Botao
                      titulo="Negar"
                      variante="perigo"
                      aoPressionar={() => negar(r)}
                      carregando={decidindo === r.id}
                    />
                  </View>
                </View>
              ) : null}
            </Cartao>
          );
        })
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  rotulo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginBottom: espacamento.xs,
  },
  vazioInline: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.sm,
  },
  tituloSecao: {
    ...tipografia.secao,
    color: cores.texto,
    marginTop: espacamento.sm,
    marginBottom: espacamento.md,
  },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  flex1: { flex: 1 },
  nome: {
    ...tipografia.corpo,
    fontWeight: '700',
    color: cores.texto,
  },
  detalhe: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  obs: {
    ...tipografia.corpo,
    color: cores.texto,
    fontStyle: 'italic',
    marginTop: espacamento.sm,
  },
  meta: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.xs,
  },
  motivo: {
    ...tipografia.legenda,
    color: cores.vermelho,
    marginTop: espacamento.xs,
  },
  acoes: {
    flexDirection: 'row',
    gap: espacamento.sm,
    marginTop: espacamento.md,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.sm,
    marginBottom: espacamento.sm,
  },
  chip: {
    paddingVertical: espacamento.xs,
    paddingHorizontal: espacamento.md,
    borderRadius: raio.pill,
    backgroundColor: cores.superficieAlternativa,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  chipAtivo: {
    backgroundColor: cores.primariaClara,
    borderColor: cores.primaria,
  },
  chipTexto: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  chipTextoAtivo: {
    color: cores.primaria,
    fontWeight: '700',
  },
});

export default RequisicoesScreen;
