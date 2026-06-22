import { IsISO8601, IsNumber, IsOptional, Min } from 'class-validator';

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

export class PainelVendasDto {
  /** Data de referência do painel. Padrão: hoje. */
  @IsOptional()
  @IsISO8601()
  data?: string;
}

export class ConfigVendasDto {
  /** Meta mensal de faturamento (R$). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  metaMensal?: number;
}
