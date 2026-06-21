import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { STATUS_FISCAIS, StatusFiscal } from '../fiscais.domain';

/** Define o status do próprio fiscal (Disponível / Intervalo / Fora de expediente). */
export class DefinirStatusDto {
  @IsIn(STATUS_FISCAIS as unknown as string[], {
    message: 'O status deve ser DISPONIVEL, INTERVALO ou FORA_EXPEDIENTE.',
  })
  status!: StatusFiscal;
}

/**
 * Entrada de escala de um dia (sem o funcionário): usada no corpo do horário
 * especial, onde o funcionário vem pela rota.
 */
export class EscalaEntryDto {
  @IsInt()
  @Min(0)
  @Max(6)
  diaSemana!: number;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'entrada deve estar no formato HH:mm',
  })
  entrada?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'saida deve estar no formato HH:mm',
  })
  saida?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  intervaloMin?: number;

  @IsOptional()
  @IsBoolean()
  folga?: boolean;
}

/** Cadastro da escala geral de um funcionário num dia (Req 4.3.1–4.3.4). */
export class CadastrarEscalaDto extends EscalaEntryDto {
  @IsString()
  @IsNotEmpty({ message: 'O funcionário é obrigatório.' })
  funcionarioId!: string;
}
