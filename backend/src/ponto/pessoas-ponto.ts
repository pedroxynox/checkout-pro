import { FuncaoColaborador } from '@prisma/client';

/**
 * Funções de colaborador (NÃO-fiscais) que batem ponto e, portanto, entram no
 * leitor de comprovante (busca + sugestões) e no painel de jornada da equipe.
 *
 * Os FISCAIS entram pela tabela `Fiscal` (para preservar o painel em tempo real
 * e a sincronização de status já existentes). Os demais entram pela ficha do
 * Cadastro Unificado de Colaboradores. GERENTES ficam de fora (não batem ponto)
 * e os desligados (`ativo = false`) também.
 */
export const FUNCOES_PONTO_NAO_FISCAL: FuncaoColaborador[] = [
  'OPERADOR',
  'SUPERVISOR',
];
