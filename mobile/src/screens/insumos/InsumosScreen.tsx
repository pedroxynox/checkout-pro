/**
 * Tela de Insumos — "Almoxarifado do Setor" (Req 3.1–3.3).
 *
 * Painel vivo dos insumos do setor (Sacolas, Bobina, Pano, Álcool), medido em
 * QUANTIDADE (nunca em R$). Para cada insumo mostra: saldo em tempo real na
 * unidade base + equivalente em embalagens, semáforo de estoque baixo, consumo
 * da semana e previsão de ruptura ("dura ~X semanas"). Permite registrar
 * consumo e retirada de fardo por código de barras.
 *
 * A lista de insumos vem do backend (`GET /insumos`), compartilhada entre todos
 * os dispositivos/usuários.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { insumosService } from '../../api/services';
import { InsumoResumo } from '../../api/types';
import {
  Botao,
  CampoTexto,
  Carregando,
  Cartao,
  EstadoVazio,
  LeitorCodigoBarras,
  MensagemErro,
  Selo,
  Tela,
} from '../../components';
import { PropsTela } from '../../navigation/types';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { notificar } from '../../utils/dialogos';
import { formatarNumero } from '../../utils/formato';
import { ROTULO_CATEGORIA_INSUMO } from '../../utils/rotulos';

/** Pluraliza a unidade base de forma simples (sacola→sacolas, metro→metros). */
function comUnidade(qtd: number, unidade: string): string {
  const plural = qtd === 1 ? unidade : `${unidade}s`;
  return `${formatarNumero(qtd)} ${plural}`;
}

/** Equivalente em embalagens (ex.: "≈ 5 rolos" / "≈ 1,2 caixa"). */
function emEmbalagens(insumo: InsumoResumo, qtd: number): string | null {
  if (insumo.fatorEmbalagem <= 1 || qtd <= 0) {
    return null;
  }
  const n = qtd / insumo.fatorEmbalagem;
  const arredondado = Math.round(n * 10) / 10;
  return `≈ ${formatarNumero(arredondado)} ${insumo.embalagem}`;
}

