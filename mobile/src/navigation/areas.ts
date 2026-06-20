/**
 * Registro das áreas funcionais do app.
 *
 * Cada área aponta para uma rota, um ícone e a **funcionalidade** exigida. A
 * tela inicial (Home) e a navegação usam `podeAcessar(perfil, funcionalidade)`
 * para exibir **todas** as áreas ao gerente e **apenas as operacionais** ao
 * fiscal (Req 7.2.2–7.2.4), reaproveitando o mesmo conceito de allowlist do
 * backend (`FUNCIONALIDADES_FISCAL`).
 */
import { Ionicons } from '@expo/vector-icons';
import { RotaApp } from './types';

export interface Area {
  rota: Extract<
    RotaApp,
    | 'Importacoes'
    | 'Indicadores'
    | 'PainelVendas'
    | 'LoteApae'
    | 'Insumos'
    | 'Fiscais'
    | 'Escala'
    | 'Checklist'
    | 'Operadores'
    | 'Usuarios'
    | 'AlertasFila'
    | 'Normativas'
    | 'IndicadorQuebra'
    | 'Notificacoes'
    | 'GerenciarDados'
  >;
  titulo: string;
  descricao: string;
  icone: keyof typeof Ionicons.glyphMap;
  funcionalidade: string;
}

export const AREAS: Area[] = [
  {
    rota: 'Importacoes',
    titulo: 'Importações',
    descricao: 'Status diário e histórico dos arquivos',
    icone: 'cloud-upload-outline',
    funcionalidade: 'IMPORTACOES',
  },
  {
    rota: 'Indicadores',
    titulo: 'Indicadores',
    descricao: 'Metas, cores e rankings',
    icone: 'stats-chart-outline',
    funcionalidade: 'INDICADORES_VISUALIZAR',
  },
  {
    rota: 'PainelVendas',
    titulo: 'Painel de Vendas',
    descricao: 'Informar e acompanhar acumulados',
    icone: 'cash-outline',
    funcionalidade: 'PAINEL_VENDAS_VISUALIZAR',
  },
  {
    rota: 'LoteApae',
    titulo: 'Sacolas APAE',
    descricao: 'Venda por lote e valor arrecadado',
    icone: 'bag-handle-outline',
    funcionalidade: 'LOTE_APAE',
  },
  {
    rota: 'Insumos',
    titulo: 'Insumos',
    descricao: 'Saldos, fardos e consumo',
    icone: 'cube-outline',
    funcionalidade: 'INSUMOS',
  },
  {
    rota: 'Fiscais',
    titulo: 'Fiscais',
    descricao: 'Painel em tempo real e check-in/out',
    icone: 'people-outline',
    funcionalidade: 'FISCAIS_STATUS',
  },
  {
    rota: 'Escala',
    titulo: 'Escala',
    descricao: 'Escala consolidada por dia',
    icone: 'calendar-outline',
    funcionalidade: 'ESCALA_VISUALIZAR',
  },
  {
    rota: 'Checklist',
    titulo: 'Checklist',
    descricao: 'Abertura e fechamento com imagem',
    icone: 'checkbox-outline',
    funcionalidade: 'CHECKLIST',
  },
  {
    rota: 'Operadores',
    titulo: 'Operadores',
    descricao: 'Ausências e (gerência) cadastro de operadores',
    icone: 'id-card-outline',
    funcionalidade: 'OPERADORES_AUSENCIAS',
  },
  {
    rota: 'Usuarios',
    titulo: 'Pessoas e Acessos',
    descricao: 'Cadastrar pessoas e definir acessos',
    icone: 'person-add-outline',
    funcionalidade: 'USUARIOS_CRUD',
  },
  {
    rota: 'Notificacoes',
    titulo: 'Notificações',
    descricao: 'Central de avisos do app',
    icone: 'notifications-outline',
    funcionalidade: 'NOTIFICACOES',
  },
  {
    rota: 'AlertasFila',
    titulo: 'Alertas de Fila',
    descricao: 'Avisos de filas/caixas (em breve)',
    icone: 'alert-circle-outline',
    funcionalidade: 'ALERTAS_FILA',
  },
  {
    rota: 'Normativas',
    titulo: 'Normativas',
    descricao: 'Normas e procedimentos (em breve)',
    icone: 'document-text-outline',
    funcionalidade: 'NORMATIVAS',
  },
  {
    rota: 'IndicadorQuebra',
    titulo: 'Indicador de Quebra',
    descricao: 'Quebras e perdas (em breve)',
    icone: 'trending-down-outline',
    funcionalidade: 'INDICADOR_QUEBRA',
  },
  {
    rota: 'GerenciarDados',
    titulo: 'Gerenciar dados',
    descricao: 'Zerar/limpar dados (administrativo)',
    icone: 'construct-outline',
    funcionalidade: 'ADMIN_DADOS',
  },
];
