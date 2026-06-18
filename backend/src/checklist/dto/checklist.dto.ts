import { IsDateString, IsIn, IsOptional } from 'class-validator';
import { TipoChecklist } from '../checklist.domain';

/** Tipo do checklist na rota (abertura/fechamento). */
export class TipoChecklistParamDto {
  @IsIn(['ABERTURA', 'FECHAMENTO'], {
    message: 'O tipo de checklist deve ser ABERTURA ou FECHAMENTO.',
  })
  tipo!: TipoChecklist;
}

/** Data de referência opcional do checklist diário (Req 5.1). */
export class ChecklistDataDto {
  @IsOptional()
  @IsDateString({}, { message: 'A data deve ser uma data válida (ISO 8601).' })
  data?: string;
}
