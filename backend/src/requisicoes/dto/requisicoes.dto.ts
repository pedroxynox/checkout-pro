import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

/** Criação de uma requisição de insumo pelo fiscal. */
export class CriarRequisicaoDto {
  @IsString()
  @IsNotEmpty({ message: 'O insumo é obrigatório.' })
  insumoId!: string;

  @Type(() => Number)
  @IsInt({ message: 'A quantidade deve ser um número inteiro.' })
  @Min(1, { message: 'A quantidade deve ser maior que zero.' })
  quantidade!: number;

  @IsOptional()
  @IsString()
  observacao?: string;
}

/** Negação de uma requisição (motivo opcional). */
export class NegarRequisicaoDto {
  @IsOptional()
  @IsString()
  motivo?: string;
}
