import { IsISO8601, IsOptional } from 'class-validator';

export class UploadVendasDto {
  /** Data de referência (dia das vendas). Padrão: hoje. */
  @IsOptional()
  @IsISO8601()
  data?: string;
}

export class DataVendasDto {
  @IsISO8601()
  data!: string;
}

export class IntervaloVendasDto {
  @IsISO8601()
  inicio!: string;

  @IsISO8601()
  fim!: string;
}
