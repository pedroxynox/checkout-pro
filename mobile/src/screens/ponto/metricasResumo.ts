/**
 * Identidade das seis métricas do "Resumo do time" da Central de Jornada.
 *
 * **Fonte única do visual e da leitura de cada métrica**, usada pelas duas telas
 * que a exibem: a card no resumo da Central e o ranking que ela abre. Se ícone,
 * cor ou formatação vivessem duplicados nas duas, uma mudança em só uma delas
 * faria a card e o ranking discordarem — e o usuário perderia a referência de
 * onde estava.
 *
 * Cada métrica declara também **de onde sai o número**: `valorTotal` para o total
 * do time (a card) e `valorPessoa` para o valor de uma pessoa (o ranking). Assim
 * a soma da coluna do ranking é, por construção, o número da card.
 */
import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import type {
  CentralTotais,
  MetricaRanking,
  RankingPessoa,
} from '../../api/services/centralJornada';
import { formatarDuracao } from '../../utils/formato';
import { cores } from '../../theme';

/** Contagem com a unidade certa no singular e no plural. */
export function contar(
  valor: number,
  singular: string,
  plural: string,
): string {
  return `${valor} ${valor === 1 ? singular : plural}`;
}

export interface IdentidadeMetrica {
  /** Rótulo curto da card ("Extras 50%"). */
  rotulo: string;
  /** Título da tela de ranking. */
  titulo: string;
  icone: React.ComponentProps<typeof Ionicons>['name'];
  cor: string;
  fundo: string;
  /**
   * `POSITIVA`: estar no topo é bom (horas extras). `NEGATIVA`: estar no topo
   * pede atenção (faltas, atrasos, TAC, conflitos). Cor não basta para dizer
   * isso — a semântica é escrita em palavras no ranking.
   */
  semantica: 'POSITIVA' | 'NEGATIVA';
  /** Como exibir o valor (duração ou contagem com unidade). */
  formatar: (valor: number) => string;
  /** Valor do time (o número da card no resumo da Central). */
  valorTotal: (totais: CentralTotais) => number;
  /** Valor de uma pessoa (o que ordena o ranking). */
  valorPessoa: (pessoa: RankingPessoa) => number;
}

export const IDENTIDADE_METRICA: Record<MetricaRanking, IdentidadeMetrica> = {
  EXTRAS_50: {
    rotulo: 'Extras 50%',
    titulo: 'Ranking — Extras 50%',
    icone: 'time-outline',
    cor: cores.verde,
    fundo: cores.verdeFundo,
    semantica: 'POSITIVA',
    formatar: formatarDuracao,
    // As 50% REAIS do momento (já descontado o que a pessoa deve) — o mesmo
    // critério que a Central sempre usou na card.
    valorTotal: (t) => t.extras50AtualMs,
    valorPessoa: (p) => p.extras50AtualMs,
  },
  EXTRAS_100: {
    rotulo: 'Extras 100%',
    titulo: 'Ranking — Extras 100%',
    icone: 'time-outline',
    cor: cores.verde,
    fundo: cores.verdeFundo,
    semantica: 'POSITIVA',
    formatar: formatarDuracao,
    valorTotal: (t) => t.extras100Ms,
    valorPessoa: (p) => p.extras100Ms,
  },
  FALTAS: {
    rotulo: 'Faltas',
    titulo: 'Ranking — Faltas',
    icone: 'person-outline',
    cor: cores.laranja,
    fundo: cores.laranjaFundo,
    semantica: 'NEGATIVA',
    formatar: (v) => contar(v, 'falta', 'faltas'),
    valorTotal: (t) => t.faltas,
    valorPessoa: (p) => p.faltas,
  },
  ATESTADOS: {
    rotulo: 'Atestados',
    titulo: 'Ranking — Atestados',
    icone: 'medkit-outline',
    cor: cores.azul,
    fundo: cores.azulFundo,
    // Atestado é ausência ABONADA, não uma infração: azul (neutro/informativo)
    // e semântica positiva no texto — quem tem mais atestados não está "pior".
    semantica: 'POSITIVA',
    formatar: (v) => contar(v, 'atestado', 'atestados'),
    valorTotal: (t) => t.atestados,
    valorPessoa: (p) => p.atestados,
  },
  TAC: {
    rotulo: 'TAC',
    titulo: 'Ranking — TAC',
    icone: 'document-text-outline',
    cor: cores.roxo,
    fundo: cores.roxoFundo,
    semantica: 'NEGATIVA',
    formatar: (v) => contar(v, 'dia', 'dias'),
    valorTotal: (t) => t.diasTac,
    valorPessoa: (p) => p.diasTac,
  },
  ATRASOS: {
    rotulo: 'Atrasos',
    titulo: 'Ranking — Atrasos',
    icone: 'alarm-outline',
    cor: cores.amarelo,
    fundo: cores.amareloFundo,
    semantica: 'NEGATIVA',
    formatar: (v) => contar(v, 'atraso', 'atrasos'),
    valorTotal: (t) => t.atrasos,
    valorPessoa: (p) => p.atrasos,
  },
  CONFLITOS: {
    rotulo: 'Conflitos',
    titulo: 'Ranking — Conflitos',
    icone: 'warning-outline',
    cor: cores.vermelho,
    fundo: cores.vermelhoFundo,
    semantica: 'NEGATIVA',
    formatar: (v) => contar(v, 'conflito', 'conflitos'),
    valorTotal: (t) => t.conflitos,
    valorPessoa: (p) => p.conflitos,
  },
};

/**
 * Ordem das cards na grade do resumo. É **fixa**: antes, as cards de atraso e
 * conflito só apareciam quando havia ocorrência, então a grade mudava de tamanho
 * e a posição de cada botão dançava. Agora as seis estão sempre no mesmo lugar —
 * as zeradas ficam apenas esmaecidas.
 */
export const ORDEM_METRICAS: MetricaRanking[] = [
  'EXTRAS_50',
  'EXTRAS_100',
  'FALTAS',
  'ATESTADOS',
  'TAC',
  'ATRASOS',
  'CONFLITOS',
];
