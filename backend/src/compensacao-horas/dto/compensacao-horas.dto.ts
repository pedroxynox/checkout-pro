import {
  IsIn,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Formato "HH:mm" (00:00–23:59). */
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Aprova (concede) uma compensação de horas.
 *
 * A tela manda o que a sugestão calculou, mas o serviço **revalida tudo**: o dia
 * pode ter virado feriado, folga ou ausência, e o saldo da pessoa muda a cada
 * batida nova. Os campos de justificativa (`motivo`, `vendaPrevista`,
 * `fonteVendaPrevista`, `coberturaNoDia`) são o retrato do momento da decisão —
 * gravados como vieram, porque servem justamente para lembrar o que se sabia
 * quando se decidiu.
 */
export class AprovarCompensacaoDto {
  @IsString({ message: 'colaboradorId é obrigatório.' })
  colaboradorId!: string;

  @IsISO8601({}, { message: 'data deve estar no formato ISO (AAAA-MM-DD).' })
  data!: string;

  @IsInt({ message: 'minutosCompensados deve ser um número inteiro.' })
  @Min(1, { message: 'A compensação tem de ter ao menos 1 minuto.' })
  @Max(24 * 60, { message: 'A compensação não pode passar de um dia.' })
  minutosCompensados!: number;

  @IsOptional()
  @Matches(HORA, { message: 'horaInicio deve estar no formato HH:mm.' })
  horaInicio?: string;

  @IsOptional()
  @Matches(HORA, { message: 'horaFim deve estar no formato HH:mm.' })
  horaFim?: string;

  @IsOptional()
  @IsIn(['SUGESTAO', 'MANUAL'], {
    message: 'origem deve ser SUGESTAO ou MANUAL.',
  })
  origem?: 'SUGESTAO' | 'MANUAL';

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'motivo deve ter no máximo 500 caracteres.' })
  motivo?: string;

  @IsOptional()
  @IsNumber({}, { message: 'vendaPrevista deve ser um número.' })
  @Min(0)
  vendaPrevista?: number;

  @IsOptional()
  @IsIn(['ESTIMATIVA', 'HISTORICO'], {
    message: 'fonteVendaPrevista deve ser ESTIMATIVA ou HISTORICO.',
  })
  fonteVendaPrevista?: 'ESTIMATIVA' | 'HISTORICO';

  @IsOptional()
  @IsInt()
  @Min(0)
  coberturaNoDia?: number;
}

/**
 * Descarta uma sugestão (pessoa + dia).
 *
 * O `motivo` é opcional, mas é o único caminho para as sugestões melhorarem: sem
 * ele, só se sabe que o gestor não quis, nunca por quê.
 */
export class RecusarSugestaoDto {
  @IsString({ message: 'colaboradorId é obrigatório.' })
  colaboradorId!: string;

  @IsISO8601({}, { message: 'data deve estar no formato ISO (AAAA-MM-DD).' })
  data!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'motivo deve ter no máximo 500 caracteres.' })
  motivo?: string;
}
