/**
 * Registro das áreas funcionais do app.
 *
 * Cada área aponta para uma rota, um ícone e a **funcionalidade** exigida. A
 * tela inicial (Home) e a navegação usam `podeAcessar(perfil, funcionalidade)`
 * para exibir **todas** as áreas ao gerente e **apenas as operacionais** ao
 * fiscal (Req 7.2.2–7.2.4), reaproveitando o mesmo conceito de allowlist do
 * backend (`FUNCIONALIDADES_FISCAL`).
 *
 * Além da permissão por perfil, áreas marcadas com `emBreve: true` (em
 * construção) ficam **ocultas do menu** até serem concluídas — ver o filtro na
 * HomeScreen e a marca nas áreas Alertas de Fila, Normativas e Indicador de
 * Quebra.
 */
import { Ionicons } from '@expo/vector-icons';
import { RotaApp } from './types';

export interface Area {
  rota: Extract<
    RotaApp,
    | 'CentroDeMando'
    | 'Importacoes'
    | 'Fechamento'
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
  /**
   * Área ainda EM CONSTRUÇÃO. Quando `true`, a área fica **oculta do menu**
   * (Home) até a funcionalidade ser concluída — mesmo para o gerente
   * desenvolvedor. Basta remover esta marca para voltar a exibi-la.
   */
  emBreve?: boolean;
}

export const AREAS: Area[] = [
  {
    rota: 'CentroDeMando',
    titulo: 'Centro de Mando',
    descricao: 'Saúde do negócio e as prioridades de hoje',
    icone: 'speedometer-outline',
    funcionalidade: 'INDICADORES_VISUALIZAR',
  },
  {
    rota: 'Fechamento',
    titulo: 'Fechamento',
    descricao: 'Status dos arquivos do dia (enviado/pendente)',
    icone: 'checkmark-done-outline',
    funcionalidade: 'FECHAMENTO',
  },
  {
    rota: 'Importacoes',
    titulo: 'Importações',
    descricao: 'Carregar os arquivos do dia',
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
    descricao: 'Escala visual: folgas, faltas e cobertura',
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
    emBreve: true,
  },
  {
    rota: 'Normativas',
    titulo: 'Normativas',
    descricao: 'Normas e procedimentos (em breve)',
    icone: 'document-text-outline',
    funcionalidade: 'NORMATIVAS',
    emBreve: true,
  },
  {
    rota: 'IndicadorQuebra',
    titulo: 'Indicador de Quebra',
    descricao: 'Quebras e perdas (em breve)',
    icone: 'trending-down-outline',
    funcionalidade: 'INDICADOR_QUEBRA',
    emBreve: true,
  },
  {
    rota: 'GerenciarDados',
    titulo: 'Gerenciar dados',
    descricao: 'Zerar/limpar dados (administrativo)',
    icone: 'construct-outline',
    funcionalidade: 'ADMIN_DADOS',
  },
];
