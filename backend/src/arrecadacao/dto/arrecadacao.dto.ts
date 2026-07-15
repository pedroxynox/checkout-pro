import { Type } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { TIPOS_ARRECADACAO, TipoArrecadacao } from '../arrecadacao.domain';

export class UploadArrecadacaoDto {
  @IsIn(TIPOS_ARRECADACAO as unknown as string[], {
    message: 'Tipo de arrecadação inválido.',
  })
  tipo!: TipoArrecadacao;

  /** Data de referência (dia do fechamento). Padrão: hoje. */
  @IsOptional()
  @IsISO8601()
  data?: string;
}

export class ResumoArrecadacaoDto {
  @IsIn(TIPOS_ARRECADACAO as unknown as string[], {
    message: 'Tipo de arrecadação inválido.',
  })
  tipo!: TipoArrecadacao;

  @IsISO8601()
  data!: string;
}

export class RankingArrecadacaoDto {
  @IsIn(TIPOS_ARRECADACAO as unknown as string[], {
    message: 'Tipo de arrecadação inválido.',
  })
  tipo!: TipoArrecadacao;

  @IsISO8601()
  inicio!: string;

  @IsISO8601()
  fim!: string;
}

export class StatusArrecadacaoDto {
  @IsISO8601()
  data!: string;
}

/** Período (inicio/fim) sem tipo — usado na fila de não reconhecidos. */
export class PeriodoArrecadacaoDto {
  @IsISO8601()
  inicio!: string;

  @IsISO8601()
  fim!: string;
}

/** Marca/desmarca "sem movimento" de um tipo num dia. */
export class SemMovimentoArrecadacaoDto {
  @IsIn(TIPOS_ARRECADACAO as unknown as string[], {
    message: 'Tipo de arrecadação inválido.',
  })
  tipo!: TipoArrecadacao;

  @IsISO8601()
  data!: string;
}

/** Define (cria/atualiza) a meta de um indicador. */
export class DefinirMetaDto {
  @IsIn(TIPOS_ARRECADACAO as unknown as string[], {
    message: 'Tipo de arrecadação inválido.',
  })
  tipo!: TipoArrecadacao;

  @Type(() => Number)
  @IsNumber({}, { message: 'A meta deve ser um número.' })
  @Min(0, { message: 'A meta deve ser maior ou igual a zero.' })
  meta!: number;
}

/** Consulta por tipo + data (comparativo, projeção). */
export class IndicadorTipoDataDto {
  @IsIn(TIPOS_ARRECADACAO as unknown as string[], {
    message: 'Tipo de arrecadação inválido.',
  })
  tipo!: TipoArrecadacao;

  @IsISO8601()
  data!: string;
}

/** Consulta apenas por data (destaques do mês, anomalias, painel de atenção). */
export class DataIndicadorDto {
  @IsISO8601()
  data!: string;
}

/** Série temporal (tendência): tipo + data + janela de dias (1..365). */
export class TendenciaArrecadacaoDto {
  @IsIn(TIPOS_ARRECADACAO as unknown as string[], {
    message: 'Tipo de arrecadação inválido.',
  })
  tipo!: TipoArrecadacao;

  @IsISO8601()
  data!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'O número de dias deve ser um número.' })
  @Min(1, { message: 'O número de dias deve ser pelo menos 1.' })
  @Max(365, { message: 'O número de dias não pode passar de 365.' })
  dias?: number;
}
