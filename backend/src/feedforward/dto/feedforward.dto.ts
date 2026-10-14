import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Um ponto a melhorar (com prazo) de uma rodada de feedforward. */
export class PontoFeedforwardDto {
  @IsString()
  @MinLength(2, { message: 'Descreva o ponto a melhorar.' })
  @MaxLength(300, { message: 'A descrição é muito longa (máx. 300).' })
  descricao!: string;

  @IsDateString(
    {},
    { message: 'O prazo do ponto deve ser uma data válida (ISO 8601).' },
  )
  prazo!: string;
}

/** Cria uma rodada de feedforward para um colaborador. */
export class CriarFeedforwardDto {
  @IsString()
  colaboradorId!: string;

  @IsDateString({}, { message: 'A data deve ser uma data válida (ISO 8601).' })
  data!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  pontosFortes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  oportunidades?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  compromissoFinal?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  evolucaoNota?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20, { message: 'Máximo de 20 pontos por rodada.' })
  @ValidateNested({ each: true })
  @Type(() => PontoFeedforwardDto)
  pontos?: PontoFeedforwardDto[];
}

const STATUS_REVISAO = ['ATINGIDO', 'NAO_ATINGIDO'];

/** Revisa um ponto (marca como atingido ou não atingido). */
export class RevisarPontoDto {
  @IsIn(STATUS_REVISAO, {
    message: 'Status inválido (ATINGIDO ou NAO_ATINGIDO).',
  })
  status!: 'ATINGIDO' | 'NAO_ATINGIDO';

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'A observação é muito longa (máx. 500).' })
  observacao?: string;
}

/**
 * Edita os dados de uma rodada. Campos ausentes não mudam; texto vazio (ou
 * `null`) limpa o campo; `evolucaoNota: null` remove a nota.
 */
export class EditarFeedforwardDto {
  @IsOptional()
  @IsDateString({}, { message: 'A data deve ser uma data válida (ISO 8601).' })
  data?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  pontosFortes?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  oportunidades?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  compromissoFinal?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  evolucaoNota?: number | null;
}

/** Edita a descrição de um ponto pendente. */
export class EditarPontoDto {
  @IsString()
  @MinLength(2, { message: 'Descreva o ponto a melhorar.' })
  @MaxLength(300, { message: 'A descrição é muito longa (máx. 300).' })
  descricao!: string;
}

/** Prorroga o prazo de um ponto pendente. */
export class ProrrogarPontoDto {
  @IsDateString(
    {},
    { message: 'O novo prazo deve ser uma data válida (ISO 8601).' },
  )
  prazo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'O motivo é muito longo (máx. 500).' })
  motivo?: string;
}
