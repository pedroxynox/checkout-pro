import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Cancela uma solicitação de advertência (motivo opcional). */
export class CancelarSolicitacaoDto {
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'O motivo é muito longo (máx. 300).' })
  motivo?: string;
}
