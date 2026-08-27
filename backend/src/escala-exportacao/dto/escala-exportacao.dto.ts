import { IsDateString, IsOptional } from 'class-validator';

/**
 * Data de referência da escala (`?data=YYYY-MM-DD`).
 *
 * Opcional: sem data, vale o dia civil de Brasília — publicar "a escala de hoje"
 * é o caso normal, e obrigar a informar a data só criaria oportunidade de erro.
 */
export class DataEscalaDto {
  @IsOptional()
  @IsDateString({}, { message: 'A data deve ser uma data válida (ISO 8601).' })
  data?: string;
}
