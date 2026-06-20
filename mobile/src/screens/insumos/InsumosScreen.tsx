/**
 * Tela de Insumos — "Almoxarifado do Setor" (Req 3.1–3.3).
 *
 * Painel vivo dos insumos do setor (Sacolas, Bobina, Pano, Álcool), medido em
 * QUANTIDADE (nunca em R$): saldo em tempo real + equivalente em embalagens,
 * semáforo, consumo da semana e previsão de ruptura. Inclui o "Controle de
 * requisição" (entradas com data — gerente/supervisor), o registro de consumo,
 * a retirada de fardo por código de barras e o acesso às Requisições.
 *
 * A lista de insumos e as entradas vêm do backend, compartilhadas entre todos.
 */
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { insumosService, requisicoesService } from '../../api/services';
import { EntradaInsumo, InsumoResumo } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import {
  Botao,
  CampoTexto,
  Carregando,
  Cartao,
  EstadoVazio,
  LeitorCodigoBarras,
  MensagemErro,
  Selo,
  SeletorData,
  Tela,
} from '../../components';
import { PropsTela } from '../../navigation/types';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { notificar } from '../../utils/dialogos';
import { formatarDataHora, formatarNumero, hojeISO } from '../../utils/formato';

/** Pluraliza a unidade base de forma simples (sacola→sacolas, metro→metros). */
function comUnidade(qtd: number, unidade: string): string {
  const plural = qtd === 1 ? unidade : `${unidade}s`;
  return `${formatarNumero(qtd)} ${plural}`;
}

