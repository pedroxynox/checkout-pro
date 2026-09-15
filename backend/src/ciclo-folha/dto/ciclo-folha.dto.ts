import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max } from 'class-validator';

/** Ação sobre um ciclo (fechar/reabrir). `ciclo` 0 = atual, negativo = anterior. */
export class AcaoCicloDto {
  @Type(() => Number)
  @IsInt()
  @Max(0, { message: 'O ciclo deve ser 0 (atual) ou negativo (anterior).' })
  @IsOptional()
  ciclo?: number;
}

/**
 * Consulta dos ciclos tocados por um período. Usada pelo app para avisar, antes
 * de salvar, que o período atravessa o fechamento da folha.
 */
export class IntervaloCicloDto {
  @IsDateString()
  inicio!: string;

  @IsDateString()
  fim!: string;
}
