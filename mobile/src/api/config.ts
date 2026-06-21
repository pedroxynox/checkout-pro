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

/** Namespace do WebSocket de notificações em tempo real (ver NotificacoesGateway). */
export const WS_NAMESPACE_NOTIFICACOES = '/notificacoes';

/**
 * Tempo máximo (ms) de espera por uma resposta HTTP antes de abortar.
 *
 * 60s para tolerar o "cold start" de servidores gratuitos (ex.: Render free),
 * que hibernam após inatividade e podem levar ~50s para responder à primeira
 * requisição. Assim o login funciona já na primeira tentativa.
 */
export const TIMEOUT_REQUISICAO_MS = 60000;