function SeletorInsumo({
  insumos,
  selecionado,
  aoSelecionar,
}: {
  insumos: InsumoResumo[];
  selecionado: string | null;
  aoSelecionar: (id: string) => void;
}): React.ReactElement {
  if (insumos.length === 0) {
    return <Text style={styles.vazioInline}>Nenhum insumo disponível.</Text>;
  }
  return (
    <View style={styles.chips}>
      {insumos.map((i) => {
        const ativo = i.id === selecionado;
        return (
          <Pressable
            key={i.id}
            onPress={() => aoSelecionar(i.id)}
            style={[styles.chip, ativo && styles.chipAtivo]}
          >
            <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]}>
              {i.nome}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function InsumosScreen({
  navigation,
}: PropsTela<'Insumos'>): React.ReactElement {
  const [insumos, setInsumos] = useState<InsumoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Retirada de fardo
  const [insumoFardo, setInsumoFardo] = useState<string | null>(null);
  const [scannerVisivel, setScannerVisivel] = useState(false);

  // Consumo
  const [insumoConsumo, setInsumoConsumo] = useState<string | null>(null);
  const [pdv, setPdv] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [consumindo, setConsumindo] = useState(false);

  const carregar = useCallback(async (ehAtualizacao = false) => {
    if (ehAtualizacao) setAtualizando(true);
    else setCarregando(true);
    try {
      const lista = await insumosService.listar();
      setInsumos(lista);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar os insumos.');
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const retirarFardo = async (codigoBarras: string) => {
    setScannerVisivel(false);
    if (!insumoFardo) {
      notificar('Selecione o insumo', 'Escolha o insumo de sacolas do fardo.');
      return;
    }
    try {
      const { saldo } = await insumosService.retirarFardo(codigoBarras, insumoFardo);
      await carregar(true);
      notificar('Fardo registrado', `Novo saldo de sacolas: ${formatarNumero(saldo)}.`);
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao registrar a retirada.');
    }
  };

  const registrarConsumo = async () => {
    if (!insumoConsumo) {
      notificar('Selecione o insumo', 'Escolha o insumo a consumir.');
      return;
    }
    const q = Number(quantidade);
    if (!Number.isInteger(q) || q <= 0) {
      notificar('Quantidade inválida', 'Informe um inteiro maior que zero.');
      return;
    }
    const insumo = insumos.find((i) => i.id === insumoConsumo);
    setConsumindo(true);
    try {
      if (insumo?.categoria === 'BOBINA') {
        await insumosService.consumirBobina(insumoConsumo, pdv.trim() || 'PDV', q);
      } else {
        await insumosService.consumirInsumo(insumoConsumo, q);
      }
      setQuantidade('');
      setPdv('');
      await carregar(true);
      const u = insumo ? comUnidade(q, insumo.unidade) : `${q}`;
      notificar('Consumo registrado', `Saída de ${u} registrada.`);
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao registrar consumo.');
    } finally {
      setConsumindo(false);
    }
  };

  const sacolas = insumos.filter((i) => i.categoria === 'SACOLA');

  return (
    <Tela aoAtualizar={() => void carregar(true)} atualizando={atualizando}>
      {carregando ? (
        <Carregando />
      ) : erro ? (
        <MensagemErro mensagem={erro} aoTentarNovamente={() => void carregar()} />
      ) : insumos.length === 0 ? (
        <EstadoVazio
          icone="cube-outline"
          titulo="Nenhum insumo"
          descricao="Os insumos do setor aparecerão aqui."
        />
      ) : (
        insumos.map((i) => {
          const eqSaldo = emEmbalagens(i, i.saldo);
          const eqConsumo = emEmbalagens(i, i.consumoSemana);
          return (
            <Pressable
              key={i.id}
              onPress={() =>
                navigation.navigate('InsumoDetalhe', { insumoId: i.id, nome: i.nome })
              }
            >
              <Cartao>
                <View style={styles.cabecalho}>
                  <View style={styles.flex1}>
                    <Text style={styles.nome}>{i.nome}</Text>
                    <Text style={styles.categoria}>
                      {ROTULO_CATEGORIA_INSUMO[i.categoria]} · mín.{' '}
                      {comUnidade(i.limiteMinimo, i.unidade)}
                    </Text>
                  </View>
                  {i.estoqueBaixo ? (
                    <Selo texto="Baixo" cor={cores.vermelho} fundo={cores.vermelhoFundo} />
                  ) : (
                    <Selo texto="OK" cor={cores.verde} fundo={cores.verdeFundo} />
                  )}
                </View>

                <View style={styles.saldoLinha}>
                  <Text style={styles.saldo}>{comUnidade(i.saldo, i.unidade)}</Text>
                  {eqSaldo ? <Text style={styles.equivalente}>{eqSaldo}</Text> : null}
                </View>

                <View style={styles.metricas}>
                  <View style={styles.metrica}>
                    <Text style={styles.metricaRotulo}>Consumo (7 dias)</Text>
                    <Text style={styles.metricaValor}>
                      {comUnidade(i.consumoSemana, i.unidade)}
                      {eqConsumo ? ` (${eqConsumo})` : ''}
                    </Text>
                  </View>
                  <View style={styles.metrica}>
                    <Text style={styles.metricaRotulo}>Entrada (7 dias)</Text>
                    <Text style={styles.metricaValor}>
                      {comUnidade(i.entradaSemana, i.unidade)}
                    </Text>
                  </View>
                </View>

                <View style={styles.rodape}>
                  <Text style={styles.previsao}>
                    {i.semanasRestantes != null
                      ? `Dura ~${formatarNumero(
                          Math.round(i.semanasRestantes * 10) / 10,
                        )} semana(s) no ritmo atual`
                      : 'Sem consumo na semana'}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={cores.textoSecundario} />
                </View>
              </Cartao>
            </Pressable>
          );
        })
      )}

      <Cartao titulo="Registrar consumo (saída)">
        <Text style={styles.rotulo}>Insumo</Text>
        <SeletorInsumo
          insumos={insumos}
          selecionado={insumoConsumo}
          aoSelecionar={setInsumoConsumo}
        />
        {insumos.find((i) => i.id === insumoConsumo)?.categoria === 'BOBINA' ? (
          <CampoTexto rotulo="PDV" value={pdv} onChangeText={setPdv} placeholder="Ex.: PDV 12" />
        ) : null}
        <CampoTexto
          rotulo="Quantidade (na unidade do insumo)"
          keyboardType="number-pad"
          value={quantidade}
          onChangeText={setQuantidade}
          placeholder="0"
        />
        <Botao titulo="Registrar consumo" aoPressionar={registrarConsumo} carregando={consumindo} />
      </Cartao>

      <Cartao titulo="Retirada de fardo (sacolas)">
        <Text style={styles.rotulo}>Insumo de sacolas</Text>
        <SeletorInsumo insumos={sacolas} selecionado={insumoFardo} aoSelecionar={setInsumoFardo} />
        <Botao
          titulo="Ler código de barras"
          aoPressionar={() => {
            if (!insumoFardo) {
              notificar('Selecione o insumo', 'Escolha o insumo de sacolas primeiro.');
              return;
            }
            setScannerVisivel(true);
          }}
          estilo={{ marginTop: espacamento.sm }}
        />
      </Cartao>

      <LeitorCodigoBarras
        visivel={scannerVisivel}
        aoLer={retirarFardo}
        aoFechar={() => setScannerVisivel(false)}
      />
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
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  flex1: { flex: 1 },
  nome: {
    ...tipografia.subtitulo,
    color: cores.texto,
  },
  categoria: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  saldoLinha: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: espacamento.sm,
    marginTop: espacamento.sm,
  },
  saldo: {
    fontSize: 26,
    fontWeight: '700',
    color: cores.texto,
  },
  equivalente: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  metricas: {
    flexDirection: 'row',
    marginTop: espacamento.md,
    gap: espacamento.md,
  },
  metrica: {
    flex: 1,
  },
  metricaRotulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  metricaValor: {
    ...tipografia.corpo,
    fontWeight: '600',
    color: cores.texto,
    marginTop: 2,
  },
  rodape: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: espacamento.md,
    paddingTop: espacamento.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
  },
  previsao: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    flex: 1,
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

export default InsumosScreen;
