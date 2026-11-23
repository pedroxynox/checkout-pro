/**
 * Erros de domínio do Cadastro Unificado de Colaboradores.
 *
 * Puros (sem Nest/Prisma) para manter a lógica testável. O
 * `DominioExceptionFilter` mapeia cada um para o status HTTP adequado.
 */
import { HttpStatus } from '@nestjs/common';
import { ErroDominio } from '../common/errors/erro-dominio';

export abstract class ColaboradoresError extends ErroDominio {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Matrícula (registro) já usada por outro colaborador. */
export class MatriculaColaboradorDuplicadaError extends ColaboradoresError {
  readonly statusHttp = HttpStatus.CONFLICT;
  constructor(matricula?: string) {
    super(
      matricula
        ? `Já existe um colaborador com a matrícula "${matricula}".`
        : 'Já existe um colaborador com esta matrícula.',
    );
  }
}

/** Login/código de operador já vinculado a outro colaborador. */
export class LoginColaboradorDuplicadoError extends ColaboradoresError {
  readonly statusHttp = HttpStatus.CONFLICT;
  constructor(login?: string) {
    super(
      login
        ? `O login "${login}" já está vinculado a outro colaborador.`
        : 'Este login já está vinculado a outro colaborador.',
    );
  }
}

/** Conta de acesso (login do app) já vinculada a outro colaborador. */
export class LoginAppDuplicadoError extends ColaboradoresError {
  readonly statusHttp = HttpStatus.CONFLICT;
  constructor() {
    super('Esta conta de acesso já está vinculada a outro colaborador.');
  }
}

/** Falta a senha de acesso ao criar fiscal/supervisor/gerente. */
export class SenhaAcessoObrigatoriaError extends ColaboradoresError {
  readonly statusHttp = HttpStatus.BAD_REQUEST;
  constructor() {
    super(
      'Defina uma senha de acesso (mínimo 6 caracteres) para fiscal, supervisor ou gerente.',
    );
  }
}

/** A matrícula já está em uso como login de outra conta de acesso. */
export class ContaAcessoExistenteError extends ColaboradoresError {
  readonly statusHttp = HttpStatus.CONFLICT;
  constructor() {
    super('Já existe uma conta de acesso com esta matrícula.');
  }
}

/** Conta de acesso (login do app) informada não existe. */
export class LoginAppInexistenteError extends ColaboradoresError {
  readonly statusHttp = HttpStatus.NOT_FOUND;
  constructor() {
    super('A conta de acesso informada não existe.');
  }
}

/** Colaborador inexistente. */
export class ColaboradorNaoEncontradoError extends ColaboradoresError {
  readonly statusHttp = HttpStatus.NOT_FOUND;
  constructor() {
    super('Colaborador não encontrado.');
  }
}

/**
 * Fiscal e operador precisam de um turno fixo (Abertura/Intermediário/
 * Fechamento/Apoio), pois é ele que agrupa a escala do dia. Supervisor,
 * gerente e administrador não têm turno fixo.
 */
export class TurnoObrigatorioError extends ColaboradoresError {
  readonly statusHttp = HttpStatus.BAD_REQUEST;
  constructor() {
    super(
      'Selecione o turno (Abertura, Intermediário, Fechamento ou Apoio). O turno é obrigatório para fiscal e operador.',
    );
  }
}

/**
 * Tentativa de criar/promover uma conta de gerente (ou gerente desenvolvedor)
 * sem ter o perfil necessário para isso. Só o gerente desenvolvedor pode
 * conceder acesso de nível gerencial, evitando escalada de privilégios por
 * quem administra colaboradores (ex.: supervisor).
 */
export class PermissaoInsuficienteFuncaoError extends ColaboradoresError {
  readonly statusHttp = HttpStatus.FORBIDDEN;
  constructor() {
    super(
      'Você não tem permissão para atribuir a função de gerente. Fale com o gerente desenvolvedor.',
    );
  }
}

/**
 * Só o administrador escolhe ou troca o tipo de contrato (decisão do dono, spec
 * `jornada-5x2`): na ficha, atribuir um contrato diferente do atual (ou, no
 * cadastro, do padrão) exige `ADMIN_DADOS`.
 */
export class PermissaoTrocarContratoError extends ColaboradoresError {
  readonly statusHttp = HttpStatus.FORBIDDEN;
  constructor() {
    super('Só o administrador escolhe ou troca o tipo de contrato.');
  }
}

/**
 * A pessoa já tem vigência da jornada (spec `jornada-5x2`, R1.3a): os campos
 * legados da ficha (folga fixa, blocos de horário, grupo de domingo, contrato)
 * são a história do 6x1 e não mudam mais. Reenviar o MESMO valor é aceito (o
 * APK antigo manda a ficha inteira); mudar devolve 409.
 */
export class CamposLegadosCongeladosError extends ColaboradoresError {
  readonly statusHttp = HttpStatus.CONFLICT;
  constructor(readonly campos: readonly string[] = []) {
    super(
      'Esta pessoa já está na jornada por vigência: a folga, os horários, o grupo e o contrato mudam pela jornada ("Vale a partir de"), não pela ficha antiga.' +
        (campos.length > 0 ? ` Campos recusados: ${campos.join(', ')}.` : ''),
    );
  }
}
