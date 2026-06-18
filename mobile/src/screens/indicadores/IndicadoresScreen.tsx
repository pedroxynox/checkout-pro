/**
 * Tela de Indicadores (Req 2.2–2.5).
 *
 * Para cada um dos quatro indicadores exibe a meta oficial e classifica a cor
 * (verde/amarelo/vermelho) com base no valor atual informado e no limite
 * amarelo, consultando o backend. Inclui uma calculadora de percentual (sobre
 * vendas) e a seção de rankings de operadores/fiscais por período.
 */
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { indicadoresService } from '../../api/services';
import {
  IndicadorTipo,
  RankingItem,
  StatusCor,
  TipoRankingOperador,
} from '../../api/types';
import {
  Botao,
  CampoTexto,
  Cartao,
  EstadoVazio,
  MensagemErro,
  Segmentado,
  SeletorData,
  StatusBadge,
  Tela,
} from '../../components';
import { cores, espacamento, tipografia } from '../../theme';
import { formatarMoeda, formatarPercentual } from '../../utils/formato';
import { DefinicaoIndicador, INDICADORES } from '../../utils/rotulos';

function numero(texto: string): number {
  return Number(texto.replace(/\./g, '').replace(',', '.'));
}

function CalculadoraPercentual(): React.ReactElement {
  const [indicadorTotal, setIndicadorTotal] = useState('');
  const [vendasTotal, setVendasTotal] = useState('');
  const [resultado, setResultado] = useState<number | null>(null);
  const [calculando, setCalculando] = useState(false);

  const calcular = async () => {
    setCalculando(true);
    try {
      const { percentual } = await indicadoresService.percentual(
        numero(indicadorTotal),
        numero(vendasTotal),
      );
      setResultado(percentual);
    } catch (e) {
      Alert.alert('Erro', e instanceof ApiError ? e.message : 'Falha ao calcular.');
    } finally {
      setCalculando(false);
    }
  };

  return (
    <Cartao titulo="Calculadora de percentual">
      <CampoTexto
        rotulo="Total do indicador (R$)"
        keyboardType="decimal-pad"
        value={indicadorTotal}
        onChangeText={setIndicadorTotal}
        placeholder="0,00"
      />
      <CampoTexto
        rotulo="Total de vendas (R$)"
        keyboardType="decimal-pad"
        value={vendasTotal}
        onChangeText={setVendasTotal}
        placeholder="0,00"
      />
      <Botao titulo="Calcular" aoPressionar={calcular} carregando={calculando} />
      {resultado !== null ? (
        <Text style={styles.resultado}>
          Percentual sobre vendas: {formatarPercentual(resultado)}
        </Text>
      ) : null}
    </Cartao>
  );
}

function IndicadorCard({
  def,
}: {
  def: DefinicaoIndicador;
}): React.ReactElement {
  const [valor, setValor] = useState('');
  const [limiteAmarelo, setLimiteAmarelo] = useState(
    String(def.limiteAmareloPadrao).replace('.', ','),
  );
  const [cor, setCor] = useState<StatusCor | null>(null);
  const [avaliando, setAvaliando] = useState(false);

  const metaFmt =
    def.unidade === '%' ? formatarPercentual(def.meta) : formatarMoeda(def.meta);

  const avaliar = async () => {
    setAvaliando(true);
    try {
      const resp = await indicadoresService.cor(
        def.tipo as IndicadorTipo,
        numero(valor),
        numero(limiteAmarelo),
      );
      setCor(resp.cor);
    } catch (e) {
      Alert.alert('Erro', e instanceof ApiError ? e.message : 'Falha ao avaliar.');
    } finally {
      setAvaliando(false);
    }
  };

  return (
    <Cartao>
      <View style={styles.indCabecalho}>
        <Text style={styles.indTitulo}>{def.titulo}</Text>
        {cor ? <StatusBadge status={cor} /> : null}
      </View>
      <Text style={styles.indMeta}>
        Meta: {metaFmt} ·{' '}
        {def.sentido === 'MENOR_MELHOR' ? 'menor é melhor' : 'maior é melhor'}
      </Text>
      <CampoTexto
        rotulo={def.unidade === '%' ? 'Valor atual (%)' : 'Valor atual (R$)'}
        keyboardType="decimal-pad"
        value={valor}
        onChangeText={setValor}
        placeholder="0,00"
      />
      <CampoTexto
        rotulo={`Limite amarelo (${def.unidade === '%' ? '%' : 'R$'})`}
        keyboardType="decimal-pad"
        value={limiteAmarelo}
        onChangeText={setLimiteAmarelo}
      />
      <Botao
        titulo="Avaliar cor"
        variante="secundario"
        aoPressionar={avaliar}
        carregando={avaliando}
      />
    </Cartao>
  );
}

