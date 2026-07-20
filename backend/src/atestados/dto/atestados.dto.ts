import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** Lança um atestado para um colaborador por um período, com CID (ou sem CID). */
export class LancarAtestadoDto {
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
  @MaxLength(12, { message: 'CID inválido (máx. 12 caracteres).' })
  cid?: string;

  /** true = atestado explicitamente SEM CID. */
  @IsOptional()
  @IsBoolean()
  semCid?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'A observação é muito longa (máx. 500).' })
  observacao?: string;
}

/** Filtro por período da listagem de atestados. */
export class PeriodoAtestadosDto {
  @IsDateString({}, { message: 'A data inicial deve ser uma data válida.' })
  inicio!: string;

  @IsDateString({}, { message: 'A data final deve ser uma data válida.' })
  fim!: string;
}

/** Termo de busca do autocompletar de CID-10. */
export class BuscarCidDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  busca?: string;
}
