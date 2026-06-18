import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { STATUS_FISCAIS, StatusFiscal } from '../fiscais.domain';

/** Alteração de status de um fiscal (Req 4.1.1–4.1.3). */
export class AlterarStatusDto {
  @IsIn(STATUS_FISCAIS as unknown as string[], {
    message: 'O status deve ser DISPONIVEL, EM_INTERVALO ou EM_ATENDIMENTO.',
  })
  status!: StatusFiscal;
}

/** Cadastro/edição de uma entrada de escala (Req 4.3.1–4.3.5). */
export class EscalaEntryDto {
  @Type(() => Number)
  @IsInt({ message: 'O dia da semana deve ser um inteiro de 0 a 6.' })
  @Min(0)
  @Max(6)
  diaSemana!: number;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'A entrada deve estar no formato HH:mm.',
  })
  entrada?: string | null;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'A saída deve estar no formato HH:mm.',
  })
  saida?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'O intervalo deve ser um número inteiro de minutos.' })
  @Min(0)
  intervaloMin?: number;

  @IsOptional()
  @IsBoolean()
  folga?: boolean;
}

/** Cadastro de escala geral, com o funcionário identificado (Req 4.3.1). */
export class CadastrarEscalaDto extends EscalaEntryDto {
  @IsString()
  funcionarioId!: string;
}
