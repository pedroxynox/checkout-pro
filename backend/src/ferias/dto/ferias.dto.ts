import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** Registra um período de férias de um colaborador. */
export class RegistrarFeriasDto {
  @IsString()
  @IsNotEmpty({ message: 'O identificador do colaborador é obrigatório.' })
  colaboradorId!: string;

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

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'A observação é muito longa (máx. 500).' })
  observacao?: string;
}

/** Filtro da listagem de férias. */
export class ListarFeriasDto {
  @IsOptional()
  @IsString()
  colaboradorId?: string;

  /** Data de referência para marcar o período como vigente (padrão: hoje). */
  @IsOptional()
  @IsDateString({}, { message: 'A data deve ser uma data válida (ISO 8601).' })
  referencia?: string;

  /**
   * Inclui também os períodos JÁ ENCERRADOS. Por padrão a lista só traz as
   * férias em curso e as futuras — o histórico não polui a tela de operação.
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  incluirEncerradas?: boolean;
}
