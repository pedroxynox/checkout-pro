import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsNumber, IsOptional, Min } from 'class-validator';
import { Periodo } from '../indicadores.domain';

/** Registro/alteração de venda diária (Req 2.1.1, 2.1.5). */
export class RegistrarVendaDto {
  @IsDateString({}, { message: 'A data deve ser uma data válida (ISO 8601).' })
  data!: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'O valor da venda deve ser numérico.' })
  valor!: number;
}

/** Consulta de acumulado por período (Req 2.1.2, 2.1.3). */
export class AcumuladoDto {
  @IsDateString({}, { message: 'A data deve ser uma data válida (ISO 8601).' })
  data!: string;

  @IsIn(['DIA', 'SEMANA', 'MES'], {
    message: 'O período deve ser DIA, SEMANA ou MES.',
  })
  periodo!: Periodo;
}

/** Cálculo do indicador percentual e da cor (Req 2.2–2.5). */
export class IndicadorCorDto {
  @IsIn(['CANCELAMENTO', 'DEVOLUCOES', 'TROCO', 'RECARGAS'], {
    message:
      'O indicador deve ser CANCELAMENTO, DEVOLUCOES, TROCO ou RECARGAS.',
  })
  indicador!: 'CANCELAMENTO' | 'DEVOLUCOES' | 'TROCO' | 'RECARGAS';

  @Type(() => Number)
  @IsNumber({}, { message: 'O valor atual deve ser numérico.' })
  valor!: number;

  @Type(() => Number)
  @IsNumber({}, { message: 'O limite amarelo deve ser numérico.' })
  @Min(0)
  limiteAmarelo!: number;
}

/** Consulta de ranking por tipo de registro e período (Req 2.2.6 etc.). */
export class RankingOperadoresDto {
  @IsIn(['CANCELAMENTO', 'TROCO', 'RECARGA'], {
    message: 'O tipo deve ser CANCELAMENTO, TROCO ou RECARGA.',
  })
  tipo!: 'CANCELAMENTO' | 'TROCO' | 'RECARGA';

  @IsDateString({}, { message: 'A data inicial deve ser uma data válida.' })
  inicio!: string;

  @IsDateString({}, { message: 'A data final deve ser uma data válida.' })
  fim!: string;
}

/** Consulta de ranking de fiscais por período (Req 2.3.6). */
export class RankingFiscaisDto {
  @IsDateString({}, { message: 'A data inicial deve ser uma data válida.' })
  inicio!: string;

  @IsDateString({}, { message: 'A data final deve ser uma data válida.' })
  fim!: string;
}

/** Cálculo de percentual avulso (Req 2.2.1, 2.3.1). */
export class PercentualDto {
  @Type(() => Number)
  @IsNumber({}, { message: 'O total do indicador deve ser numérico.' })
  totalIndicador!: number;

  @Type(() => Number)
  @IsNumber({}, { message: 'O total de vendas deve ser numérico.' })
  @IsOptional()
  totalVendas!: number;
}
