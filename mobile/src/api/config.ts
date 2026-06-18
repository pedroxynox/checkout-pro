/**
 * Configuração de ambiente do app.
 *
 * A URL base da API pode ser sobrescrita em tempo de build/execução pela
 * variável de ambiente pública do Expo `EXPO_PUBLIC_API_URL` (ex.:
 * `EXPO_PUBLIC_API_URL=https://api.stok.center`). Sem ela, usamos o padrão de
 * desenvolvimento apontando para o backend NestJS local.
 */

const PADRAO_DEV = 'http://localhost:3000';

export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '') ?? PADRAO_DEV;

/** Namespace do WebSocket do painel de fiscais (ver FiscaisGateway). */
export const WS_NAMESPACE_FISCAIS = '/fiscais';

/** Tempo máximo (ms) de espera por uma resposta HTTP antes de abortar. */
export const TIMEOUT_REQUISICAO_MS = 15000;
