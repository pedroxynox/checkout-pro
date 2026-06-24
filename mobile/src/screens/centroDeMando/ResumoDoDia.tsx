/**
 * Resumo do Dia (Centro de Mando embutido no topo da Home).
 *
 * É a cara da "gestão inteligente": aparece acima de todas as áreas e mostra
 *  1. Saúde do negócio — nota 0–100 num **medidor circular**, com o porquê.
 *  2. Vendas de ontem — destaque (para perfis de gestão).
 *  3. As 3 coisas de hoje — prioridades **personalizadas por perfil**.
 *
 * Prioridades por perfil (a pedido):
 *  - FISCAL: checklist (se não feito), insumos, indicadores (metas), faltas e
 *    cobertura do turno de hoje.
 *  - GERENTE/SUPERVISOR: vendas e meta de faturamento (com o "ritmo da meta").
 *  - IMPORTADOR: apenas a carga de arquivos do dia.
 *  - GERENTE_DESENVOLVEDOR: tudo.
 *
 * Fase 1 — sem IA: tudo por REGRAS sobre dados que o backend já fornece, de
 * forma defensiva (cada chamada tem catch; só busca o que o perfil precisa).
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import {
  arrecadacaoService,
  checklistService,
  insumosService,
  operadoresService,
  vendasService,
} from '../../api/services';
import {
  DiaOperadores,
  InsumoProativo,
  PainelAtencao,
  PainelVendas,
  Perfil,
  StatusArrecadacao,
  StatusChecklist,
  StatusVendas,
  TipoArrecadacao,
} from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { useAssistente } from '../../assistente/AssistenteContext';
import { Cartao } from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { formatarMoeda, hojeISO } from '../../utils/formato';
import { ROTULO_TIPO_ARRECADACAO } from '../../utils/rotulos';

/** Rotas para onde o atalho "Resolver" pode levar. */
type RotaAtalho =
  | 'Importacoes'
  | 'Insumos'
  | 'PainelVendas'
  | 'Checklist'
  | 'Indicadores'
  | 'Operadores';

/** Temas que compõem a saúde; quais aparecem depende do perfil. */
type Tema =
  | 'checklist'
  | 'insumos'
  | 'indicadores'
  | 'faltas'
  | 'cobertura'
  | 'carga'
  | 'ventas'
  | 'metaVendas';

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
}

/** Conjunto de temas relevantes para cada perfil. */
function temasDoPerfil(perfil: Perfil | null): Set<Tema> {
  if (perfil === 'GERENTE_DESENVOLVEDOR') {
    return new Set<Tema>([
      'checklist',
      'insumos',
      'indicadores',
      'faltas',
      'cobertura',
      'carga',
      'ventas',
      'metaVendas',
    ]);
  }
  if (perfil === 'GERENTE' || perfil === 'SUPERVISOR') {
    return new Set<Tema>(['ventas', 'metaVendas']);
  }
  if (perfil === 'IMPORTADOR') {
    return new Set<Tema>(['carga']);
  }
  // FISCAL (e padrão): rotina operacional do dia.
  return new Set<Tema>(['checklist', 'insumos', 'indicadores', 'faltas', 'cobertura']);
}

