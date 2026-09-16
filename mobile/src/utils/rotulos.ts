/**
 * Rótulos legíveis (pt-BR) para enums do domínio e as definições dos
 * indicadores de arrecadação usados na UI (Indicadores e Importações).
 */
import { StatusFiscal, TipoArrecadacao } from '../api/types';

export const ROTULO_STATUS_FISCAL: Record<StatusFiscal, string> = {
  DISPONIVEL: 'Disponível',
  INTERVALO: 'Em intervalo',
  FORA_EXPEDIENTE: 'Fora de expediente',
};

// ----- Arrecadação por operador (indicadores a partir dos .txt) -----

export interface DefinicaoArrecadacao {
  tipo: TipoArrecadacao;
  titulo: string;
  /** 'FIXA' = meta em R$ (ex.: troco/recargas = 2000); 'VENDAS' = % sobre vendas. */
  base: 'FIXA' | 'VENDAS';
  meta: number;
  sentido: 'MAIOR_MELHOR' | 'MENOR_MELHOR';
  /** Texto curto explicando o indicador para o usuário. */
  descricao: string;
  /** Ícone (Ionicons) representando o indicador. */
  icone: string;
  /** Mostra a lista de detalhe (operador, autorizou, motivo) — ex.: cupom. */
  mostraDetalhe?: boolean;
  /** Quem aparece no ranking: "operadores" (padrão) ou "fiscais". */
  rankingDe?: string;
}

// Espelha CONFIG_ARRECADACAO do backend (arrecadacao.domain.ts).
export const ARRECADACAO: DefinicaoArrecadacao[] = [
  {
    tipo: 'TROCO_SOLIDARIO',
    titulo: 'Troco Solidário',
    base: 'FIXA',
    meta: 2000,
    sentido: 'MAIOR_MELHOR',
    descricao: 'Quanto cada operador arrecadou. Meta fixa de R$ 2.000.',
    icone: 'heart-outline',
  },
  {
    tipo: 'RECARGAS_CELULAR',
    titulo: 'Recargas de Celular',
    base: 'FIXA',
    meta: 2000,
    sentido: 'MAIOR_MELHOR',
    descricao: 'Recargas vendidas por operador. Meta fixa de R$ 2.000.',
    icone: 'phone-portrait-outline',
  },
  {
    tipo: 'CANCELAMENTO_ITENS',
    titulo: 'Cancelamento de Itens',
    base: 'VENDAS',
    meta: 0.75,
    sentido: 'MENOR_MELHOR',
    descricao: 'Valor cancelado por operador. Meta de até 0,75% das vendas.',
    icone: 'remove-circle-outline',
  },
  {
    tipo: 'CANCELAMENTO_CUPOM',
    titulo: 'Cancelamento de Cupom',
    base: 'VENDAS',
    meta: 0.5,
    sentido: 'MENOR_MELHOR',
    descricao: 'Cupons cancelados por operador. Meta de até 0,5% das vendas.',
    icone: 'receipt-outline',
    mostraDetalhe: true,
  },
  {
    tipo: 'DEVOLUCOES',
    titulo: 'Devoluções',
    base: 'VENDAS',
    meta: 0.05,
    sentido: 'MENOR_MELHOR',
    descricao: 'Valor devolvido por fiscal. Meta de até 0,05% das vendas.',
    icone: 'return-down-back-outline',
    rankingDe: 'fiscais',
  },
];

/**
 * Definição do indicador **Cancelamentos Totais** (ADR 0025).
 *
 * Fica **fora** do array `ARRECADACAO` de propósito: aquele array é a lista dos
 * arquivos a importar (`ImportacoesScreen` o transforma na sequência numerada) e
 * também espelha `TIPOS_ARRECADACAO`, o contrato do fechamento do dia. Este
 * indicador é **calculado** a partir das duas metades de cancelamento — não tem
 * arquivo. Entrar no array faria a tela pedir para sempre um arquivo que não
 * existe e o dia nunca fecharia.
 *
 * A meta aqui é só o **padrão** exibido antes de o servidor responder: o valor do
 * mês vem de `metas_mensais` (Centro de Controle ▸ Metas), e é o do servidor que
 * decide a cor.
 */
export const CANCELAMENTOS_TOTAIS_DEF = {
  tipo: 'CANCELAMENTOS_TOTAIS' as const,
  titulo: 'Cancelamentos Totais',
  base: 'VENDAS' as const,
  metaPadrao: 0.75,
  sentido: 'MENOR_MELHOR' as const,
  descricao:
    'Cancelamento de itens + cancelamento de cupom somados, sobre as vendas. ' +
    'Teto próprio, independente das metas das duas partes.',
  icone: 'close-circle-outline',
};

export const ROTULO_TIPO_ARRECADACAO: Record<TipoArrecadacao, string> =
  ARRECADACAO.reduce(
    (acc, d) => {
      acc[d.tipo] = d.titulo;
      return acc;
    },
    {} as Record<TipoArrecadacao, string>,
  );
