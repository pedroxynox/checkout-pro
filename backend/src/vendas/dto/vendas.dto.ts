import {
  IsArray,
  IsISO8601,
  IsNumber,
  IsOptional,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

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

const ANO_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export class ListarEstimativasDto {
  /** Período mensal "AAAA-MM". */
  @Matches(ANO_MES, { message: 'anoMes deve ser AAAA-MM.' })
  anoMes!: string;
}

/** Uma estimativa de venda para uma data (valor 0 remove a estimativa). */
export class EstimativaDiaDto {
  @IsISO8601()
  data!: string;

  @IsNumber()
  @Min(0)
  valor!: number;
}

/** Define as estimativas de venda por dia de um mês (upsert em lote). */
export class DefinirEstimativasDto {
  @Matches(ANO_MES, { message: 'anoMes deve ser AAAA-MM.' })
  anoMes!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EstimativaDiaDto)
  dias!: EstimativaDiaDto[];
}
