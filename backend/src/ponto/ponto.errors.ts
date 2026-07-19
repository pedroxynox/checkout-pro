import { HttpStatus } from '@nestjs/common';
import { ErroDominio } from '../common/errors/erro-dominio';

/** A pessoa informada não existe no cadastro correspondente. */
export class PessoaPontoNaoEncontradaError extends ErroDominio {
  readonly statusHttp = HttpStatus.NOT_FOUND;

  constructor() {
    super('Pessoa não encontrada para registrar o ponto.');
  }
}

/** A pessoa existe, mas está desligada ou não possui ficha ativa elegível. */
export class PessoaPontoInativaError extends ErroDominio {
  readonly statusHttp = HttpStatus.CONFLICT;

  constructor() {
    super('A pessoa está inativa ou não está habilitada para registrar ponto.');
  }
}

/** A data e a hora do comprovante precisam pertencer ao mesmo dia civil. */
export class HoraForaDoDiaError extends ErroDominio {
  readonly statusHttp = HttpStatus.BAD_REQUEST;

  constructor() {
    super('A hora da batida deve pertencer ao dia selecionado.');
  }
}

/** Não é permitido registrar ou mover uma batida para o futuro. */
export class HoraFuturaError extends ErroDominio {
  readonly statusHttp = HttpStatus.BAD_REQUEST;

  constructor() {
    super('Não é possível registrar uma batida em uma data ou hora futura.');
  }
}

/** Proteção para chamadas internas que não passaram pela validação dos DTOs. */
export class DataHoraPontoInvalidaError extends ErroDominio {
  readonly statusHttp = HttpStatus.BAD_REQUEST;

  constructor() {
    super('Data ou hora da batida inválida.');
  }
}

/** Cada pessoa pode possuir no máximo quatro batidas no mesmo dia. */
export class LimiteBatidasDiaError extends ErroDominio {
  readonly statusHttp = HttpStatus.CONFLICT;

  constructor() {
    super('Limite de 4 batidas atingido para esta pessoa neste dia.');
  }
}

/**
 * Já existe uma batida no mesmo horário (ou muito próxima). Bloqueia toque
 * duplo, reenvios e sincronizações repetidas.
 */
export class BatidaDuplicadaError extends ErroDominio {
  readonly statusHttp = HttpStatus.CONFLICT;

  constructor() {
    super('Já existe uma batida nesse horário. Verifique se não é repetida.');
  }
}

/** A pessoa está de folga (descanso) neste dia — não é possível bater ponto. */
export class PontoEmFolgaError extends ErroDominio {
  readonly statusHttp = HttpStatus.CONFLICT;

  constructor() {
    super('A pessoa está de folga neste dia. Não é possível registrar ponto.');
  }
}

/**
 * O retorno do intervalo foi tentado depois de o intervalo já ter ultrapassado
 * o máximo (3h no contrato 6x1). Nesse caso o sistema considera que a pessoa
 * não retornou (a jornada da tarde foi encerrada), então a batida de retorno é
 * recusada — o dia fica como "não retorno do intervalo".
 */
export class RetornoAposLimiteIntervaloError extends ErroDominio {
  readonly statusHttp = HttpStatus.CONFLICT;

  constructor() {
    super(
      'O intervalo já ultrapassou 3h — o retorno não pode ser registrado. ' +
        'O dia será tratado como não retorno do intervalo.',
    );
  }
}
