/** Rótulos legíveis (pt-BR) para enums do domínio. */
import {
  CategoriaInsumo,
  IndicadorTipo,
  StatusFiscal,
  TipoArquivo,
} from '../api/types';

export const ROTULO_TIPO_ARQUIVO: Record<TipoArquivo, string> = {
  CANCELAMENTO_ITENS: 'Cancelamento de itens',
  TROCO_SOLIDARIO: 'Troco solidário',
  RECARGAS_CELULAR: 'Recargas de celular',
  DEVOLUCOES: 'Devoluções',
};

export const TIPOS_ARQUIVO: TipoArquivo[] = [
  'CANCELAMENTO_ITENS',
  'TROCO_SOLIDARIO',
  'RECARGAS_CELULAR',
  'DEVOLUCOES',
];

export const ROTULO_CATEGORIA_INSUMO: Record<CategoriaInsumo, string> = {
  SACOLA: 'Sacola',
  BOBINA: 'Bobina',
  PANO: 'Pano',
  OUTRO: 'Outro',
};

export const ROTULO_STATUS_FISCAL: Record<StatusFiscal, string> = {
  DISPONIVEL: 'Disponível',
  EM_INTERVALO: 'Em intervalo',
  EM_ATENDIMENTO: 'Em atendimento',
};

export interface DefinicaoIndicador {
  tipo: IndicadorTipo;
  titulo: string;
  meta: number;
  /** Unidade exibida: '%' (sobre vendas) ou 'R$'. */
  unidade: '%' | 'R$';
  sentido: 'MENOR_MELHOR' | 'MAIOR_MELHOR';
  /** Limite amarelo padrão sugerido para a classificação de cor. */
  limiteAmareloPadrao: number;
}

// Metas oficiais (ver indicadores.domain do backend).
export const INDICADORES: DefinicaoIndicador[] = [
  {
    tipo: 'CANCELAMENTO',
    titulo: 'Cancelamento de itens',
    meta: 0.75,
    unidade: '%',
    sentido: 'MENOR_MELHOR',
    limiteAmareloPadrao: 1.0,
  },
  {
    tipo: 'DEVOLUCOES',
    titulo: 'Devoluções',
    meta: 0.05,
    unidade: '%',
    sentido: 'MENOR_MELHOR',
    limiteAmareloPadrao: 0.1,
  },
  {
    tipo: 'TROCO',
    titulo: 'Troco solidário',
    meta: 2000,
    unidade: 'R$',
    sentido: 'MAIOR_MELHOR',
    limiteAmareloPadrao: 1500,
  },
  {
    tipo: 'RECARGAS',
    titulo: 'Recargas de celular',
    meta: 2000,
    unidade: 'R$',
    sentido: 'MAIOR_MELHOR',
    limiteAmareloPadrao: 1500,
  },
];
