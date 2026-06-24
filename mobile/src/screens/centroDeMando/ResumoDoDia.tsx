/**
 * Resumo do Dia (Centro de Mando embutido no topo da Home).
 *
 * Aparece **acima de todas as áreas** na tela inicial e é a cara da "gestão
 * inteligente":
 *  1. Saúde do negócio — uma nota 0–100 (verde/amarelo/vermelho) com o
 *     **porquê** em uma frase.
 *  2. Vendas de ontem — tema principal: faturamento do dia anterior com a
 *     variação vs. o período comparável.
 *  3. As 3 coisas de hoje — prioridades calculadas dos dados reais.
 *
 * Fase 1 — sem IA: tudo por REGRAS sobre dados que o backend já fornece, de
 * forma defensiva (se um serviço falhar, os demais continuam). Numa fase
 * futura, a Cluby (Gemini) pode narrar este resumo em linguagem natural.
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { arrecadacaoService, insumosService, vendasService } from '../../api/services';
import {
  InsumoProativo,
  PainelVendas,
  StatusArrecadacao,
  StatusVendas,
  TipoArrecadacao,
} from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Cartao } from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { formatarMoeda, hojeISO } from '../../utils/formato';
import { ROTULO_TIPO_ARRECADACAO } from '../../utils/rotulos';

/** Rotas para onde o atalho "Resolver" pode levar. */
type RotaAtalho = 'Importacoes' | 'Insumos' | 'PainelVendas';

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
  /** Navega para uma área quando o gestor toca em "Resolver". */
  aoNavegar: (rota: RotaAtalho) => void;
}

/** Data de ontem em formato ISO (YYYY-MM-DD), a partir de "hoje". */
function ontemISO(): string {
  // Meio-dia UTC evita problemas de fuso ao subtrair um dia.
  const d = new Date(`${hojeISO()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Queda relevante de vendas (em %) que vira sinal de atenção. */
const QUEDA_VENDAS_RELEVANTE = 10;

function calcularSaude(
  pendentes: number,
  criticos: number,
  metaAbaixo: boolean,
  vendasCairam: boolean,
): ResumoSaude {
  const nota = Math.max(
    0,
    Math.min(
      100,
      100 - pendentes * 8 - criticos * 10 - (metaAbaixo ? 15 : 0) - (vendasCairam ? 12 : 0),
    ),
  );
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

export function ResumoDoDia({ aoNavegar }: Props): React.ReactElement | null {
  const { podeAcessar } = useAuth();

  const req = useRequisicao(async () => {
    const hoje = hojeISO();
    const ontem = ontemISO();
    const [arrecadacao, vendasStatus, painelOntem, insumos] = await Promise.all([
      arrecadacaoService.status(hoje).catch(() => null as StatusArrecadacao | null),
      vendasService.status(hoje).catch(() => null as StatusVendas | null),
      // Painel referente a ONTEM: traz as vendas do dia anterior (comparativo
      // "dia") e os indicadores do mês (meta/projeção) até ontem.
      vendasService.painel(ontem).catch(() => null as PainelVendas | null),
      insumosService.listarProativo().catch(() => [] as InsumoProativo[]),
    ]);
    return { arrecadacao, vendasStatus, painelOntem, insumos };
  }, []);

  const dados = req.dados;
  if (!dados) {
    return null;
  }

  const { arrecadacao, vendasStatus, painelOntem, insumos } = dados;

  // ----- Sinais -----
  const pendentesLabels: string[] = [];
  if (arrecadacao) {
    for (const tipo of Object.keys(arrecadacao) as TipoArrecadacao[]) {
      if (arrecadacao[tipo] === 'PENDENTE') {
        pendentesLabels.push(ROTULO_TIPO_ARRECADACAO[tipo] ?? tipo);
      }
    }
  }
  if (vendasStatus && !vendasStatus.enviado) {
    pendentesLabels.push('Vendas por hora');
  }

  const criticos = insumos.filter((i) => i.nivel === 'CRITICO');

  // Vendas de ontem (comparativo do dia no painel referente a ontem).
  const vendasOntem = painelOntem?.comparativos?.dia ?? null;
  const variacaoOntem = vendasOntem?.variacao ?? null;
  const vendasCairam =
    variacaoOntem != null && variacaoOntem <= -QUEDA_VENDAS_RELEVANTE;

  const metaAbaixo =
    painelOntem != null &&
    painelOntem.projecaoVsMeta != null &&
    painelOntem.projecaoVsMeta < 0;

  // ----- Prioridades (As 3 coisas de hoje) -----
  const acoes: AcaoPrioritaria[] = [];
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
      detalhe: 'Abra o Painel de Vendas para entender o motivo.',
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

  const saude = calcularSaude(
    pendentesLabels.length,
    criticos.length,
    metaAbaixo,
    vendasCairam,
  );

  // "Porquê" da nota, em uma frase curta.
  const motivos: string[] = [];
  if (pendentesLabels.length > 0) motivos.push('arquivos pendentes');
  if (vendasCairam) motivos.push('queda nas vendas de ontem');
  if (criticos.length > 0) motivos.push('insumos críticos');
  if (metaAbaixo) motivos.push('vendas abaixo da meta');
  const porque =
    motivos.length === 0
      ? 'Sem pendências e indicadores saudáveis hoje.'
      : `Pesa na nota: ${motivos.join(', ')}.`;

  // Seta de tendência das vendas de ontem.
  const subiu = variacaoOntem != null && variacaoOntem >= 0;
  const corVar =
    variacaoOntem == null ? cores.textoSecundario : subiu ? cores.verde : cores.vermelho;

  return (
    <View style={styles.bloco}>
      <Text style={styles.secao}>Hoje</Text>

      {/* Saúde do negócio */}
      <Cartao>
        <View style={styles.saudeLinha}>
          <View style={[styles.medidor, { backgroundColor: saude.fundo }]}>
            <Text style={[styles.medidorNota, { color: saude.cor }]}>{saude.nota}</Text>
            <Text style={styles.medidorDe}>/ 100</Text>
          </View>
          <View style={styles.saudeTexto}>
            <Text style={styles.saudeMini}>SAÚDE DO NEGÓCIO</Text>
            <Text style={[styles.saudeRotulo, { color: saude.cor }]}>{saude.rotulo}</Text>
            <Text style={styles.saudeDica}>{porque}</Text>
          </View>
        </View>
      </Cartao>

      {/* Vendas de ontem — tema principal */}
      {vendasOntem ? (
        <Cartao>
          <View style={styles.vendasTopo}>
            <View>
              <Text style={styles.saudeMini}>VENDAS DE ONTEM</Text>
              <Text style={styles.vendasValor}>{formatarMoeda(vendasOntem.atual)}</Text>
            </View>
            {variacaoOntem != null ? (
              <View style={[styles.vendasPill, { backgroundColor: subiu ? cores.verdeFundo : cores.vermelhoFundo }]}>
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
              ? `${subiu ? 'Acima' : 'Abaixo'} do período comparável.`
              : 'Sem comparação disponível.'}
            {painelOntem?.mediaDiaria
              ? `  ·  Média diária do mês: ${formatarMoeda(painelOntem.mediaDiaria)}`
              : ''}
          </Text>
          {podeAcessar('PAINEL_VENDAS_VISUALIZAR') ? (
            <Pressable onPress={() => aoNavegar('PainelVendas')} style={styles.vendasLink}>
              <Text style={styles.vendasLinkTexto}>Ver Painel de Vendas</Text>
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
  medidor: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medidorNota: {
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 28,
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
