import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  MOTIVOS_JUSTIFICATIVA,
  MotivoJustificativa,
  STATUS_JUSTIFICATIVA,
  StatusJustificativa,
} from '../../common/justificativas';

/** Justifica (ou reabre) uma falta: define o estado e, se JUSTIFICADA, o motivo. */
export class JustificarAusenciaDto {
  @IsIn(STATUS_JUSTIFICATIVA as unknown as string[], {
    message: 'Estado de justificativa inválido.',
  })
  status!: StatusJustificativa;

  @IsOptional()
  @IsIn(MOTIVOS_JUSTIFICATIVA as unknown as string[], {
    message: 'Motivo de justificativa inválido.',
  })
  motivo?: MotivoJustificativa;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'A observação é muito longa (máx. 500).' })
  observacao?: string;
}

/** Registro de ausência de uma pessoa (operador/fiscal) numa data (Req 6.2). */
export class RegistrarAusenciaDto {
  @IsString()
  @IsNotEmpty({ message: 'O identificador da pessoa é obrigatório.' })
  pessoaId!: string;

  @IsDateString(
    {},
    { message: 'A data deve estar em formato de data válido (ISO 8601).' },
  )
  data!: string;
}

/**
 * Ausência a prazo: ausenta um colaborador por um período [inicio, fim] com uma
 * justificativa (o motivo é obrigatório, pois vira falta JUSTIFICADA).
 */
export class RegistrarAusenciaPeriodoDto {
  @IsString()
  @IsNotEmpty({ message: 'O identificador da pessoa é obrigatório.' })
  pessoaId!: string;

  @IsDateString(
    {},
    { message: 'A data inicial deve estar em formato válido (ISO 8601).' },
  )
  inicio!: string;

  @IsDateString(
    {},
    { message: 'A data final deve estar em formato válido (ISO 8601).' },
  )
  fim!: string;

  @IsIn(MOTIVOS_JUSTIFICATIVA as unknown as string[], {
    message: 'Motivo de justificativa inválido.',
  })
  motivo!: MotivoJustificativa;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'A observação é muito longa (máx. 500).' })
  observacao?: string;
}

/** Filtro por período do relatório de ausências (Req 6.3). */
export class PeriodoAusenciasDto {
  @IsDateString({}, { message: 'A data inicial deve ser uma data válida.' })
  inicio!: string;

  @IsDateString({}, { message: 'A data final deve ser uma data válida.' })
  fim!: string;
}

/** Item de escala diária para contagem por turno (Req 6.6). */
export class OperadorEscalaDiaDto {
  @IsString()
  @IsNotEmpty()
  operadorId!: string;

  @IsOptional()
  @IsString()
  entrada?: string | null;

  @IsOptional()
  folga?: boolean;

  @IsOptional()
  ferias?: boolean;

  @IsOptional()
  desligado?: boolean;
}

/** Corpo da contagem por turno: a escala do dia selecionado (Req 6.6.5–6.6.7). */
export class ContagemTurnoDto {
  @Type(() => OperadorEscalaDiaDto)
  operadores!: OperadorEscalaDiaDto[];
}

/** Filtro (data de referência) da grade semanal. */
export class GradeOperadoresDto {
  @IsOptional()
  @IsDateString({}, { message: 'A data deve ser uma data válida (ISO 8601).' })
  data?: string;
}
