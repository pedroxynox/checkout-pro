/**
 * Classifica uma notificação pelo seu título para saber a qual módulo ela
 * pertence — e assim o botão de ação leva direto para lá.
 *
 * As notificações não têm um campo de "tipo"/"rota" no backend; os títulos são
 * prefixados por emoji e por categoria (ex.: "📦 Estoque baixo", "🔴 Falta
 * hoje", "🏆 Vendas de ontem"). Aqui inferimos a categoria por palavras-chave
 * do título (sem depender do emoji), devolvendo a rota, o rótulo do módulo, o
 * ícone e o texto do botão. Função pura — fácil de testar.
 */
import { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { RotaApp } from '../../navigation/types';

export type NomeIcone = ComponentProps<typeof Ionicons>['name'];

export interface Categoria {
  /** Rota de destino do botão de ação. */
  rota: RotaApp;
  /** Rótulo curto do módulo (para os chips de filtro). */
  modulo: string;
  icone: NomeIcone;
  /** Texto do botão de ação. */
  acao: string;
}

interface Regra extends Categoria {
  palavras: string[];
}

// Ordem importa: a primeira regra cujo título casar vence.
const REGRAS: Regra[] = [
  {
    palavras: ['bom dia', 'boa tarde', 'boa noite', 'resumo do dia'],
    rota: 'Indicadores',
    modulo: 'Resumo',
    icone: 'sunny-outline',
    acao: 'Ver indicadores',
  },
  {
    palavras: ['checklist', 'abertura', 'fechamento de caixa'],
    rota: 'Checklist',
    modulo: 'Checklist',
    icone: 'checkbox-outline',
    acao: 'Ver checklist',
  },
  {
    palavras: ['insumo', 'estoque', 'fardo', 'bobina', 'sacola', 'requisic'],
    rota: 'Insumos',
    modulo: 'Insumos',
    icone: 'cube-outline',
    acao: 'Ver insumos',
  },
  {
    palavras: ['importa', 'arquivo'],
    rota: 'Importacoes',
    modulo: 'Importações',
    icone: 'cloud-upload-outline',
    acao: 'Ver importações',
  },
  {
    palavras: ['contrato', 'experiencia', 'efetiv', 'admiss'],
    rota: 'Colaboradores',
    modulo: 'Contratos',
    icone: 'id-card-outline',
    acao: 'Ver colaborador',
  },
  {
    palavras: [
      'falta',
      'ausent',
      'ausenc',
      'nao retorn',
      'no retorn',
      'nao-retorno',
      'tac',
      'advertenc',
      'desidia',
      'justific',
    ],
    rota: 'Colaboradores',
    modulo: 'Faltas',
    icone: 'person-outline',
    acao: 'Ver colaboradores',
  },
  {
    palavras: ['fiscal', 'jornada', 'ponto', 'comprovante', 'cobertura', 'hora extra'],
    rota: 'RegistroPonto',
    modulo: 'Relógio Ponto',
    icone: 'time-outline',
    acao: 'Ver ponto',
  },
  {
    palavras: ['escala', 'folga'],
    rota: 'Operadores',
    modulo: 'Escalas',
    icone: 'calendar-outline',
    acao: 'Ver escalas',
  },
  {
    palavras: ['venda', 'faturament', 'meta do mes', 'ritmo', 'cupom'],
    rota: 'PainelVendas',
    modulo: 'Vendas',
    icone: 'cash-outline',
    acao: 'Ver painel',
  },
  {
    palavras: [
      'indicador',
      'ranking',
      'desempenho',
      'troco',
      'recarga',
      'cancelament',
      'devolucao',
      'quebra',
    ],
    rota: 'Indicadores',
    modulo: 'Indicadores',
    icone: 'stats-chart-outline',
    acao: 'Ver indicadores',
  },
  {
    palavras: ['centro de controle', 'configurac', 'cadastro'],
    rota: 'CentroControle',
    modulo: 'Centro de Controle',
    icone: 'options-outline',
    acao: 'Abrir módulo',
  },
];

/** Fallback quando nada casa: leva para a tela inicial. */
const PADRAO: Categoria = {
  rota: 'Tabs' as RotaApp,
  modulo: 'Geral',
  icone: 'notifications-outline',
  acao: 'Abrir',
};

/** Remove acentos e coloca em minúsculas para casar palavras-chave. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Classifica a notificação a partir do título (e mensagem como reforço). */
export function classificarNotificacao(
  titulo: string,
  mensagem = '',
): Categoria {
  const alvo = normalizar(`${titulo} ${mensagem}`);
  for (const regra of REGRAS) {
    if (regra.palavras.some((p) => alvo.includes(p))) {
      return {
        rota: regra.rota,
        modulo: regra.modulo,
        icone: regra.icone,
        acao: regra.acao,
      };
    }
  }
  return PADRAO;
}

/** Remove emojis/símbolos do início do título (para exibir sem emoji). */
export function limparTitulo(titulo: string): string {
  return titulo.replace(/^[^\p{L}\p{N}]+/u, '').trim() || titulo.trim();
}