const OPCOES_RANKING: { valor: TipoRankingOperador | 'DEVOLUCOES'; rotulo: string }[] = [
  { valor: 'CANCELAMENTO', rotulo: 'Cancel.' },
  { valor: 'TROCO', rotulo: 'Troco' },
  { valor: 'RECARGA', rotulo: 'Recarga' },
  { valor: 'DEVOLUCOES', rotulo: 'Devol.' },
];

function inicioDoMesISO(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

function SecaoRankings(): React.ReactElement {
  const [tipo, setTipo] = useState<TipoRankingOperador | 'DEVOLUCOES'>(
    'CANCELAMENTO',
  );
  const [inicio, setInicio] = useState(inicioDoMesISO());
  const [fim, setFim] = useState(new Date().toISOString().slice(0, 10));
  const [itens, setItens] = useState<RankingItem[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = async () => {
    setCarregando(true);
    setErro(null);
    try {
      const resultado =
        tipo === 'DEVOLUCOES'
          ? await indicadoresService.rankingFiscais(inicio, fim)
          : await indicadoresService.rankingOperadores(tipo, inicio, fim);
      setItens(resultado);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao buscar ranking.');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <Cartao titulo="Rankings">
      <Segmentado
        opcoes={OPCOES_RANKING}
        selecionado={tipo}
        aoSelecionar={(v) => setTipo(v)}
      />
      <SeletorData valor={inicio} aoMudar={setInicio} rotulo="Início" />
      <SeletorData valor={fim} aoMudar={setFim} rotulo="Fim" />
      <Botao titulo="Gerar ranking" aoPressionar={buscar} carregando={carregando} />
      {erro ? <MensagemErro mensagem={erro} /> : null}
      {itens && itens.length > 0 ? (
        <View style={styles.ranking}>
          {itens.map((item, idx) => (
            <View key={item.pessoaId} style={styles.rankingLinha}>
              <Text style={styles.rankingPos}>{idx + 1}º</Text>
              <Text style={styles.rankingNome} numberOfLines={1}>
                {item.pessoaId}
              </Text>
              <Text style={styles.rankingValor}>{formatarMoeda(item.total)}</Text>
            </View>
          ))}
        </View>
      ) : itens ? (
        <EstadoVazio
          icone="trophy-outline"
          titulo="Sem dados"
          descricao="Nenhum registro no período selecionado."
        />
      ) : null}
    </Cartao>
  );
}

export function IndicadoresScreen(): React.ReactElement {
  return (
    <Tela>
      <CalculadoraPercentual />
      {INDICADORES.map((def) => (
        <IndicadorCard key={def.tipo} def={def} />
      ))}
      <SecaoRankings />
    </Tela>
  );
}

const styles = StyleSheet.create({
  resultado: {
    ...tipografia.corpo,
    fontWeight: '700',
    color: cores.primaria,
    marginTop: espacamento.md,
    textAlign: 'center',
  },
  indCabecalho: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: espacamento.xs,
  },
  indTitulo: {
    ...tipografia.secao,
    color: cores.texto,
    flex: 1,
  },
  indMeta: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.md,
  },
  ranking: {
    marginTop: espacamento.md,
  },
  rankingLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: espacamento.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  rankingPos: {
    ...tipografia.rotulo,
    color: cores.primaria,
    width: 36,
  },
  rankingNome: {
    ...tipografia.corpo,
    color: cores.texto,
    flex: 1,
  },
  rankingValor: {
    ...tipografia.corpo,
    fontWeight: '700',
    color: cores.texto,
  },
});

export default IndicadoresScreen;
