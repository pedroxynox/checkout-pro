import { CategoriaInsumo } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/** Cadastro de um novo insumo com limite mínimo (Req 3.3.4). */
export class CadastrarInsumoDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome do insumo é obrigatório.' })
  nome!: string;

  @IsEnum(CategoriaInsumo, {
    message: 'A categoria deve ser SACOLA, BOBINA, PANO ou OUTRO.',
  })
  categoria!: CategoriaInsumo;

  @Type(() => Number)
  @IsInt({ message: 'O limite mínimo deve ser um número inteiro.' })
  @Min(0, { message: 'O limite mínimo deve ser maior ou igual a zero.' })
  limiteMinimo!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'O saldo inicial deve ser um número inteiro.' })
  @Min(0, { message: 'O saldo inicial deve ser maior ou igual a zero.' })
  saldoInicial?: number;
}

/** Retirada de fardo de sacolas pelo código de barras (Req 3.1.1–3.1.3). */
export class RetiradaFardoDto {
  @IsString()
  @IsNotEmpty({ message: 'O código de barras é obrigatório.' })
  codigoBarras!: string;

  @IsString()
  @IsNotEmpty({ message: 'O insumo de sacolas é obrigatório.' })
  insumoId!: string;

  @IsOptional()
  @IsString()
  destino?: string;
}

/** Consumo de bobinas de um PDV (Req 3.2.2). */
export class ConsumoBobinaDto {
  @IsString()
  @IsNotEmpty({ message: 'O insumo (bobina) é obrigatório.' })
  insumoId!: string;

  @IsString()
  @IsNotEmpty({ message: 'O PDV é obrigatório.' })
  pdvId!: string;

  @Type(() => Number)
  @IsInt({ message: 'A quantidade deve ser um número inteiro.' })
  @Min(1, { message: 'A quantidade deve ser maior que zero.' })
  quantidade!: number;
}

/** Consumo simplificado em embalagens inteiras (1 fardo, 1 caixa, 1 galão). */
export class ConsumoEmbalagemDto {
  @IsString()
  @IsNotEmpty({ message: 'O insumo é obrigatório.' })
  insumoId!: string;

  @Type(() => Number)
  @IsInt({ message: 'A quantidade de embalagens deve ser um número inteiro.' })
  @Min(1, { message: 'A quantidade de embalagens deve ser maior que zero.' })
  embalagens!: number;
}

/** Consumo genérico de um insumo (Req 3.3.2). */
export class ConsumoInsumoDto {
  @IsString()
  @IsNotEmpty({ message: 'O insumo é obrigatório.' })
  insumoId!: string;

  @Type(() => Number)
  @IsInt({ message: 'A quantidade deve ser um número inteiro.' })
  @Min(1, { message: 'A quantidade deve ser maior que zero.' })
  quantidade!: number;
}

/** Registro de entrada de estoque (delta positivo) — Controle de requisição. */
export class RegistrarEntradaDto {
  @Type(() => Number)
  @IsInt({ message: 'A quantidade deve ser um número inteiro.' })
  @Min(1, { message: 'A quantidade deve ser maior que zero.' })
  quantidade!: number;

  @IsOptional()
  @IsString()
  origem?: string;

  @IsOptional()
  @IsString()
  data?: string;
}
