/**
 * Resumo do Dia (Centro de Mando embutido no topo da Home).
 *
 * É a cara da "gestão inteligente": aparece acima de todas as áreas e mostra
 *  1. Saúde do negócio — nota 0–100 num **medidor circular**, com o porquê.
 *  2. Vendas de ontem — destaque (para perfis de gestão).
 *  3. Pontos de atenção — prioridades **personalizadas por perfil**.
 *
 * Prioridades por perfil (a pedido):
 *  - FISCAL: checklist (se não feito), insumos, indicadores (metas), faltas e
 *    cobertura do turno de hoje.
 *  - GERENTE/SUPERVISOR: vendas e meta de faturamento (com o "ritmo da meta").
 *  - IMPORTADOR: apenas a carga de arquivos do dia.
 *  - ADMINISTRADOR: tudo.
 *
 * Fase 1 — sem IA: tudo por REGRAS sobre dados que o backend já fornece, de
 * forma defensiva (cada chamada tem catch; só busca o que o perfil precisa).
 */
import {
  CheckCircle2,
  ChevronRight,
  Flag,
  Gauge,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { TipoArrecadacao } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';

import { Cartao, Skeleton } from '../../components';
import { cores, raio, sombra, tipografia } from '../../theme';
import { formatarMoeda } from '../../utils/formato';
import { ROTULO_TIPO_ARRECADACAO } from '../../utils/rotulos';
import { CamposHome, QUEDA_VENDAS_RELEVANTE, temasDoPerfil } from './dadosDoDia';

/** Rotas para onde o atalho "Resolver" pode levar. */
type RotaAtalho =
  | 'Importacoes'
  | 'Insumos'
  | 'PainelVendas'
  | 'Checklist'
  | 'Indicadores'
  | 'Operadores'
  | 'Mensagens';

interface AcaoPrioritaria {
  prioridade: 'alta' | 'media';
  titulo: string;
  detalhe: string;
  rota: RotaAtalho;
  funcionalidade: string;
}

interface ResumoSaude {
  nota: number;
  cor: string;
  fundo: string;
  rotulo: string;
}

interface Props {
  aoNavegar: (rota: RotaAtalho) => void;
  /**
   * Dados do dia, buscados UMA vez na Home (compartilhados e deduplicados).
   * Cada campo carrega de forma independente, então os cartões aparecem
   * progressivamente conforme os dados chegam.
   */
  dados: CamposHome;
}

function classificar(nota: number): ResumoSaude {
  if (nota >= 80) {
    return { nota, cor: cores.verde, fundo: cores.verdeFundo, rotulo: 'Tudo em ordem' };
  }
  if (nota >= 60) {
    return {
      nota,
      cor: cores.amarelo,
      fundo: cores.amareloFundo,
      rotulo: 'Atenção em alguns pontos',
    };
  }
  return { nota, cor: cores.vermelho, fundo: cores.vermelhoFundo, rotulo: 'Requer sua ação' };
}

/** Medidor circular (anel) com a nota no centro. */
function MedidorCircular({
  nota,
  cor,
}: {
  nota: number;
  cor: string;
}): React.ReactElement {
  const tamanho = 74;
  const traco = 8;
  const r = (tamanho - traco) / 2;
  const circunferencia = 2 * Math.PI * r;
  const preenchido = circunferencia * (1 - Math.max(0, Math.min(100, nota)) / 100);
  const centro = tamanho / 2;
  return (
    <View style={{ width: tamanho, height: tamanho }}>
      <Svg width={tamanho} height={tamanho}>
        <Circle
          cx={centro}
          cy={centro}
          r={r}
          stroke={cores.divisor}
          strokeWidth={traco}
          fill="none"
        />
        <Circle
          cx={centro}
          cy={centro}
          r={r}
          stroke={cor}
          strokeWidth={traco}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circunferencia}
          strokeDashoffset={preenchido}
          transform={`rotate(-90 ${centro} ${centro})`}
        />
      </Svg>
      <View style={styles.medidorCentro} pointerEvents="none">
        <Text style={[styles.medidorNota, { color: cor }]}>{nota}</Text>
        <Text style={styles.medidorDe}>/ 100</Text>
      </View>
    </View>
  );
}

