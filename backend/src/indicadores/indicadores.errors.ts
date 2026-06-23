/**
 * NOTA DE MANUTENÇÃO (limpeza de código morto): o fluxo ANTIGO de indicadores
 * manuais (controller/service/module/dto/domain) foi removido por não ser mais
 * usado pelo app. Este arquivo de erros é **mantido de propósito** porque a
 * classe `ValorVendaInvalidoError` ainda é referenciada pelo filtro global de
 * exceções (`common/filters/dominio-exception.filter.ts`).
 *
 * Erros de domínio tipados do Modulo_Indicadores (Painel de Vendas e
 * indicadores). São erros puros (sem dependência do Nest ou do banco) para
 * que a lógica de domínio permaneça testável de forma isolada.
 */

/** Classe base para os erros de domínio do módulo de indicadores. */
export abstract class IndicadoresError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Lançado quando o valor de vendas informado é menor que zero — Requisito
 * 2.1.4. A mensagem solicita um valor maior ou igual a zero.
 */
export class ValorVendaInvalidoError extends IndicadoresError {
  constructor(valor?: number) {
    super(
      valor !== undefined
        ? `Valor de vendas inválido (${valor}). Informe um valor maior ou igual a zero.`
        : 'Valor de vendas inválido. Informe um valor maior ou igual a zero.',
    );
  }
}