/** Data de ontem (ISO), a partir de "hoje". */
function ontemISO(): string {
  const d = new Date(`${hojeISO()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const QUEDA_VENDAS_RELEVANTE = 10;

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
  const tamanho = 84;
  const traco = 9;
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

export function ResumoDoDia({ aoNavegar }: Props): React.ReactElement | null {
  const { podeAcessar, perfil } = useAuth();
  const { pedirBriefing } = useAssistente();
  const temas = temasDoPerfil(perfil);

  const req = useRequisicao(async () => {
    const t = temasDoPerfil(perfil);
    const hoje = hojeISO();
    const ontem = ontemISO();
    const semVendas = !t.has('ventas') && !t.has('metaVendas');
    const [arrec, vendaStatus, painelOntem, insumos, atencao, ckAb, ckFe, opDia] =
      await Promise.all([
        t.has('carga')
          ? arrecadacaoService.status(hoje).catch(() => null as StatusArrecadacao | null)
          : Promise.resolve(null as StatusArrecadacao | null),
        t.has('carga')
          ? vendasService.status(hoje).catch(() => null as StatusVendas | null)
          : Promise.resolve(null as StatusVendas | null),
        semVendas
          ? Promise.resolve(null as PainelVendas | null)
          : vendasService.painel(ontem).catch(() => null as PainelVendas | null),
        t.has('insumos')
          ? insumosService.listarProativo().catch(() => [] as InsumoProativo[])
          : Promise.resolve([] as InsumoProativo[]),
        t.has('indicadores')
          ? arrecadacaoService.painelAtencao(hoje).catch(() => null as PainelAtencao | null)
          : Promise.resolve(null as PainelAtencao | null),
        t.has('checklist')
          ? checklistService.status('ABERTURA', hoje).catch(() => null as { status: StatusChecklist } | null)
          : Promise.resolve(null as { status: StatusChecklist } | null),
        t.has('checklist')
          ? checklistService.status('FECHAMENTO', hoje).catch(() => null as { status: StatusChecklist } | null)
          : Promise.resolve(null as { status: StatusChecklist } | null),
        t.has('faltas') || t.has('cobertura')
          ? operadoresService.dia(hoje).catch(() => null as DiaOperadores | null)
          : Promise.resolve(null as DiaOperadores | null),
      ]);
    return { arrec, vendaStatus, painelOntem, insumos, atencao, ckAb, ckFe, opDia };
  }, [perfil]);

  const dados = req.dados;
  if (!dados) {
    return null;
  }

  const { arrec, vendaStatus, painelOntem, insumos, atencao, ckAb, ckFe, opDia } = dados;
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

  const vendasOntem = painelOntem?.comparativos?.dia ?? null;
  const variacaoOntem = vendasOntem?.variacao ?? null;
  const vendasCairam =
    variacaoOntem != null && variacaoOntem <= -QUEDA_VENDAS_RELEVANTE;
  const metaAbaixo =
    painelOntem != null &&
    painelOntem.projecaoVsMeta != null &&
    painelOntem.projecaoVsMeta < 0;

  // Recomendação extra (gestão): "ritmo da meta" — quanto ainda falta vender
  // por dia, em média, para fechar a meta do mês. Ajuda a decidir o foco do dia.
  const ritmoMeta = (() => {
    if (!temas.has('metaVendas') || !painelOntem || painelOntem.metaMensal <= 0) {
      return null;
    }
    const faltam = painelOntem.metaMensal - painelOntem.arrecadadoMes;
    const diasRestantes = Math.max(1, painelOntem.diasNoMes - painelOntem.diasComVenda);
    if (faltam <= 0) {
      return { batida: true as const, porDia: 0, diasRestantes };
    }
    return { batida: false as const, porDia: faltam / diasRestantes, diasRestantes };
  })();

  // ----- Prioridades (As 3 coisas de hoje) -----
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
      titulo: `Falta carregar ${pendentesLabels.length} arquivo(s) hoje`,
      detalhe: pendentesLabels.slice(0, 3).join(', '),
      rota: 'Importacoes',
      funcionalidade: 'IMPORTACOES',
    });
  }
  if (vendasCairam && variacaoOntem != null) {
    acoes.push({
      prioridade: 'alta',
      titulo: `Vendas de ontem caíram ${Math.abs(Math.round(variacaoOntem))}%`,
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
  if (metaAbaixo && painelOntem) {
    const faltam = Math.abs(Math.round(painelOntem.projecaoVsMeta ?? 0));
    acoes.push({
      prioridade: 'media',
      titulo: `Projeção ${faltam}% abaixo da meta do mês`,
      detalhe: `${Math.round(painelOntem.metaProgresso * 100)}% da meta já atingido`,
      rota: 'PainelVendas',
      funcionalidade: 'PAINEL_VENDAS_VISUALIZAR',
    });
  }

  const top3 = [...acoes]
    .sort((a, b) => (a.prioridade === 'alta' ? 0 : 1) - (b.prioridade === 'alta' ? 0 : 1))
    .slice(0, 3);

  // ----- Nota da saúde (só sinais relevantes ao perfil) -----
  const nota = Math.max(
    0,
    Math.min(
      100,
      100 -
        (aberturaNaoFeita ? 20 : 0) -
        (fechamentoNaoFeito ? 20 : 0) -
        pendentesLabels.length * 8 -
        (vendasCairam ? 12 : 0) -
        criticos.length * 10 -
        indicadoresForaMeta * 6 -
        faltas * 8 -
        (metaAbaixo ? 15 : 0),
    ),
  );
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

  const subiu = variacaoOntem != null && variacaoOntem >= 0;
  const corVar =
    variacaoOntem == null ? cores.textoSecundario : subiu ? cores.verde : cores.vermelho;

  // Briefing da Cluby: monta uma pergunta com os números do dia para que a
  // Cluby (IA) devolva um resumo curto e diga o que priorizar.
  const perguntaBriefing = (() => {
    const partes: string[] = [`saúde do negócio ${saude.nota}/100`];
    if (vendasOntem) {
      partes.push(
        `vendas de ontem ${formatarMoeda(vendasOntem.atual)}${
          variacaoOntem != null
            ? ` (${variacaoOntem >= 0 ? '+' : ''}${Math.round(
                variacaoOntem,
              )}% vs. mesmo dia da semana passada)`
            : ''
        }`,
      );
    }
    if (ritmoMeta && !ritmoMeta.batida) {
      partes.push(
        `falta ~${formatarMoeda(ritmoMeta.porDia)}/dia para bater a meta do mês`,
      );
    }
    if (pendentesLabels.length > 0) {
      partes.push(`${pendentesLabels.length} arquivo(s) pendente(s)`);
    }
    if (criticos.length > 0) partes.push(`${criticos.length} insumo(s) crítico(s)`);
    if (indicadoresForaMeta > 0) {
      partes.push(`${indicadoresForaMeta} indicador(es) fora da meta`);
    }
    if (temCobertura) {
      partes.push(`cobertura de hoje: ${trabalhando} no turno, ${faltas} falta(s)`);
    } else if (faltas > 0) {
      partes.push(`${faltas} falta(s) de operadores`);
    }
    return (
      'Me dê um briefing rápido do dia com base nestes números: ' +
      `${partes.join('; ')}. O que devo priorizar agora? Responda curto e prático.`
    );
  })();

  return (
    <View style={styles.bloco}>
      <Text style={styles.secao}>Hoje</Text>

      {/* Saúde do negócio com medidor circular */}
      <Cartao>
        <View style={styles.saudeLinha}>
          <MedidorCircular nota={saude.nota} cor={saude.cor} />
          <View style={styles.saudeTexto}>
            <Text style={styles.saudeMini}>SAÚDE DO NEGÓCIO</Text>
            <Text style={[styles.saudeRotulo, { color: saude.cor }]}>{saude.rotulo}</Text>
            <Text style={styles.saudeDica}>{porque}</Text>
          </View>
        </View>
      </Cartao>

      {/* Briefing da Cluby (IA): abre o chat já com o resumo do dia */}
      <Pressable
        onPress={() => pedirBriefing(perguntaBriefing)}
        style={({ pressed }) => [styles.briefing, pressed && styles.briefingPress]}
        accessibilityRole="button"
        accessibilityLabel="Pedir um briefing à Cluby"
      >
        <Text style={styles.briefingEmoji}>🤖</Text>
        <View style={styles.briefingTexto}>
          <Text style={styles.briefingTitulo}>Pedir um briefing à Cluby</Text>
          <Text style={styles.briefingSub}>
            Resumo do dia e o que priorizar, em segundos.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={cores.primaria} />
      </Pressable>

      {/* Vendas de ontem — destaque para perfis de gestão */}
      {temas.has('ventas') && vendasOntem ? (
        <Cartao>
          <View style={styles.vendasTopo}>
            <View>
              <Text style={styles.saudeMini}>VENDAS DE ONTEM</Text>
              <Text style={styles.vendasValor}>{formatarMoeda(vendasOntem.atual)}</Text>
            </View>
            {variacaoOntem != null ? (
              <View
                style={[
                  styles.vendasPill,
                  { backgroundColor: subiu ? cores.verdeFundo : cores.vermelhoFundo },
                ]}
              >
                <Ionicons
                  name={subiu ? 'trending-up' : 'trending-down'}
                  size={16}
                  color={corVar}
                />
                <Text style={[styles.vendasPillTexto, { color: corVar }]}>
                  {subiu ? '+' : ''}
                  {Math.round(variacaoOntem)}%
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.vendasNota}>
            {variacaoOntem != null
              ? `${subiu ? 'Acima' : 'Abaixo'} do mesmo dia da semana passada.`
              : 'Sem comparação disponível.'}
            {painelOntem?.mediaDiaria
              ? `  ·  Média diária do mês: ${formatarMoeda(painelOntem.mediaDiaria)}`
              : ''}
          </Text>
          {ritmoMeta ? (
            <View style={styles.ritmoBox}>
              <Ionicons
                name={ritmoMeta.batida ? 'flag' : 'speedometer-outline'}
                size={16}
                color={ritmoMeta.batida ? cores.verde : cores.primaria}
              />
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
              <Ionicons name="chevron-forward" size={16} color={cores.primaria} />
            </Pressable>
          ) : null}
        </Cartao>
      ) : null}

      {/* Cobertura do turno de hoje (operadores trabalhando vs faltas/folgas) */}
      {temCobertura ? (
        <Cartao>
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
              <Ionicons name="chevron-forward" size={16} color={cores.primaria} />
            </Pressable>
          ) : null}
        </Cartao>
      ) : null}

      {/* As 3 coisas de hoje */}
      <Cartao titulo="As 3 coisas de hoje">
        {top3.length === 0 ? (
          <View style={styles.tudoOk}>
            <Ionicons name="checkmark-circle" size={20} color={cores.verde} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  bloco: {
    marginBottom: espacamento.sm,
  },
  secao: {
    ...tipografia.secao,
    color: cores.texto,
    marginBottom: espacamento.md,
  },
  saudeLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.md,
  },
  medidorCentro: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medidorNota: {
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 26,
  },
  medidorDe: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  saudeTexto: {
    flex: 1,
  },
  saudeMini: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    letterSpacing: 0.6,
  },
  saudeRotulo: {
    ...tipografia.secao,
    fontWeight: '800',
    marginTop: 2,
  },
  saudeDica: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  briefing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    backgroundColor: cores.primariaClara,
    borderRadius: raio.lg,
    padding: espacamento.md,
    marginBottom: espacamento.md,
  },
  briefingPress: {
    opacity: 0.85,
  },
  briefingEmoji: {
    fontSize: 22,
  },
  briefingTexto: {
    flex: 1,
  },
  briefingTitulo: {
    ...tipografia.corpo,
    fontWeight: '800',
    color: cores.primariaEscura,
  },
  briefingSub: {
    ...tipografia.legenda,
    color: cores.primariaEscura,
    marginTop: 1,
  },
  coberturaLinha: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: espacamento.sm,
  },
  coberturaItem: {
    alignItems: 'center',
  },
  coberturaNum: {
    fontSize: 22,
    fontWeight: '800',
  },
  coberturaRot: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  coberturaAlerta: {
    ...tipografia.legenda,
    color: cores.vermelho,
    marginTop: espacamento.sm,
  },
  vendasTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  vendasValor: {
    fontSize: 26,
    fontWeight: '800',
    color: cores.texto,
    marginTop: 2,
  },
  vendasPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: espacamento.sm,
    paddingVertical: 4,
    borderRadius: raio.lg,
  },
  vendasPillTexto: {
    ...tipografia.legenda,
    fontWeight: '800',
  },
  vendasNota: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
  },
  ritmoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: espacamento.sm,
  },
  ritmoTexto: {
    ...tipografia.legenda,
    color: cores.texto,
    fontWeight: '600',
    flex: 1,
  },
  vendasLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: espacamento.sm,
  },
  vendasLinkTexto: {
    ...tipografia.legenda,
    fontWeight: '700',
    color: cores.primaria,
  },
  acao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    paddingVertical: espacamento.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
  },
  bolinha: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  acaoInfo: {
    flex: 1,
  },
  acaoTitulo: {
    ...tipografia.corpo,
    fontWeight: '700',
    color: cores.texto,
  },
  acaoDetalhe: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  botaoVer: {
    backgroundColor: cores.vermelhoFundo,
    paddingHorizontal: espacamento.md,
    paddingVertical: 6,
    borderRadius: raio.lg,
  },
  botaoVerTexto: {
    ...tipografia.legenda,
    fontWeight: '700',
    color: cores.vermelho,
  },
  tudoOk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
  },
  tudoOkTexto: {
    ...tipografia.corpo,
    color: cores.texto,
    flex: 1,
  },
});

export default ResumoDoDia;