export function ResumoDoDia({ aoNavegar, dados }: Props): React.ReactElement {
  const { podeAcessar, perfil } = useAuth();

  const temas = temasDoPerfil(perfil);

  // Dados brutos do dia. A carga é ONTEM para os arquivos (os de hoje chegam só
  // à noite; cobrá-los durante o dia seria falso alarme) e HOJE/ONTEM para as
  // vendas (hoje se o arquivo do dia já foi carregado).
  const arrec = dados.arrecOntem.dado;
  const vendaStatus = dados.vendaStatusOntem.dado;
  const painelOntem = dados.painelOntem.dado;
  const painelHoje = dados.painelHoje.dado;
  const statusVendasHoje = dados.statusVendasHoje.dado;
  const insumos = dados.insumos.dado;
  const atencao = dados.atencao.dado;
  const ckAb = dados.ckAb.dado;
  const ckFe = dados.ckFe.dado;
  const opDia = dados.opDia.dado;

  // Carga progressiva: cada bloco vira esqueleto enquanto os SEUS dados não
  // chegam, e aparece assim que chegam (sem esperar os demais).
  const vendasCarregando =
    dados.painelHoje.carregando ||
    dados.painelOntem.carregando ||
    dados.statusVendasHoje.carregando;
  const coberturaCarregando = dados.opDia.carregando;
  // A nota de saúde, o resumo e os pontos de atenção agregam vários sinais;
  // ficam em esqueleto até todos os que os alimentam chegarem.
  const nucleoCarregando =
    dados.ckAb.carregando ||
    dados.ckFe.carregando ||
    dados.arrecOntem.carregando ||
    dados.vendaStatusOntem.carregando ||
    dados.insumos.carregando ||
    dados.atencao.carregando ||
    dados.opDia.carregando ||
    dados.painelHoje.carregando ||
    dados.painelOntem.carregando;

  const horaAgora = new Date().getHours();

  // ----- Sinais (somente os relevantes ao perfil têm dados) -----
  const aberturaNaoFeita =
    temas.has('checklist') && ckAb?.status === 'PENDENTE' && horaAgora >= 9;
  const fechamentoNaoFeito =
    temas.has('checklist') && ckFe?.status === 'PENDENTE' && horaAgora >= 14;

  const pendentesLabels: string[] = [];
  if (temas.has('carga') && arrec) {
    for (const tipo of Object.keys(arrec) as TipoArrecadacao[]) {
      if (arrec[tipo] === 'PENDENTE') {
        pendentesLabels.push(ROTULO_TIPO_ARRECADACAO[tipo] ?? tipo);
      }
    }
    if (vendaStatus && !vendaStatus.enviado) pendentesLabels.push('Vendas por hora');
  }

  const criticos = insumos.filter((i) => i.nivel === 'CRITICO');
  const indicadoresForaMeta = atencao ? atencao.criticos + atencao.emAtencao : 0;
  const faltas = opDia?.faltas ?? 0;

  // Cobertura do turno de hoje (quem está trabalhando vs faltas/folgas).
  const temCobertura = temas.has('cobertura') && opDia != null;
  const trabalhando = opDia?.trabalhando ?? 0;
  const folgas = opDia?.folgas ?? 0;
  // Sinaliza cobertura "apertada" quando há faltas e poucos no turno.
  const coberturaApertada = temCobertura && faltas > 0 && trabalhando <= faltas;

  // Dia de referência das vendas: HOJE se o arquivo do dia já foi carregado;
  // senão, ONTEM. Depois da virada do dia (00h), "hoje" muda e o que estava
  // carregado passa a contar como "ontem" — sem precisar recarregar nada. Só
  // volta a "hoje" quando o arquivo do novo dia for carregado.
  const vendasEhHoje = !!statusVendasHoje?.enviado && !!painelHoje;
  const painelVendas = vendasEhHoje ? painelHoje : painelOntem;
  const rotuloVendasCurto = vendasEhHoje ? 'hoje' : 'ontem';
  const rotuloVendasTitulo = vendasEhHoje ? 'Hoje' : 'Ontem';

  const vendasDia = painelVendas?.comparativos?.dia ?? null;
  const variacaoDia = vendasDia?.variacao ?? null;
  const vendasCairam =
    variacaoDia != null && variacaoDia <= -QUEDA_VENDAS_RELEVANTE;
  const metaAbaixo =
    painelVendas != null &&
    painelVendas.projecaoVsMeta != null &&
    painelVendas.projecaoVsMeta < 0;

  // Recomendação extra (gestão): "ritmo da meta" — quanto ainda falta vender
  // por dia, em média, para fechar a meta do mês. Ajuda a decidir o foco do dia.
  const ritmoMeta = (() => {
    if (!temas.has('metaVendas') || !painelVendas || painelVendas.metaMensal <= 0) {
      return null;
    }
    const faltam = painelVendas.metaMensal - painelVendas.arrecadadoMes;
    const diasRestantes = Math.max(1, painelVendas.diasNoMes - painelVendas.diasComVenda);
    if (faltam <= 0) {
      return { batida: true as const, porDia: 0, diasRestantes };
    }
    return { batida: false as const, porDia: faltam / diasRestantes, diasRestantes };
  })();

  // ----- Prioridades (Pontos de atenção) -----
  const acoes: AcaoPrioritaria[] = [];
  if (aberturaNaoFeita) {
    acoes.push({
      prioridade: 'alta',
      titulo: 'Checklist de abertura não foi feito',
      detalhe: 'Envie o registro de abertura.',
      rota: 'Checklist',
      funcionalidade: 'CHECKLIST',
    });
  }
  if (fechamentoNaoFeito) {
    acoes.push({
      prioridade: 'alta',
      titulo: 'Checklist de fechamento não foi feito',
      detalhe: 'Envie o registro de fechamento.',
      rota: 'Checklist',
      funcionalidade: 'CHECKLIST',
    });
  }
  if (pendentesLabels.length > 0) {
    acoes.push({
      prioridade: 'alta',
      titulo: `Falta carregar ${pendentesLabels.length} arquivo(s) de ontem`,
      detalhe: pendentesLabels.slice(0, 3).join(', '),
      rota: 'Importacoes',
      funcionalidade: 'IMPORTACOES',
    });
  }
  if (vendasCairam && variacaoDia != null) {
    acoes.push({
      prioridade: 'alta',
      titulo: `Vendas de ${rotuloVendasCurto} caíram ${Math.abs(Math.round(variacaoDia))}%`,
      detalhe: 'Abra o Painel de Vendas para entender.',
      rota: 'PainelVendas',
      funcionalidade: 'PAINEL_VENDAS_VISUALIZAR',
    });
  }
  if (criticos.length > 0) {
    acoes.push({
      prioridade: 'alta',
      titulo: `${criticos.length} insumo(s) em nível crítico`,
      detalhe: criticos.slice(0, 3).map((i) => i.nome).join(', '),
      rota: 'Insumos',
      funcionalidade: 'INSUMOS',
    });
  }
  if (indicadoresForaMeta > 0) {
    acoes.push({
      prioridade: 'media',
      titulo: `${indicadoresForaMeta} indicador(es) fora da meta`,
      detalhe: 'Troco, recargas, cancelamentos ou devoluções.',
      rota: 'Indicadores',
      funcionalidade: 'INDICADORES_VISUALIZAR',
    });
  }
  if (faltas > 0) {
    acoes.push({
      prioridade: 'media',
      titulo: `${faltas} falta(s) de operadores hoje`,
      detalhe: 'Verifique a cobertura do turno.',
      rota: 'Operadores',
      funcionalidade: 'OPERADORES_AUSENCIAS',
    });
  }
  if (metaAbaixo && painelVendas) {
    const faltam = Math.abs(Math.round(painelVendas.projecaoVsMeta ?? 0));
    acoes.push({
      prioridade: 'media',
      titulo: `Projeção ${faltam}% abaixo da meta do mês`,
      detalhe: `${Math.round(painelVendas.metaProgresso * 100)}% da meta já atingido`,
      rota: 'PainelVendas',
      funcionalidade: 'PAINEL_VENDAS_VISUALIZAR',
    });
  }

  const top3 = [...acoes]
    .sort((a, b) => (a.prioridade === 'alta' ? 0 : 1) - (b.prioridade === 'alta' ? 0 : 1))
    .slice(0, 3);

  // ----- Nota da saúde (0–100) -----
  // Penalidades por categoria, com TETO por categoria, para a nota refletir a
  // operação de forma realista e não "despencar" a 0 por acúmulo (alguns
  // pontos de atenção ≠ negócio em colapso). Cada categoria tira no máximo o
  // seu teto, mesmo quando há muitos itens (ex.: vários insumos baixos).
  //
  // Arquivos pendentes referem-se ao DIA ANTERIOR (ver busca acima). Como esses
  // já deveriam ter sido carregados à noite, uma pendência é problema real e
  // pesa na nota a qualquer hora do dia.
  const arquivosAtrasados = pendentesLabels.length;
  const penalidade =
    (aberturaNaoFeita ? 15 : 0) +
    (fechamentoNaoFeito ? 15 : 0) +
    Math.min(arquivosAtrasados * 5, 20) +
    (vendasCairam ? 10 : 0) +
    Math.min(criticos.length * 6, 18) +
    Math.min(indicadoresForaMeta * 5, 15) +
    Math.min(faltas * 6, 15) +
    (metaAbaixo ? 12 : 0);
  const nota = Math.max(0, Math.min(100, 100 - penalidade));
  const saude = classificar(nota);

  const motivos: string[] = [];
  if (aberturaNaoFeita || fechamentoNaoFeito) motivos.push('checklist pendente');
  if (pendentesLabels.length > 0) motivos.push('arquivos pendentes');
  if (vendasCairam) motivos.push('queda nas vendas de ontem');
  if (criticos.length > 0) motivos.push('insumos críticos');
  if (indicadoresForaMeta > 0) motivos.push('indicadores fora da meta');
  if (faltas > 0) motivos.push('faltas de operadores');
  if (metaAbaixo) motivos.push('vendas abaixo da meta');
  const porque =
    motivos.length === 0
      ? 'Sem pendências relevantes para você hoje.'
      : `Pesa na nota: ${motivos.join(', ')}.`;

  const subiu = variacaoDia != null && variacaoDia >= 0;
  const corVar =
    variacaoDia == null ? cores.textoSecundario : subiu ? cores.verde : cores.vermelho;

  // Resumo automático (por REGRAS, sem IA e sem custo): um resumo curto que
  // aparece sozinho no topo, montado a partir dos números do dia.
  const horaSaudacao =
    horaAgora < 12 ? 'Bom dia' : horaAgora < 18 ? 'Boa tarde' : 'Boa noite';
  const resumoNarrativo = (() => {
    const fatos: string[] = [];
    if (vendasDia) {
      const base = `${rotuloVendasTitulo}: ${formatarMoeda(vendasDia.atual)}`;
      fatos.push(
        variacaoDia != null
          ? `${base} (${variacaoDia >= 0 ? '+' : ''}${Math.round(variacaoDia)}% vs. semana passada)`
          : base,
      );
    }
    if (ritmoMeta && !ritmoMeta.batida) {
      fatos.push(`meta do mês pede ~${formatarMoeda(ritmoMeta.porDia)}/dia`);
    }
    const focos = top3.slice(0, 2).map((a) => a.titulo);
    const prioridade =
      top3.length === 0
        ? 'Sem pendências para hoje. 🎉'
        : `Foque em: ${focos.join('; ')}.`;
    const partes = fatos.length > 0 ? [fatos.join('  ·  '), prioridade] : [prioridade];
    return `${horaSaudacao}! ${partes.join('. ')}`;
  })();

  return (
    <View style={styles.bloco}>
      <Text style={styles.secao}>Hoje</Text>

      {/* Saúde do negócio com medidor circular */}
      {nucleoCarregando ? (
        <Cartao estilo={styles.cartaoCompacto}>
          <View style={styles.saudeLinha}>
            <Skeleton largura={74} altura={74} estilo={styles.skelMedidor} />
            <View style={styles.saudeTexto}>
              <Skeleton largura={120} altura={10} />
              <Skeleton largura={150} altura={14} estilo={styles.skelLinha} />
              <Skeleton largura={190} altura={10} estilo={styles.skelLinha} />
            </View>
          </View>
        </Cartao>
      ) : (
        <Cartao estilo={styles.cartaoCompacto}>
          <View style={styles.saudeLinha}>
            <MedidorCircular nota={saude.nota} cor={saude.cor} />
            <View style={styles.saudeTexto}>
              <Text style={styles.saudeMini}>SAÚDE DO NEGÓCIO</Text>
              <Text style={[styles.saudeRotulo, { color: saude.cor }]}>{saude.rotulo}</Text>
              <Text style={styles.saudeDica}>{porque}</Text>
            </View>
          </View>
        </Cartao>
      )}

      {/* Briefing automático da Cluby (resumo por regras, sem custo de IA) */}
      {nucleoCarregando ? (
        <View style={styles.briefingCard}>
          <Skeleton largura={120} altura={12} />
          <Skeleton largura="100%" altura={10} estilo={styles.skelLinha} />
          <Skeleton largura="80%" altura={10} estilo={styles.skelLinha} />
        </View>
      ) : (
        <View style={styles.briefingCard}>
          <View style={styles.briefingHeader}>
            <View style={styles.briefingIcone}>
              <Sparkles size={14} color={cores.primaria} />
            </View>
            <Text style={styles.briefingTitulo}>Resumo de hoje</Text>
          </View>
          <Text style={styles.briefingNarrativa}>{resumoNarrativo}</Text>
        </View>
      )}

      {/* Vendas do dia de referência (hoje se já carregado; senão, ontem) —
          destaque para perfis de gestão. Aparece assim que os dados chegam. */}
      {temas.has('ventas') ? (
        vendasCarregando ? (
          <Cartao estilo={styles.cartaoCompacto}>
            <Skeleton largura={110} altura={10} />
            <Skeleton largura={150} altura={22} estilo={styles.skelLinha} />
            <Skeleton largura="90%" altura={10} estilo={styles.skelLinha} />
          </Cartao>
        ) : vendasDia ? (
        <Cartao estilo={styles.cartaoCompacto}>
          <View style={styles.vendasTopo}>
            <View>
              <Text style={styles.saudeMini}>
                {`VENDAS DE ${vendasEhHoje ? 'HOJE' : 'ONTEM'}`}
              </Text>
              <Text style={styles.vendasValor}>{formatarMoeda(vendasDia.atual)}</Text>
            </View>
            {variacaoDia != null ? (
              <View
                style={[
                  styles.vendasPill,
                  { backgroundColor: subiu ? cores.verdeFundo : cores.vermelhoFundo },
                ]}
              >
                {subiu ? (
                  <TrendingUp size={13} color={corVar} />
                ) : (
                  <TrendingDown size={13} color={corVar} />
                )}
                <Text style={[styles.vendasPillTexto, { color: corVar }]}>
                  {subiu ? '+' : ''}
                  {Math.round(variacaoDia)}%
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.vendasNota}>
            {variacaoDia != null
              ? `${subiu ? 'Acima' : 'Abaixo'} do mesmo dia da semana passada.`
              : 'Sem comparação disponível.'}
            {painelVendas?.mediaDiaria
              ? `  ·  Média diária do mês: ${formatarMoeda(painelVendas.mediaDiaria)}`
              : ''}
          </Text>
          {ritmoMeta ? (
            <View style={styles.ritmoBox}>
              {ritmoMeta.batida ? (
                <Flag size={13} color={cores.verde} />
              ) : (
                <Gauge size={13} color={cores.primaria} />
              )}
              <Text style={styles.ritmoTexto}>
                {ritmoMeta.batida
                  ? 'Meta do mês já alcançada. 🎉'
                  : `Para bater a meta, faça ~${formatarMoeda(ritmoMeta.porDia)}/dia nos ${ritmoMeta.diasRestantes} dia(s) restantes.`}
              </Text>
            </View>
          ) : null}
          {podeAcessar('PAINEL_VENDAS_VISUALIZAR') ? (
            <Pressable onPress={() => aoNavegar('PainelVendas')} style={styles.vendasLink}>
              <Text style={styles.vendasLinkTexto}>Ver Painel de Vendas</Text>
              <ChevronRight size={13} color={cores.primaria} />
            </Pressable>
          ) : null}
        </Cartao>
        ) : null
      ) : null}

      {/* Cobertura do turno de hoje (operadores trabalhando vs faltas/folgas).
          Aparece assim que os dados chegam. */}
      {temas.has('cobertura') ? (
        coberturaCarregando ? (
          <Cartao estilo={styles.cartaoCompacto}>
            <Skeleton largura={120} altura={10} />
            <Skeleton largura="100%" altura={46} estilo={styles.skelLinha} />
          </Cartao>
        ) : temCobertura ? (
        <Cartao estilo={styles.cartaoCompacto}>
          <Text style={styles.saudeMini}>COBERTURA DE HOJE</Text>
          <View style={styles.coberturaLinha}>
            <View style={styles.coberturaItem}>
              <Text style={[styles.coberturaNum, { color: cores.verde }]}>
                {trabalhando}
              </Text>
              <Text style={styles.coberturaRot}>no turno</Text>
            </View>
            <View style={styles.coberturaItem}>
              <Text
                style={[
                  styles.coberturaNum,
                  { color: faltas > 0 ? cores.vermelho : cores.texto },
                ]}
              >
                {faltas}
              </Text>
              <Text style={styles.coberturaRot}>falta(s)</Text>
            </View>
            <View style={styles.coberturaItem}>
              <Text style={[styles.coberturaNum, { color: cores.textoSecundario }]}>
                {folgas}
              </Text>
              <Text style={styles.coberturaRot}>folga(s)</Text>
            </View>
          </View>
          {coberturaApertada ? (
            <Text style={styles.coberturaAlerta}>
              Cobertura apertada hoje — confira se precisa remanejar.
            </Text>
          ) : null}
          {podeAcessar('OPERADORES_AUSENCIAS') ? (
            <Pressable onPress={() => aoNavegar('Operadores')} style={styles.vendasLink}>
              <Text style={styles.vendasLinkTexto}>Ver Operadores</Text>
              <ChevronRight size={13} color={cores.primaria} />
            </Pressable>
          ) : null}
        </Cartao>
        ) : null
      ) : null}

      {/* Pontos de atenção — em esqueleto até os sinais chegarem. */}
      {nucleoCarregando ? (
        <Cartao estilo={styles.cartaoCompacto} titulo="Pontos de atenção">
          <Skeleton largura="100%" altura={14} estilo={styles.skelLinha} />
          <Skeleton largura="90%" altura={14} estilo={styles.skelLinha} />
        </Cartao>
      ) : (
      <Cartao estilo={styles.cartaoCompacto} titulo="Pontos de atenção">
        {top3.length === 0 ? (
          <View style={styles.tudoOk}>
            <CheckCircle2 size={15} color={cores.verde} />
            <Text style={styles.tudoOkTexto}>
              Tudo em ordem. Sem pendências para hoje. 🎉
            </Text>
          </View>
        ) : (
          top3.map((acao, i) => (
            <View key={i} style={styles.acao}>
              <View
                style={[
                  styles.bolinha,
                  {
                    backgroundColor:
                      acao.prioridade === 'alta' ? cores.vermelho : cores.amarelo,
                  },
                ]}
              />
              <View style={styles.acaoInfo}>
                <Text style={styles.acaoTitulo}>{acao.titulo}</Text>
                <Text style={styles.acaoDetalhe}>{acao.detalhe}</Text>
              </View>
              {podeAcessar(acao.funcionalidade) ? (
                <Pressable onPress={() => aoNavegar(acao.rota)} style={styles.botaoVer}>
                  <Text style={styles.botaoVerTexto}>Resolver</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        )}
      </Cartao>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bloco: {
    marginBottom: 7,
  },
  skelMedidor: {
    borderRadius: 37,
  },
  skelLinha: {
    marginTop: 7,
  },
  cartaoCompacto: {
    padding: 15,
    marginBottom: 11,
  },
  secao: {
    ...tipografia.secao,
    fontSize: 14,
    color: cores.texto,
    marginBottom: 9,
  },
  saudeLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  medidorCentro: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medidorNota: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 23,
    fontWeight: '800',
    lineHeight: 25,
    letterSpacing: -0.5,
  },
  medidorDe: {
    ...tipografia.legenda,
    fontSize: 10,
    color: cores.textoSecundario,
  },
  saudeTexto: {
    flex: 1,
  },
  saudeMini: {
    ...tipografia.legenda,
    fontSize: 11,
    color: cores.textoSecundario,
    letterSpacing: 0.6,
  },
  saudeRotulo: {
    ...tipografia.secao,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
  saudeDica: {
    ...tipografia.legenda,
    fontSize: 11,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  briefingCard: {
    backgroundColor: cores.primariaClara,
    borderRadius: raio.lg,
    padding: 12,
    marginBottom: 11,
    borderWidth: 1,
    borderColor: '#D6E3F2',
  },
  briefingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  briefingIcone: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: cores.superficie,
    alignItems: 'center',
    justifyContent: 'center',
    ...sombra.cartao,
  },
  briefingTitulo: {
    ...tipografia.corpo,
    fontSize: 12,
    fontWeight: '800',
    color: cores.primariaEscura,
    flex: 1,
  },
  briefingNarrativa: {
    ...tipografia.corpo,
    fontSize: 12,
    color: cores.primariaEscura,
    marginTop: 9,
    lineHeight: 18,
  },
  coberturaLinha: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 9,
  },
  coberturaItem: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: cores.superficieAlternativa,
    borderRadius: 11,
    paddingVertical: 9,
  },
  coberturaNum: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  coberturaRot: {
    ...tipografia.legenda,
    fontSize: 11,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  coberturaAlerta: {
    ...tipografia.legenda,
    fontSize: 11,
    color: cores.vermelho,
    marginTop: 7,
  },
  vendasTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  vendasValor: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 23,
    fontWeight: '800',
    color: cores.texto,
    marginTop: 2,
    letterSpacing: -0.6,
  },
  vendasPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: raio.lg,
  },
  vendasPillTexto: {
    ...tipografia.legenda,
    fontSize: 11,
    fontWeight: '800',
  },
  vendasNota: {
    ...tipografia.legenda,
    fontSize: 11,
    color: cores.textoSecundario,
    marginTop: 7,
  },
  ritmoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 7,
  },
  ritmoTexto: {
    ...tipografia.legenda,
    fontSize: 11,
    color: cores.texto,
    fontWeight: '600',
    flex: 1,
  },
  vendasLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 7,
  },
  vendasLinkTexto: {
    ...tipografia.legenda,
    fontSize: 11,
    fontWeight: '700',
    color: cores.primaria,
  },
  acao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 7,
  },
  bolinha: {
    width: 3,
    height: 28,
    borderRadius: 2,
  },
  acaoInfo: {
    flex: 1,
  },
  acaoTitulo: {
    ...tipografia.corpo,
    fontSize: 12,
    fontWeight: '700',
    color: cores.texto,
  },
  acaoDetalhe: {
    ...tipografia.legenda,
    fontSize: 11,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  botaoVer: {
    backgroundColor: cores.primariaClara,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: raio.pill,
  },
  botaoVerTexto: {
    ...tipografia.legenda,
    fontSize: 11,
    fontWeight: '700',
    color: cores.primaria,
  },
  tudoOk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  tudoOkTexto: {
    ...tipografia.corpo,
    fontSize: 12,
    color: cores.texto,
    flex: 1,
  },
});

export default ResumoDoDia;
