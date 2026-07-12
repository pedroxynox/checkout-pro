/**
 * Lógica **pura** da saudação diária (bom dia/tarde) com o resumo do dia
 * anterior e uma mensagem motivadora. Sem Nest nem Prisma — testável isolada.
 *
 * A saudação vai para cada fiscal na sua hora de entrada e para gerentes/
 * supervisores às 06:50 (ver `SaudacaoDiariaService`). Aqui só montamos o
 * texto a partir do nome, da hora e do resultado de vendas de ontem.
 */

/** Saudação conforme a hora do dia (0–23, horário de Brasília). */
export function saudacaoPeriodo(hora: number): string {
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** Formata um valor em reais (pt-BR). */
function formatarBRL(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor);
}

/** Insumos para montar a saudação diária. */
export interface DadosSaudacao {
  /** Primeiro nome de quem recebe a saudação. */
  primeiroNome: string;
  /** Hora do dia (0–23) em Brasília — define bom dia/tarde/noite. */
  hora: number;
  /** Venda de ontem (R$); null/0 quando não há dado. */
  vendaOntem: number | null;
  /** Variação % vs. o mesmo dia da semana passada; null quando incomparável. */
  variacaoOntem: number | null;
}

/**
 * Monta o título (saudação personalizada) e a mensagem (resumo de ontem +
 * incentivo). Determinística: mesmo insumo → mesmo texto.
 */
export function montarSaudacaoDiaria(d: DadosSaudacao): {
  titulo: string;
  mensagem: string;
} {
  const titulo = `${saudacaoPeriodo(d.hora)}, ${d.primeiroNome}! ☀️`;

  let mensagem: string;
  if (d.vendaOntem && d.vendaOntem > 0) {
    const base = `Ontem a loja vendeu ${formatarBRL(d.vendaOntem)}`;
    if (d.variacaoOntem != null) {
      const sinal = d.variacaoOntem >= 0 ? '+' : '';
      const comp = `${sinal}${d.variacaoOntem}% vs. a semana passada`;
      mensagem =
        d.variacaoOntem >= 0
          ? `${base} (${comp}). Bora manter o ritmo hoje! 💪`
          : `${base} (${comp}). Hoje é dia de buscar mais — vamos com tudo! 🚀`;
    } else {
      mensagem = `${base}. Bom trabalho — segue o jogo hoje! 💪`;
    }
  } else {
    mensagem = 'Bora fazer um ótimo dia! Conte com a equipe. 🚀';
  }

  return { titulo, mensagem };
}
