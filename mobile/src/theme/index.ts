/**
 * Tema visual do app Check-out PRO.
 *
 * Centraliza cores, espaçamentos, tipografia, raios e sombras para manter as
 * telas consistentes — agora com uma identidade SaaS/executiva (azul corporativo
 * #0F4C81 → #0A2540), inspirada em dashboards como Stripe, Linear e Power BI.
 *
 * IMPORTANTE: as CHAVES deste arquivo são usadas em todo o app. Aqui mudamos
 * apenas os VALORES (cores/tamanhos) e adicionamos chaves novas — sem renomear
 * nem remover nenhuma chave existente, para não quebrar nenhuma tela.
 *
 * As cores de status (verde/amarelo/vermelho) refletem a classificação dos
 * indicadores do backend (`StatusCor`).
 */

export const cores = {
  // Identidade SaaS executiva (azul corporativo)
  primaria: '#0F4C81',
  primariaEscura: '#0A2540',
  primariaClara: '#E8EFF7',

  fundo: '#F8FAFC',
  superficie: '#FFFFFF',
  superficieAlternativa: '#F1F5F9',

  texto: '#111827',
  textoSecundario: '#6B7280',
  textoInverso: '#FFFFFF',

  borda: '#E5E7EB',
  divisor: '#F1F5F9',

  // Cores semânticas de status de indicadores (StatusCor do backend)
  verde: '#10B981',
  verdeFundo: '#ECFDF5',
  amarelo: '#F59E0B',
  amareloFundo: '#FEF3C7',
  vermelho: '#EF4444',
  vermelhoFundo: '#FEE2E2',

  // Acentos auxiliares (cartões de métrica/ação com ícone em caixa suave).
  // Azul vivo para info/horas-extra; roxo para TAC; laranja para faltas/atrasos.
  azul: '#2563EB',
  azulFundo: '#EFF6FF',
  roxo: '#9333EA',
  roxoFundo: '#F5F0FF',
  laranja: '#F97316',
  laranjaFundo: '#FFF1E8',

  // Estados auxiliares
  sucesso: '#10B981',
  alerta: '#F59E0B',
  erro: '#EF4444',
  info: '#0F4C81',

  // Status de fiscais
  disponivel: '#10B981',
  emIntervalo: '#F59E0B',
  emAtendimento: '#0A2540',
} as const;

/**
 * Degradês usados na interface (header premium etc.).
 * Tipados como tuplas `[string, string]` para casar com o prop `colors` do
 * LinearGradient sem conflitos de readonly.
 */
export const gradientes: {
  header: [string, string];
  ia: [string, string];
} = {
  header: ['#0A2540', '#0F4C81'],
  ia: ['#0F4C81', '#0A2540'],
};

/**
 * Cor de destaque por módulo (usada nos ícones circulares da Home).
 * Chaveado pela rota da área.
 */
export const coresModulos: Record<string, string> = {
  Fechamento: '#2563EB',
  Importacoes: '#22C55E',
  Indicadores: '#9333EA',
  PainelVendas: '#14B8A6',
  LoteApae: '#F59E0B',
  Insumos: '#3B82F6',
  Fiscais: '#8B5CF6',
  Escala: '#EC4899',
  Checklist: '#06B6D4',
  Operadores: '#F97316',
  Usuarios: '#0F4C81',
  AlertasFila: '#EF4444',
  Normativas: '#6B7280',
  IndicadorQuebra: '#9333EA',
  GerenciarDados: '#0A2540',
  Notificacoes: '#0F4C81',
};

export const espacamento = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const raio = {
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const tipografia = {
  titulo: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 24,
    fontWeight: '800' as const,
    letterSpacing: -0.4,
  },
  subtitulo: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
  },
  secao: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    fontWeight: '700' as const,
    letterSpacing: -0.1,
  },
  corpo: { fontFamily: 'Inter_400Regular', fontSize: 15, fontWeight: '400' as const },
  rotulo: { fontFamily: 'Inter_600SemiBold', fontSize: 13, fontWeight: '600' as const },
  legenda: { fontFamily: 'Inter_400Regular', fontSize: 12, fontWeight: '400' as const },
} as const;

/**
 * Sombra suave/premium (equivalente a box-shadow: 0 10px 30px rgba(15,23,42,.08)).
 * `cartao` é a sombra padrão; `flutuante` é mais difusa (FAB/Cluby).
 */
export const sombra = {
  cartao: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 3,
  },
  flutuante: {
    shadowColor: '#0F4C81',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 8,
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
  gradientes,
  coresModulos,
  espacamento,
  raio,
  tipografia,
  sombra,
};

export default tema;