/** Primeira letra maiúscula (título/rótulo). */
function capitalizar(texto: string): string {
  return texto.length ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

/** Plural pt-BR da embalagem conforme a quantidade (1 galão / 2 galões / caixas). */
function pluralEmbalagem(embalagem: string, qtd: number): string {
  if (qtd === 1) {
    return embalagem;
  }
  return embalagem.endsWith('ão')
    ? `${embalagem.slice(0, -2)}ões`
    : `${embalagem}s`;
}

/**
 * Saldo expresso na **embalagem** (ex.: "0 Caixas", "1 Galão", "1,5 Fardos"),
 * que já embute a conversão. Insumos sem embalagem (fator 1) caem na unidade base.
 */
function comEmbalagem(qtd: number, insumo: InsumoResumo): string {
  if (insumo.fatorEmbalagem <= 1) {
    return comUnidade(qtd, insumo.unidade);
  }
  const pacotes = qtd / insumo.fatorEmbalagem;
  return `${formatarNumero(pacotes)} ${capitalizar(pluralEmbalagem(insumo.embalagem, pacotes))}`;
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
  const { podeAcessar } = useAuth();
  const podeGerenciar = podeAcessar('INSUMOS_GERENCIAR');

  const [insumos, setInsumos] = useState<InsumoResumo[]>([]);
  const [entradas, setEntradas] = useState<EntradaInsumo[]>([]);
  const [pendentes, setPendentes] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Controle de requisição (entrada)
  const [insumoEntrada, setInsumoEntrada] = useState<string | null>(null);
  const [qtdEntrada, setQtdEntrada] = useState('');
  const [dataEntrada, setDataEntrada] = useState(hojeISO());
  const [registrandoEntrada, setRegistrandoEntrada] = useState(false);

  // Retirada de fardo
  const [insumoFardo, setInsumoFardo] = useState<string | null>(null);
  const [scannerVisivel, setScannerVisivel] = useState(false);

  // Consumo
  const [insumoConsumo, setInsumoConsumo] = useState<string | null>(null);
  const [pdv, setPdv] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [consumindo, setConsumindo] = useState(false);

  const buscar = useCallback(async () => {
    const [lista, listaEntradas, cont] = await Promise.all([
      insumosService.listar(),
      insumosService.entradas(),
      requisicoesService.pendentes(),
    ]);
    setInsumos(lista);
    setEntradas(listaEntradas);
    setPendentes(cont.total);
    setErro(null);
  }, []);

  const carregar = useCallback(
    async (ehAtualizacao = false) => {
      if (ehAtualizacao) setAtualizando(true);
      else setCarregando(true);
      try {
        await buscar();
      } catch (e) {
        setErro(e instanceof ApiError ? e.message : 'Falha ao carregar os insumos.');
      } finally {
        setCarregando(false);
        setAtualizando(false);
      }
    },
    [buscar],
  );

  // Recarrega ao abrir e, silenciosamente, sempre que a tela volta ao foco
  // (ex.: depois de aprovar uma requisição em "Requisições"), mantendo o saldo,
  // as entradas e o badge em dia.
  const primeiraCarga = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (primeiraCarga.current) {
        primeiraCarga.current = false;
        void carregar();
      } else {
        void buscar().catch(() => undefined);
      }
    }, [carregar, buscar]),
  );

  const insumoEntradaObj = insumos.find((i) => i.id === insumoEntrada);
  const insumoConsumoObj = insumos.find((i) => i.id === insumoConsumo);

  const registrarEntrada = async () => {
    if (!insumoEntradaObj) {
      notificar('Selecione o insumo', 'Escolha o insumo que entrou.');
      return;
    }
    const embalagens = Number(qtdEntrada);
    if (!Number.isInteger(embalagens) || embalagens <= 0) {
      notificar('Quantidade inválida', 'Informe um inteiro maior que zero.');
      return;
    }
    const base = embalagens * insumoEntradaObj.fatorEmbalagem;
    setRegistrandoEntrada(true);
    try {
      await insumosService.registrarEntrada(
        insumoEntradaObj.id,
        base,
        'ENTRADA',
        `${dataEntrada}T12:00:00.000Z`,
      );
      setQtdEntrada('');
      await carregar(true);
      notificar(
        'Entrada registrada',
        `+ ${formatarNumero(embalagens)} ${pluralEmbalagem(insumoEntradaObj.embalagem, embalagens)} no estoque.`,
      );
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao registrar entrada.');
    } finally {
      setRegistrandoEntrada(false);
    }
  };

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
    const insumo = insumos.find((i) => i.id === insumoConsumo);
    if (!insumo) {
      notificar('Selecione o insumo', 'Escolha o insumo a consumir.');
      return;
    }
    const embalagens = Number(quantidade);
    if (!Number.isInteger(embalagens) || embalagens <= 0) {
      notificar('Quantidade inválida', 'Informe um número inteiro de embalagens.');
      return;
    }
    const base = embalagens * insumo.fatorEmbalagem;
    setConsumindo(true);
    try {
      if (insumo.categoria === 'BOBINA') {
        await insumosService.consumirBobina(insumo.id, pdv.trim() || 'PDV', base);
      } else {
        await insumosService.consumirInsumo(insumo.id, base);
      }
      setQuantidade('');
      setPdv('');
      await carregar(true);
      notificar(
        'Consumo registrado',
        `Saída de ${formatarNumero(embalagens)} ${pluralEmbalagem(insumo.embalagem, embalagens)} registrada.`,
      );
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao registrar consumo.');
    } finally {
      setConsumindo(false);
    }
  };

  const sacolas = insumos.filter((i) => i.categoria === 'SACOLA');

  return (
    <Tela aoAtualizar={() => void carregar(true)} atualizando={atualizando}>
      {/* Acesso às requisições com badge de pendentes */}
      <Pressable onPress={() => navigation.navigate('Requisicoes')}>
        <Cartao>
          <View style={styles.linkRequisicoes}>
            <Ionicons name="file-tray-full-outline" size={22} color={cores.primaria} />
            <View style={styles.flex1}>
              <Text style={styles.linkTitulo}>Requisições</Text>
              <Text style={styles.linkSub}>Solicitar insumos e aprovar pedidos</Text>
            </View>
            {pendentes > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeTexto}>{pendentes}</Text>
              </View>
            ) : null}
            <Ionicons name="chevron-forward" size={18} color={cores.textoSecundario} />
          </View>
        </Cartao>
      </Pressable>

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
          return (
            <Pressable
              key={i.id}
              onPress={() =>
                navigation.navigate('InsumoDetalhe', { insumoId: i.id, nome: i.nome })
              }
            >
              <Cartao>
                <View style={styles.cabecalho}>
                  <Text style={[styles.nome, styles.flex1]}>{capitalizar(i.nome)}</Text>
                  {i.estoqueBaixo ? (
                    <Selo texto="Baixo" cor={cores.vermelho} fundo={cores.vermelhoFundo} />
                  ) : (
                    <Selo texto="OK" cor={cores.verde} fundo={cores.verdeFundo} />
                  )}
                </View>

                <View style={styles.saldoLinha}>
                  <Text style={styles.saldo}>{comEmbalagem(i.saldo, i)}</Text>
                </View>

                <View style={styles.metricas}>
                  <View style={styles.metrica}>
                    <Text style={styles.metricaRotulo}>Consumo (7 dias)</Text>
                    <Text style={styles.metricaValor}>
                      {formatarNumero(i.consumoSemana)}
                    </Text>
                  </View>
                  <View style={styles.metrica}>
                    <Text style={styles.metricaRotulo}>Entrada (7 dias)</Text>
                    <Text style={styles.metricaValor}>
                      {formatarNumero(i.entradaSemana)}
                    </Text>
                  </View>
                </View>

                <View style={styles.rodape}>
                  <Text style={styles.previsao}>
                    {i.semanasRestantes != null
                      ? `Dura ~${formatarNumero(
                          Math.round(i.semanasRestantes * 7),
                        )} dia(s) no ritmo atual`
                      : 'Sem consumo na semana'}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={cores.textoSecundario} />
                </View>
              </Cartao>
            </Pressable>
          );
        })
      )}

      {/* Controle de requisição: registro de entradas (gerente/supervisor) */}
      {podeGerenciar ? (
        <Cartao titulo="Controle de requisição (entrada)">
          <Text style={styles.rotulo}>Insumo</Text>
          <SeletorInsumo
            insumos={insumos}
            selecionado={insumoEntrada}
            aoSelecionar={setInsumoEntrada}
          />
          <SeletorData rotulo="Data da entrada" valor={dataEntrada} aoMudar={setDataEntrada} />
          <CampoTexto
            rotulo={
              insumoEntradaObj
                ? `Quantidade (em ${insumoEntradaObj.embalagem}s)`
                : 'Quantidade (em embalagens)'
            }
            keyboardType="number-pad"
            value={qtdEntrada}
            onChangeText={setQtdEntrada}
            placeholder="0"
          />
          {insumoEntradaObj && Number(qtdEntrada) > 0 ? (
            <Text style={styles.preview}>
              = {comUnidade(Number(qtdEntrada) * insumoEntradaObj.fatorEmbalagem, insumoEntradaObj.unidade)}
            </Text>
          ) : null}
          <Botao
            titulo="Registrar entrada"
            aoPressionar={registrarEntrada}
            carregando={registrandoEntrada}
          />
        </Cartao>
      ) : null}

      {/* Lista de entradas recentes (todos veem) */}
      <Cartao titulo="Entradas recentes">
        {entradas.length === 0 ? (
          <Text style={styles.vazioInline}>Nenhuma entrada registrada ainda.</Text>
        ) : (
          entradas.slice(0, 10).map((e) => (
            <View key={e.id} style={styles.entradaLinha}>
              <View style={styles.flex1}>
                <Text style={styles.entradaNome}>{e.insumoNome}</Text>
                <Text style={styles.entradaMeta}>
                  {formatarDataHora(e.dataHora)}
                  {e.origem ? ` · ${e.origem === 'REQUISICAO' ? 'requisição' : 'entrada'}` : ''}
                </Text>
              </View>
              <Text style={styles.entradaQtd}>
                + {formatarNumero(e.quantidade / e.fatorEmbalagem)}{' '}
                {pluralEmbalagem(e.embalagem, e.quantidade / e.fatorEmbalagem)}
              </Text>
            </View>
          ))
        )}
      </Cartao>

      <Cartao titulo="Registrar consumo (saída)">
        <Text style={styles.rotulo}>Insumo</Text>
        <SeletorInsumo
          insumos={insumos}
          selecionado={insumoConsumo}
          aoSelecionar={setInsumoConsumo}
        />
        {insumoConsumoObj?.categoria === 'BOBINA' ? (
          <CampoTexto rotulo="PDV" value={pdv} onChangeText={setPdv} placeholder="Ex.: PDV 12" />
        ) : null}
        <CampoTexto
          rotulo={
            insumoConsumoObj
              ? `Quantidade (em ${pluralEmbalagem(insumoConsumoObj.embalagem, 2)})`
              : 'Quantidade (em embalagens)'
          }
          keyboardType="number-pad"
          value={quantidade}
          onChangeText={setQuantidade}
          placeholder="0"
        />
        {insumoConsumoObj && Number(quantidade) > 0 ? (
          <Text style={styles.preview}>
            = {comUnidade(Number(quantidade) * insumoConsumoObj.fatorEmbalagem, insumoConsumoObj.unidade)}
          </Text>
        ) : null}
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
  },
  preview: {
    ...tipografia.legenda,
    color: cores.primaria,
    fontWeight: '700',
    marginBottom: espacamento.sm,
  },
  linkRequisicoes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.md,
  },
  linkTitulo: {
    ...tipografia.corpo,
    fontWeight: '700',
    color: cores.texto,
  },
  linkSub: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 6,
    backgroundColor: cores.primaria,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTexto: {
    color: cores.textoInverso,
    fontWeight: '700',
    fontSize: 12,
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
  entradaLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: espacamento.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  entradaNome: {
    ...tipografia.corpo,
    fontWeight: '600',
    color: cores.texto,
  },
  entradaMeta: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  entradaQtd: {
    ...tipografia.corpo,
    fontWeight: '700',
    color: cores.verde,
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
