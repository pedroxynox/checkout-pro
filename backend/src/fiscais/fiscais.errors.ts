/**
 * Erros de domínio tipados do Modulo_Fiscais (status, check-in/check-out e
 * escala). São erros puros (sem dependência do Nest ou do banco) para manter a
 * lógica de domínio testável de forma isolada.
 */

/** Classe base para os erros de domínio do módulo de fiscais e escala. */
export abstract class FiscaisError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Lançado quando um fiscal que já está com check-in ativo tenta realizar um
 * novo check-in — Requisito 4.2.3. A sessão ativa original permanece
 * inalterada.
 */
export class CheckInAtivoError extends FiscaisError {
  constructor(fiscalId?: string) {
    super(
      fiscalId !== undefined
        ? `Já existe um check-in ativo para o fiscal "${fiscalId}".`
        : 'Já existe um check-in ativo.',
    );
  }
}

/**
 * Lançado quando o status informado não pertence ao conjunto válido
 * {DISPONIVEL, EM_INTERVALO, EM_ATENDIMENTO} — Requisito 4.1.1.
 */
export class StatusInvalidoError extends FiscaisError {
  constructor(status?: string) {
    super(
      status !== undefined
        ? `Status de fiscal inválido: "${status}".`
        : 'Status de fiscal inválido.',
    );
  }
}
