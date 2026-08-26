/**
 * Erros de domínio tipados do módulo de Atestados. Puros (sem Nest/Prisma); a
 * camada HTTP os mapeia via `DominioExceptionFilter` usando `statusHttp`.
 */
import { HttpStatus } from '@nestjs/common';
import { ErroDominio } from '../common/errors/erro-dominio';

/** Classe base dos erros do módulo de atestados. */
export abstract class AtestadosError extends ErroDominio {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Período do atestado inválido (fim antes do início ou longo demais). */
export class PeriodoAtestadoInvalidoError extends AtestadosError {
  readonly statusHttp = HttpStatus.BAD_REQUEST;
  constructor(mensagem = 'Período do atestado inválido.') {
    super(mensagem);
  }
}

/** CID não informado e o atestado não foi marcado explicitamente "sem CID". */
export class CidObrigatorioError extends AtestadosError {
  readonly statusHttp = HttpStatus.BAD_REQUEST;
  constructor(
    mensagem = 'Informe o CID do atestado ou marque explicitamente "sem CID".',
  ) {
    super(mensagem);
  }
}

/** Atestado não encontrado (para consultar/remover). */
export class AtestadoNaoEncontradoError extends AtestadosError {
  readonly statusHttp = HttpStatus.NOT_FOUND;
  constructor(mensagem = 'Atestado não encontrado.') {
    super(mensagem);
  }
}

/**
 * Lançado quando o período do novo atestado se sobrepõe a um atestado já
 * existente do mesmo colaborador. Um dia só pode pertencer a UM atestado —
 * senão o vínculo `atestadoId` da falta do dia e a contagem por CID (INSS)
 * ficam ambíguos.
 */
export class AtestadoSobrepostoError extends AtestadosError {
  readonly statusHttp = HttpStatus.CONFLICT;
  constructor(
    mensagem = 'Já existe um atestado deste colaborador que cobre parte deste período. Remova-o antes de lançar um novo.',
  ) {
    super(mensagem);
  }
}

/**
 * Lançado quando o perfil não tem alçada para EXCLUIR um atestado.
 *
 * Lançar um atestado é rotina da escala (o fiscal também lança), mas excluir é
 * uma correção destrutiva e irreversível: apaga o documento, apaga os dias que
 * ele criou e devolve à condição de falta os dias que já eram falta. Por isso
 * segue a mesma alçada da exclusão de falta em Justificativas — gerente,
 * supervisor ou administrador.
 */
export class ExclusaoAtestadoNaoPermitidaError extends AtestadosError {
  readonly statusHttp = HttpStatus.FORBIDDEN;
  constructor(
    mensagem = 'Apenas gerente, supervisor ou administrador pode excluir um atestado.',
  ) {
    super(mensagem);
  }
}
