import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/** Confirma sugestões de pedido (dá entrada no estoque). */
export class ConfirmarSugestoesDto {
  @IsArray({ message: 'A lista de sugestões (ids) é obrigatória.' })
  @IsString({ each: true, message: 'Cada id deve ser um texto.' })
  ids!: string[];

  /** Ajustes opcionais de quantidade por id (mapa id → quantidade). */
  @IsOptional()
  @IsObject({ message: 'Os ajustes devem ser um objeto id → quantidade.' })
  ajustes?: Record<string, number>;
}

/** Ignora sugestões de pedido (descarta sem dar entrada). */
export class IgnorarSugestoesDto {
  @IsArray({ message: 'A lista de sugestões (ids) é obrigatória.' })
  @IsString({ each: true, message: 'Cada id deve ser um texto.' })
  ids!: string[];
}

/** Configura um pedido recorrente (padrão de compra). */
export class ConfigurarPedidoDto {
  @IsString()
  @IsNotEmpty({ message: 'O insumo é obrigatório.' })
  insumoId!: string;

  @Type(() => Number)
  @IsInt({ message: 'A quantidade deve ser um número inteiro.' })
  @Min(1, { message: 'A quantidade deve ser maior que zero.' })
  quantidade!: number;

  @Type(() => Number)
  @IsInt({ message: 'A frequência (dias) deve ser um número inteiro.' })
  @Min(1, { message: 'A frequência (dias) deve ser maior que zero.' })
  frequenciaDias!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'O dia da sugestão deve ser um número inteiro.' })
  @Min(0, { message: 'O dia da sugestão não pode ser negativo.' })
  diaSugestao?: number;
}
