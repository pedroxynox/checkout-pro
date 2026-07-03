/**
 * Resolve as origens permitidas de CORS a partir de CORS_ORIGINS
 * (separadas por vírgula). Retorna a lista de origens quando definida, ou
 * `true` (reflete a origem — conveniente em desenvolvimento) quando ausente.
 * Lê process.env diretamente para poder ser usada também na decoração dos
 * gateways WebSocket (avaliada na carga do módulo).
 */
export function origensCorsDoAmbiente(): string[] | true {
  const bruto = process.env.CORS_ORIGINS;
  const origens = (bruto ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  return origens.length > 0 ? origens : true;
}
