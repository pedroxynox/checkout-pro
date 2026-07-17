import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max } from 'class-validator';

/** Ação sobre um ciclo (fechar/reabrir). `ciclo` 0 = atual, negativo = anterior. */
export class AcaoCicloDto {
  @Type(() => Number)
  @IsInt()
  @Max(0, { message: 'O ciclo deve ser 0 (atual) ou negativo (anterior).' })
  @IsOptional()
  ciclo?: number;
}
