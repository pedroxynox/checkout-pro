/**
 * Utilitários puros do **período mensal** ("AAAA-MM") — fonte única de verdade
 * no app.
 *
 * O mês de referência do sistema é o mês-calendário no fuso de Brasília
 * (UTC−3), o mesmo usado pelas metas mensais e pelo histórico de indicadores.
 * Antes deste módulo, `mesAtual`/`deslocarMes`/`rotuloMes` estavam duplicados na
 * tela de Metas.
 */

/** Offset fixo de Brasília (UTC−3, sem horário de verão). */
const OFFSET_BRASILIA_MS = 3 * 60 * 60 * 1000;

/**
 * Janela do Histórico de Indicadores, em meses. Espelha o padrão do backend
 * (`RETENCAO_INDICADORES_MESES`) e serve **apenas** para limitar a navegação na
 * interface — quem decide o que existe de verdade é o servidor, que apaga os
 * meses fora da janela e devolve `mesesRetencao` nas respostas do histórico.
 */
export const MESES_HISTORICO_INDICADORES = 24;

/** Mês corrente ("AAAA-MM") no fuso de Brasília. */
export function mesAtual(): string {
  const agora = new Date(Date.now() - OFFSET_BRASILIA_MS);
  return `${agora.getUTCFullYear()}-${String(agora.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Desloca o período mensal em `delta` meses (negativo = meses anteriores). */
export function deslocarMes(anoMes: string, delta: number): string {
  const [a, m] = anoMes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Rótulo do período por extenso (ex.: "Junho de 2026"). */
export function rotuloMes(anoMes: string): string {
  const [a, m] = anoMes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, 1));
  const s = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Data ISO (AAAA-MM-DD) do **último dia** do mês. É a data de referência de um
 * mês fechado: passá-la aos endpoints de indicadores devolve o mês inteiro.
 */
export function ultimoDiaDoMesISO(anoMes: string): string {
  const [a, m] = anoMes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m, 0));
  return d.toISOString().slice(0, 10);
}

/**
 * Quantos meses `anoMes` está atrás de `referencia` (0 = mesmo mês). Usado para
 * limitar a navegação à janela de retenção do histórico.
 */
export function mesesAtras(anoMes: string, referencia: string): number {
  const [a1, m1] = anoMes.split('-').map(Number);
  const [a2, m2] = referencia.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}
