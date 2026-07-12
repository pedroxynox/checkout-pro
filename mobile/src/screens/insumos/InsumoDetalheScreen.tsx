/**
 * Detalhe de um insumo (Req 3.1.4, 3.1.6, 3.2.4).
 *
 * Mostra o saldo atual em tempo real **na unidade do PRODUTO** (embalagem:
 * fardo, caixa, galão, pano...), com a quantidade na unidade base (ex.: litros)
 * apenas como referência secundária. Também lista o histórico de movimentos, com
 * cada entrada/saída expressa em embalagens (ex.: "-1 galão"), não em litros.
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { insumosService } from '../../api/services';
import { AnaliseInsumo, InsumoProativo, MovimentoEstoque } from '../../api/types';
import {
  Carregando,
  Cartao,
  EstadoVazio,
  GraficoBarrasVerticais,
  MensagemErro,
  Selo,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { PropsTela } from '../../navigation/types';
import { cores, espacamento, tipografia } from '../../theme';
import { formatarData, formatarNumero } from '../../utils/formato';

/** Primeiro nome (para exibir quem registrou/requisitou/aprovou). */
function primeiroNome(nome?: string | null): string {
  return nome ? nome.trim().split(/\s+/)[0] : '';
}

/** Agrupa movimentos por dia (ISO yyyy-mm-dd), preservando a ordem (desc). */
function agruparPorDia(
  movimentos: MovimentoEstoque[],
): { dia: string; movs: MovimentoEstoque[] }[] {
  const grupos: { dia: string; movs: MovimentoEstoque[] }[] = [];
  for (const m of movimentos) {
    const dia = m.dataHora.slice(0, 10);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.movs.push(m);
    else grupos.push({ dia, movs: [m] });
  }
  return grupos;
}

/** Só os últimos `dias` dias de movimentos (não sobrecarregar a tela). */
function movimentosRecentes(
  movimentos: MovimentoEstoque[] | null | undefined,
  dias = 30,
): MovimentoEstoque[] {
  if (!movimentos) return [];
  const limite = Date.now() - dias * 24 * 60 * 60 * 1000;
  return movimentos.filter((m) => new Date(m.dataHora).getTime() >= limite);
}

/** Plural do nome da embalagem (fardo→fardos, galão→galões). */
function pluralEmbalagem(embalagem: string, qtd: number): string {
  if (Math.abs(qtd) === 1) return embalagem;
  return embalagem.endsWith('ão') ? `${embalagem.slice(0, -2)}ões` : `${embalagem}s`;
}

