import {
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  EQUIPAMENTOS_CHECKOUT,
  MAX_CHECKOUTS,
  MIN_CHECKOUTS,
} from '../checkouts.domain';
import { IsIn } from 'class-validator';

/** Define a quantidade de check-outs (caixas) da loja. */
export class DefinirQuantidadeDto {
  @Type(() => Number)
  @IsInt({ message: 'A quantidade deve ser um número inteiro.' })
  @Min(MIN_CHECKOUTS, { message: `Mínimo de ${MIN_CHECKOUTS} check-out.` })
  @Max(MAX_CHECKOUTS, { message: `Máximo de ${MAX_CHECKOUTS} check-outs.` })
  quantidade!: number;
}

/** Registra uma avaria em um equipamento de um check-out. */
export class CriarReporteDto {
  @IsIn(EQUIPAMENTOS_CHECKOUT as unknown as string[], {
    message: 'Equipamento inválido.',
  })
  equipamento!: string;

  @IsString()
  @IsNotEmpty({ message: 'A descrição é obrigatória.' })
  @MaxLength(500, { message: 'A descrição é muito longa (máx. 500).' })
  descricao!: string;
}
