import { IsIn, IsISO8601, IsOptional } from 'class-validator';
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
