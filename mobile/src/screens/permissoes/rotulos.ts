/**
 * Rótulos amigáveis e agrupamento por área das funcionalidades ajustáveis na
 * Central de Permissões. Puramente de apresentação: a lista de funcionalidades
 * e a decisão de acesso vêm sempre do backend.
 */
export interface RotuloFuncionalidade {
  titulo: string;
  descricao?: string;
  area: string;
}

/** Ordem de exibição das áreas no painel. */
export const ORDEM_AREAS: string[] = [
  'Carga e fechamento',
  'Indicadores e vendas',
  'Sacolas APAE',
  'Insumos',
  'Fiscais e jornada',
  'Operação e pessoas',
  'Check-Outs',
  'Avisos',
];

export const ROTULOS_FUNCIONALIDADE: Record<string, RotuloFuncionalidade> = {
  FECHAMENTO: {
    titulo: 'Fechamento',
    descricao: 'Ver o status dos arquivos do dia',
    area: 'Carga e fechamento',
  },
  INDICADORES_VISUALIZAR: {
    titulo: 'Indicadores',
    descricao: 'Ver metas, cores e rankings',
    area: 'Indicadores e vendas',
  },
  PAINEL_VENDAS_VISUALIZAR: {
    titulo: 'Ver painel de vendas',
    area: 'Indicadores e vendas',
  },
  PAINEL_VENDAS_EDITAR: {
    titulo: 'Editar dados de vendas',
    area: 'Indicadores e vendas',
  },
  INDICADOR_QUEBRA: {
    titulo: 'Indicador de quebra',
    descricao: 'Em construção',
    area: 'Indicadores e vendas',
  },
  LOTE_APAE: {
    titulo: 'Sacolas APAE',
    descricao: 'Ver e usar sacolas',
    area: 'Sacolas APAE',
  },
  LOTE_APAE_GERENCIAR: {
    titulo: 'Gerenciar sacolas APAE',
    descricao: 'Registrar/reiniciar lote',
    area: 'Sacolas APAE',
  },
  INSUMOS: {
    titulo: 'Insumos',
    descricao: 'Ver saldos e requisições',
    area: 'Insumos',
  },
  INSUMOS_GERENCIAR: {
    titulo: 'Gerenciar insumos',
    descricao: 'Administrar almoxarifado e requisições',
    area: 'Insumos',
  },
  FISCAIS_STATUS: {
    titulo: 'Status dos fiscais',
    area: 'Fiscais e jornada',
  },
  FISCAIS_JORNADA: {
    titulo: 'Jornada da equipe',
    descricao: 'Horas trabalhadas e intervalos',
    area: 'Fiscais e jornada',
  },
  CENTRAL_JORNADA: {
    titulo: 'Central de Jornada',
    descricao: 'Portal do ciclo de folha',
    area: 'Fiscais e jornada',
  },
  ESCALA_VISUALIZAR: {
    titulo: 'Ver escala',
    area: 'Fiscais e jornada',
  },
  ESCALA_EDITAR: {
    titulo: 'Editar escala',
    area: 'Fiscais e jornada',
  },
  PONTO_REGISTRAR: {
    titulo: 'Registrar ponto',
    descricao: 'Registrar batidas novas',
    area: 'Fiscais e jornada',
  },
  PONTO_EDITAR: {
    titulo: 'Corrigir marcações',
    descricao: 'Corrigir/remover batidas já registradas',
    area: 'Fiscais e jornada',
  },
  PONTO_VISUALIZAR: {
    titulo: 'Ver painel de jornada',
    area: 'Fiscais e jornada',
  },
  CHECKLIST: {
    titulo: 'Checklist',
    area: 'Operação e pessoas',
  },
  OPERADORES_AUSENCIAS: {
    titulo: 'Ausências de operadores',
    descricao: 'Registrar faltas e ausências',
    area: 'Operação e pessoas',
  },
  OPERADORES_CRUD: {
    titulo: 'Centro de Controle',
    descricao: 'Cadastro de colaboradores, metas, central de vendas e relatórios',
    area: 'Operação e pessoas',
  },
  ADVERTENCIAS_DECIDIR: {
    titulo: 'Decidir advertências',
    area: 'Operação e pessoas',
  },
  CONTRATOS_VISUALIZAR: {
    titulo: 'Ver contratos de experiência',
    area: 'Operação e pessoas',
  },
  CONTRATOS_GERIR: {
    titulo: 'Gerir contratos de experiência',
    area: 'Operação e pessoas',
  },
  FEEDFORWARD_VISUALIZAR: {
    titulo: 'Ver feedforward',
    area: 'Operação e pessoas',
  },
  FEEDFORWARD_GERIR: {
    titulo: 'Gerir feedforward',
    area: 'Operação e pessoas',
  },
  CHECKOUTS: {
    titulo: 'Check-Outs',
    descricao: 'Ver as caixas e reportar equipamentos com defeito',
    area: 'Check-Outs',
  },
  CHECKOUTS_GERENCIAR: {
    titulo: 'Resolver avarias',
    descricao: 'Marcar avarias de check-out como resolvidas',
    area: 'Check-Outs',
  },
  NOTIFICACOES: {
    titulo: 'Notificações',
    descricao: 'Receber avisos e ver o centro de notificações',
    area: 'Avisos',
  },
  ALERTAS_FILA: {
    titulo: 'Alertas de fila',
    descricao: 'Em construção',
    area: 'Avisos',
  },
  NORMATIVAS: {
    titulo: 'Normativas',
    descricao: 'Em construção',
    area: 'Avisos',
  },
};

/** Rótulo para uma funcionalidade (fallback: a própria chave). */
export function rotuloDe(funcionalidade: string): RotuloFuncionalidade {
  return (
    ROTULOS_FUNCIONALIDADE[funcionalidade] ?? {
      titulo: funcionalidade,
      area: 'Outras',
    }
  );
}