function capitalizar(texto: string): string {
  return texto.length ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

/** Formata uma quantidade em embalagens (inteiro quando possível). */
function formatarEmbalagens(valor: number): string {
  return Number.isInteger(valor)
    ? String(Math.abs(valor))
    : formatarNumero(Math.abs(valor));
}

/** Selo de nível de estoque a partir do nível proativo. */
function seloNivel(nivel: InsumoProativo['nivel']): {
  texto: string;
  cor: string;
  fundo: string;
} {
  if (nivel === 'CRITICO') {
    return { texto: 'Estoque crítico', cor: cores.vermelho, fundo: cores.vermelhoFundo };
  }
  if (nivel === 'ATENCAO') {
    return { texto: 'Estoque baixo', cor: cores.amarelo, fundo: cores.amareloFundo };
  }
  return { texto: 'Estoque ok', cor: cores.verde, fundo: cores.verdeFundo };
}

export function InsumoDetalheScreen({
  route,
}: PropsTela<'InsumoDetalhe'>): React.ReactElement {
  const { insumoId } = route.params;

  // Busca o insumo na lista proativa (traz saldo + embalagem + fator + unidade
  // + nível), para exibir tudo na unidade do PRODUTO.
  const resumo = useRequisicao<InsumoProativo | null>(
    async () => {
      const lista = await insumosService.listarProativo();
      return lista.find((i) => i.id === insumoId) ?? null;
    },
    [insumoId],
  );
  const historico = useRequisicao(
    () => insumosService.historico(insumoId),
    [insumoId],
  );
  const analise = useRequisicao<AnaliseInsumo>(
    () => insumosService.analise(insumoId),
    [insumoId],
  );

  const recarregar = () => {
    resumo.recarregar();
    historico.recarregar();
    analise.recarregar();
  };

  const insumo = resumo.dados;
  const fator = insumo && insumo.fatorEmbalagem > 0 ? insumo.fatorEmbalagem : 1;
  const qtdEmb = insumo ? Math.round(insumo.saldo / fator) : 0;

  // Gráfico "uso vs. vendas": últimos 14 dias, consumo (unidade) e venda (R$)
  // no mesmo eixo de datas — os dias que vendeu mais são os que mais consumiu.
  const porDia = (analise.dados?.porDia ?? []).slice(-14);
  const consumoBars = porDia.map((p) => ({
    rotulo: p.data.slice(8, 10),
    valor: p.consumo,
  }));
  const vendaBars = porDia.map((p) => ({
    rotulo: p.data.slice(8, 10),
    valor: p.venda,
  }));
  const temUso = porDia.some((p) => p.consumo > 0);
  const temVenda = porDia.some((p) => p.venda > 0);

  // Movimentos agrupados por dia (últimos 30 dias) para não lotar a tela.
  const gruposMov = agruparPorDia(movimentosRecentes(historico.dados, 30));

  return (
    <Tela aoAtualizar={recarregar} atualizando={resumo.atualizando}>
      <Cartao titulo="Saldo atual">
        {resumo.carregando ? (
          <Carregando />
        ) : resumo.erro ? (
          <MensagemErro mensagem={resumo.erro} aoTentarNovamente={resumo.recarregar} />
        ) : !insumo ? (
          <EstadoVazio
            icone="cube-outline"
            titulo="Insumo não encontrado"
            descricao="Ele pode ter sido removido do cadastro."
          />
        ) : (
          <View style={styles.saldoLinha}>
            <Text style={styles.saldo}>{formatarNumero(qtdEmb)}</Text>
            <Text style={styles.saldoUnidade}>
              {pluralEmbalagem(capitalizar(insumo.embalagem), qtdEmb)}
            </Text>
            <Text style={styles.saldoBase}>
              ≈ {formatarNumero(insumo.saldo)} {insumo.unidade}
              {insumo.saldo === 1 ? '' : 's'}
            </Text>
            {(() => {
              const s = seloNivel(insumo.nivel);
              return <Selo texto={s.texto} cor={s.cor} fundo={s.fundo} />;
            })()}
          </View>
        )}
      </Cartao>

      {/* Gráfico de utilização por data associado às vendas */}
      <Text style={styles.tituloSecao}>Uso vs. vendas (14 dias)</Text>
      <Cartao>
        {analise.carregando ? (
          <Carregando />
        ) : !temUso && !temVenda ? (
          <Text style={styles.vazioInline}>
            Ainda sem dados de consumo e vendas no período.
          </Text>
        ) : (
          <>
            <Text style={styles.graficoLegenda}>
              Consumo por dia{insumo ? ` (${insumo.unidade})` : ''}
            </Text>
            {temUso ? (
              <GraficoBarrasVerticais dados={consumoBars} altura={120} />
            ) : (
              <Text style={styles.vazioInline}>Sem consumo no período.</Text>
            )}
            <Text style={[styles.graficoLegenda, { marginTop: espacamento.md }]}>
              Vendas por dia (R$)
            </Text>
            {temVenda ? (
              <GraficoBarrasVerticais dados={vendaBars} altura={120} />
            ) : (
              <Text style={styles.vazioInline}>Sem vendas no período.</Text>
            )}
            <Text style={styles.graficoDica}>
              Compare as barras: os dias de maior venda costumam ser os de maior
              uso do insumo.
            </Text>
          </>
        )}
      </Cartao>

      {/* Histórico de movimento por dia (últimos 30 dias) */}
      <Text style={styles.tituloSecao}>Movimentos por dia</Text>
      {historico.carregando ? (
        <Carregando />
      ) : historico.erro ? (
        <MensagemErro mensagem={historico.erro} aoTentarNovamente={historico.recarregar} />
      ) : gruposMov.length === 0 ? (
        <EstadoVazio
          icone="swap-vertical-outline"
          titulo="Sem movimentos"
          descricao="Retiradas e consumos dos últimos 30 dias aparecerão aqui."
        />
      ) : (
        gruposMov.map((g) => (
          <Cartao key={g.dia}>
            <Text style={styles.diaCabecalho}>{formatarData(g.dia)}</Text>
            {g.movs.map((m) => {
              const emb = m.delta / fator;
              const saida = m.delta < 0;
              const embLabel = insumo
                ? `${saida ? '-' : '+'}${formatarEmbalagens(emb)} ${pluralEmbalagem(insumo.embalagem, emb)}`
                : `${m.delta > 0 ? `+${m.delta}` : m.delta}`;
              // Autoria: saída → quem registrou; entrada de requisição → quem
              // requisitou + quem aprovou; demais entradas → quem registrou.
              const autoria = saida
                ? m.responsavelNome
                  ? `Registrou: ${primeiroNome(m.responsavelNome)}`
                  : null
                : m.origem === 'REQUISICAO'
                  ? `Requisitou: ${primeiroNome(m.requisitanteNome) || '—'} · Aprovou: ${primeiroNome(m.responsavelNome) || '—'}`
                  : m.responsavelNome
                    ? `Registrou: ${primeiroNome(m.responsavelNome)}`
                    : null;
              return (
                <View key={m.id} style={styles.movLinha}>
                  <Ionicons
                    name={saida ? 'arrow-down-circle' : 'arrow-up-circle'}
                    size={18}
                    color={saida ? cores.vermelho : cores.verde}
                  />
                  <View style={styles.flex1}>
                    <Text
                      style={[
                        styles.movDelta,
                        { color: saida ? cores.vermelho : cores.verde },
                      ]}
                    >
                      {embLabel}
                    </Text>
                    {autoria ? (
                      <Text style={styles.movAutor}>{autoria}</Text>
                    ) : null}
                    {insumo ? (
                      <Text style={styles.movBase}>
                        {formatarNumero(Math.abs(m.delta))} {insumo.unidade}
                        {Math.abs(m.delta) === 1 ? '' : 's'}
                        {m.destino ? ` · ${m.destino}` : ''}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </Cartao>
        ))
      )}

      {/* Resumo de consumo (semana e mês) */}
      {analise.dados ? (
        <Cartao titulo="Resumo de consumo">
          <View style={styles.resumoLinha}>
            <View style={styles.resumoBox}>
              <Text style={styles.resumoNum}>
                {formatarNumero(analise.dados.consumoSemana)}
              </Text>
              <Text style={styles.resumoRot}>
                {insumo ? `${insumo.unidade}s` : ''} · semana
              </Text>
            </View>
            <View style={styles.resumoBox}>
              <Text style={styles.resumoNum}>
                {formatarNumero(analise.dados.consumoMes)}
              </Text>
              <Text style={styles.resumoRot}>
                {insumo ? `${insumo.unidade}s` : ''} · mês
              </Text>
            </View>
          </View>
        </Cartao>
      ) : null}
    </Tela>
  );
}

const styles = StyleSheet.create({
  saldoLinha: {
    alignItems: 'center',
    gap: espacamento.xs,
  },
  saldo: {
    ...tipografia.titulo,
    fontSize: 40,
    color: cores.primaria,
  },
  saldoUnidade: {
    ...tipografia.subtitulo,
    color: cores.texto,
    fontWeight: '700',
  },
  saldoBase: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.xs,
  },
  tituloSecao: {
    ...tipografia.secao,
    color: cores.texto,
    marginTop: espacamento.sm,
    marginBottom: espacamento.md,
  },
  movTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    marginBottom: espacamento.xs,
  },
  movDelta: {
    ...tipografia.rotulo,
    fontWeight: '700',
  },
  vazioInline: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    paddingVertical: espacamento.xs,
  },
  graficoLegenda: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginBottom: espacamento.xs,
  },
  graficoDica: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    fontStyle: 'italic',
    marginTop: espacamento.sm,
  },
  diaCabecalho: {
    ...tipografia.rotulo,
    fontWeight: '700',
    color: cores.texto,
    marginBottom: espacamento.xs,
  },
  movLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    paddingVertical: espacamento.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
  },
  flex1: { flex: 1 },
  movAutor: {
    ...tipografia.legenda,
    color: cores.texto,
    marginTop: 1,
  },
  movBase: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 1,
  },
  resumoLinha: {
    flexDirection: 'row',
    gap: espacamento.sm,
  },
  resumoBox: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: cores.superficieAlternativa,
    borderRadius: 12,
    paddingVertical: espacamento.md,
  },
  resumoNum: {
    ...tipografia.subtitulo,
    color: cores.primaria,
    fontWeight: '700',
  },
  resumoRot: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
});

export default InsumoDetalheScreen;
