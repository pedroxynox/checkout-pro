/**
 * Erros de domínio tipados das Incidências de Escala.
 *
 * São erros puros (sem dependência do Nest além do enum de status HTTP), para
 * que a lógica de serviço permaneça isolável. Cada erro declara o próprio
 * `statusHttp`; o filtro global (`DominioExceptionFilter`) o utiliza.
 */
import { HttpStatus } from '@nestjs/common';
import { ErroDominio } from '../common/errors/erro-dominio';

/** Classe base dos erros do módulo de incidências de escala. */
export abstract class IncidenciasError extends ErroDominio {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = new.target.name;
    // Mantém a cadeia de protótipos correta ao estender Error em TS/ES5+.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Lançado quando a incidência informada não existe (editar/remover). */
export class IncidenciaNaoEncontradaError extends IncidenciasError {
  readonly statusHttp = HttpStatus.NOT_FOUND;
  constructor(mensagem = 'Incidência de escala não encontrada.') {
    super(mensagem);
  }
}

/**
 * Lançado quando já existe uma incidência do mesmo tipo para o mesmo
 * colaborador na mesma data (unicidade colaborador+tipo+data).
 */
export class IncidenciaDuplicadaError extends IncidenciasError {
  readonly statusHttp = HttpStatus.CONFLICT;
  constructor(
    mensagem = 'Já existe uma incidência deste tipo para este colaborador nesta data.',
  ) {
    super(mensagem);
  }
}

/** Lançado quando o colaborador informado não existe / é inválido. */
export class ColaboradorIncidenciaInvalidoError extends IncidenciasError {
  readonly statusHttp = HttpStatus.BAD_REQUEST;
  constructor(mensagem = 'Colaborador inválido para a incidência.') {
    super(mensagem);
  }
}

/** Lançado quando os dados da incidência são inconsistentes/insuficientes. */
export class DadosIncidenciaInvalidosError extends IncidenciasError {
  readonly statusHttp = HttpStatus.BAD_REQUEST;
  constructor(mensagem = 'Dados da incidência inválidos.') {
    super(mensagem);
  }
}
