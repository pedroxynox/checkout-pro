/**
 * Tema visual do app Stok Center.
 *
 * Centraliza cores, espaçamentos, tipografia e raios de borda para manter as
 * telas consistentes. As cores de status (verde/amarelo/vermelho) refletem a
 * classificação dos indicadores do backend (`StatusCor`).
 */

export const cores = {
  // Identidade Stok Center
  primaria: '#0B5FFF',
  primariaEscura: '#0A48BF',
  primariaClara: '#E7F0FF',

  fundo: '#F4F6FB',
  superficie: '#FFFFFF',
  superficieAlternativa: '#F0F2F8',

  texto: '#11203A',
  textoSecundario: '#5A6886',
  textoInverso: '#FFFFFF',

  borda: '#DDE3EF',
  divisor: '#EAEEF6',

  // Cores semânticas de status de indicadores (StatusCor do backend)
  verde: '#1E9E5A',
  verdeFundo: '#E4F6EC',
  amarelo: '#C99700',
  amareloFundo: '#FBF3DA',
  vermelho: '#D23B3B',
  vermelhoFundo: '#FBE6E6',

  // Estados auxiliares
  sucesso: '#1E9E5A',
  alerta: '#C99700',
  erro: '#D23B3B',
  info: '#0B5FFF',

  // Status de fiscais
  disponivel: '#1E9E5A',
  emIntervalo: '#C99700',
  emAtendimento: '#0B5FFF',
} as const;

export const espacamento = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const raio = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

export const tipografia = {
  titulo: { fontSize: 22, fontWeight: '700' as const },
  subtitulo: { fontSize: 18, fontWeight: '600' as const },
  secao: { fontSize: 15, fontWeight: '700' as const },
  corpo: { fontSize: 15, fontWeight: '400' as const },
  rotulo: { fontSize: 13, fontWeight: '600' as const },
  legenda: { fontSize: 12, fontWeight: '400' as const },
} as const;

export const sombra = {
  cartao: {
    shadowColor: '#0B1B3A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
} as const;

export type StatusCor = 'VERDE' | 'AMARELO' | 'VERMELHO';

/** Mapeia uma StatusCor do backend para as cores de texto/fundo do tema. */
export function coresParaStatus(status: StatusCor): {
  cor: string;
  fundo: string;
  rotulo: string;
} {
  switch (status) {
    case 'VERDE':
      return { cor: cores.verde, fundo: cores.verdeFundo, rotulo: 'Dentro da meta' };
    case 'AMARELO':
      return { cor: cores.amarelo, fundo: cores.amareloFundo, rotulo: 'Atenção' };
    case 'VERMELHO':
      return { cor: cores.vermelho, fundo: cores.vermelhoFundo, rotulo: 'Fora da meta' };
  }
}

export const tema = {
  cores,
  espacamento,
  raio,
  tipografia,
  sombra,
};

export default tema;
