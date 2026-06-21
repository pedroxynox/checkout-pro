/**
 * Lógica pura do Modulo_Fiscais (controle de jornada).
 *
 * Três estados: DISPONIVEL (trabalhando), INTERVALO (em pausa) e
 * FORA_EXPEDIENTE (fora do turno). A partir do log de transições calcula-se o
 * status atual e a jornada do dia (tempo trabalhando, tempo de intervalo e
 * carga horária). Sem efeitos colaterais — testável sem banco.
 */

export const STATUS_FISCAIS = [
  'DISPONIVEL',
  'INTERVALO',
  'FORA_EXPEDIENTE',
] as const;

export type StatusFiscal = (typeof STATUS_FISCAIS)[number];

/** Indica se um valor é um status de fiscal válido. */
export function statusValido(valor: string): valor is StatusFiscal {
  return (STATUS_FISCAIS as readonly string[]).includes(valor);
}

/** Primeiro nome (para exibição no painel e nas notificações). */
export function primeiroNome(nomeCompleto: string): string {
  const partes = nomeCompleto.trim().split(/\s+/).filter(Boolean);
  return partes[0] ?? nomeCompleto.trim();
}

/** Uma transição de status registrada no ponto. */
export interface RegistroPonto {
  status: StatusFiscal;
  em: Date;
}

/**
 * Status atual = o do registro de maior instante (em caso de empate, o último
 * na ordem fornecida). Retorna null se não há registros.
 */
export function statusAtual(
  registros: readonly RegistroPonto[],
): StatusFiscal | null {
  if (registros.length === 0) {
    return null;
  }
  const maxEm = Math.max(...registros.map((r) => r.em.getTime()));
  let atual: StatusFiscal | null = null;
  for (const r of registros) {
    if (r.em.getTime() === maxEm) {
      atual = r.status;
    }
  }
  return atual;
}

/**
 * Mensagem para os gestores conforme a transição de status (ou null quando não
 * há mudança relevante a notificar). Usa o primeiro nome.
 */
export function mensagemTransicao(
  nome: string,
  anterior: StatusFiscal | null,
  novo: StatusFiscal,
): string | null {
  if (anterior === novo) {
    return null;
  }
  const pn = primeiroNome(nome);
  switch (novo) {
    case 'DISPONIVEL':
      return anterior === 'INTERVALO'
        ? `${pn} voltou do intervalo e está disponível.`
        : `${pn} acabou de entrar para trabalhar e está disponível.`;
    case 'INTERVALO':
      return `${pn} saiu para intervalo, retorna em breve.`;
    case 'FORA_EXPEDIENTE':
      return `O turno de ${pn} terminou. Amanhã retorna.`;
  }
}

/** Jornada calculada de um dia (em milissegundos). */
export interface Jornada {
  /** Tempo somado em DISPONIVEL. */
  tempoTrabalhandoMs: number;
  /** Tempo somado em INTERVALO. */
  tempoIntervaloMs: number;
  /** Tempo total trabalhado no dia (sem intervalo). */
  cargaHorariaMs: number;
}

/**
 * Calcula a jornada do dia a partir dos registros de ponto, até o instante
 * `agora`. Cada segmento vai de um registro ao próximo; o último segmento, se
 * o fiscal não estiver FORA_EXPEDIENTE, conta até `agora` (jornada em curso).
 */
export function calcularJornada(
  registros: readonly RegistroPonto[],
  agora: Date,
): Jornada {
  const ordenados = [...registros].sort(
    (a, b) => a.em.getTime() - b.em.getTime(),
  );
  let trabalho = 0;
  let intervalo = 0;
  for (let i = 0; i < ordenados.length; i++) {
    const atual = ordenados[i];
    const proximo = ordenados[i + 1];
    const fim = proximo
      ? proximo.em
      : atual.status === 'FORA_EXPEDIENTE'
        ? atual.em
        : agora;
    const dur = Math.max(0, fim.getTime() - atual.em.getTime());
    if (atual.status === 'DISPONIVEL') {
      trabalho += dur;
    } else if (atual.status === 'INTERVALO') {
      intervalo += dur;
    }
  }
  return {
    tempoTrabalhandoMs: trabalho,
    tempoIntervaloMs: intervalo,
    cargaHorariaMs: trabalho,
  };
}

/** Início do dia (00:00 UTC) — agrupa os registros por dia-calendário. */
export function inicioDoDia(data: Date): Date {
  return new Date(
    Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()),
  );
}

/** Início do dia seguinte (limite superior exclusivo). */
export function inicioDoProximoDia(data: Date): Date {
  const d = inicioDoDia(data);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}
