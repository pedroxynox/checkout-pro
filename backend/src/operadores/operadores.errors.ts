/**
 * Erros de domínio tipados do Modulo_Operadores.
 *
 * São erros puros (sem dependência do Nest ou do banco) para que a lógica de
 * domínio permaneça testável de forma isolada. A camada de API mapeará cada um
 * deles para a resposta HTTP apropriada (Tarefa 13).
 */
import { HttpStatus } from '@nestjs/common';
import { ErroDominio } from '../common/errors/erro-dominio';

/** Classe base para os erros de domínio do módulo de operadores. */
export abstract class OperadoresError extends ErroDominio {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = new.target.name;
    // Mantém a cadeia de protótipos correta ao estender Error em TS/ES5+.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Lançado quando o gerente tenta cadastrar (ou editar para) um nome de
 * operador idêntico a um operador já cadastrado — Requisito 6.1.3.
 */
export class NomeDuplicadoError extends OperadoresError {
  readonly statusHttp = HttpStatus.CONFLICT;
  constructor(nome?: string) {
    super(
      nome
        ? `Já existe um operador cadastrado com o nome "${nome}".`
        : 'Já existe um operador cadastrado com este nome.',
    );
  }
}

/**
 * Lançado quando já existe uma ausência registrada para a mesma pessoa
 * (operador ou fiscal) na mesma data — Requisito 6.2.3.
 */
export class AusenciaDuplicadaError extends OperadoresError {
  readonly statusHttp = HttpStatus.CONFLICT;
  constructor(mensagem = 'Já existe uma ausência registrada para esta data.') {
    super(mensagem);
  }
}

/** Lançado quando a ausência informada (para justificar/remover) não existe. */
export class AusenciaNaoEncontradaError extends OperadoresError {
  readonly statusHttp = HttpStatus.NOT_FOUND;
  constructor(mensagem = 'Ausência não encontrada.') {
    super(mensagem);
  }
}

/**
 * Lançado quando os dados da justificativa são inconsistentes (ex.: marcar como
 * JUSTIFICADA sem informar o motivo).
 */
export class JustificativaInvalidaError extends OperadoresError {
  readonly statusHttp = HttpStatus.BAD_REQUEST;
  constructor(mensagem = 'Para justificar, informe o motivo.') {
    super(mensagem);
  }
}

/**
 * Lançado quando o período de uma "ausência a prazo" é inválido (data final
 * antes da inicial ou intervalo longo demais).
 */
export class PeriodoAusenciaInvalidoError extends OperadoresError {
  readonly statusHttp = HttpStatus.BAD_REQUEST;
  constructor(mensagem = 'Período de ausência inválido.') {
    super(mensagem);
  }
}

/**
 * Lançado quando um horário de entrada não está no formato esperado "HH:mm"
 * ou representa um horário inválido (usado na classificação de turno).
 */
export class HorarioInvalidoError extends OperadoresError {
  readonly statusHttp = HttpStatus.BAD_REQUEST;
  constructor(horario?: string) {
    super(
      horario
        ? `Horário de entrada inválido: "${horario}". Use o formato HH:mm.`
        : 'Horário de entrada inválido. Use o formato HH:mm.',
    );
  }
}
