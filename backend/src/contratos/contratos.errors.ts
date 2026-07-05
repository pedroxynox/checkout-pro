/**
 * Erros de domínio tipados do módulo de Contratos de experiência.
 *
 * São erros puros (sem dependência do Nest além do enum de status HTTP). Cada
 * erro declara o próprio `statusHttp`; o filtro global (`DominioExceptionFilter`)
 * o utiliza — sem mapa central.
 */
import { HttpStatus } from '@nestjs/common';
import { ErroDominio } from '../common/errors/erro-dominio';

/** Classe base dos erros do módulo de contratos. */
export abstract class ContratosError extends ErroDominio {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Lançado quando o colaborador informado não existe. */
export class ColaboradorContratoNaoEncontradoError extends ContratosError {
  readonly statusHttp = HttpStatus.NOT_FOUND;
  constructor(mensagem = 'Colaborador não encontrado.') {
    super(mensagem);
  }
}

/** Lançado quando os dados do contrato são inválidos (ex.: data malformada). */
export class DadosContratoInvalidosError extends ContratosError {
  readonly statusHttp = HttpStatus.BAD_REQUEST;
  constructor(mensagem = 'Dados do contrato inválidos.') {
    super(mensagem);
  }
}

/**
 * Lançado ao tentar registrar uma decisão sem que o colaborador tenha data de
 * admissão definida (não há contrato para decidir).
 */
export class AdmissaoNaoDefinidaError extends ContratosError {
  readonly statusHttp = HttpStatus.BAD_REQUEST;
  constructor(
    mensagem = 'Defina a data de admissão do colaborador antes de decidir o contrato.',
  ) {
    super(mensagem);
  }
}

/**
 * Lançado quando a decisão do marco não é permitida no estado atual (ex.:
 * decidir o marco de 90 antes de aprovar o de 45, ou decidir após reprovação).
 */
export class DecisaoMarcoInvalidaError extends ContratosError {
  readonly statusHttp = HttpStatus.CONFLICT;
  constructor(
    mensagem = 'Não é possível decidir este marco no estado atual do contrato.',
  ) {
    super(mensagem);
  }
}
