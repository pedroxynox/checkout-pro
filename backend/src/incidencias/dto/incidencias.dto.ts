import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TIPOS_INCIDENCIA, TipoIncidencia } from '../incidencias.domain';
import {
  MOTIVOS_JUSTIFICATIVA,
  MotivoJustificativa,
  STATUS_JUSTIFICATIVA,
  StatusJustificativa,
} from '../../common/justificativas';

/** Justifica (ou reabre) um não-retorno de intervalo. */
export class JustificarIncidenciaDto {
  @IsIn(STATUS_JUSTIFICATIVA as unknown as string[], {
    message: 'Estado de justificativa inválido.',
  })
  status!: StatusJustificativa;

  @IsOptional()
  @IsIn(MOTIVOS_JUSTIFICATIVA as unknown as string[], {
    message: 'Motivo de justificativa inválido.',
  })
  motivo?: MotivoJustificativa;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'A observação é muito longa (máx. 500).' })
  observacao?: string;
}

/** Expressão de horário "HH:mm" (00:00–23:59). */
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const MSG_HHMM = 'O horário deve estar no formato HH:mm (00:00–23:59).';

/** Registra uma incidência de escala (por colaborador, tipo e data). */
export class CriarIncidenciaDto {
  @IsString()
  @IsNotEmpty({ message: 'O identificador do colaborador é obrigatório.' })
  colaboradorId!: string;

  @IsIn(TIPOS_INCIDENCIA as unknown as string[], {
    message: 'Tipo de incidência inválido.',
  })
  tipo!: TipoIncidencia;

  @IsDateString(
    {},
    { message: 'A data deve estar em formato de data válido (ISO 8601).' },
  )
  data!: string;

  @IsOptional()
  @Matches(HHMM, { message: MSG_HHMM })
  horaSaida?: string;

  @IsOptional()
  @Matches(HHMM, { message: MSG_HHMM })
  horaEsperadaRetorno?: string;

  @IsOptional()
  @Matches(HHMM, { message: MSG_HHMM })
  horaReal?: string;

  @IsOptional()
  @IsString()
  motivo?: string;

  @IsOptional()
  @IsString()
  observacao?: string;

  /** Duração da suspensão em dias (só para SUSPENSAO). */
  @IsOptional()
  @IsInt({ message: 'A duração da suspensão deve ser um número inteiro.' })
  @Min(1, { message: 'A suspensão deve ter ao menos 1 dia.' })
  @Max(60, { message: 'A suspensão não pode passar de 60 dias.' })
  diasSuspensao?: number;

  /** Vínculo opcional com a ocorrência que motivou a sanção (informativo). */
  @IsOptional()
  @IsString()
  causaTipo?: string;

  @IsOptional()
  @IsDateString({}, { message: 'A data da causa deve ser válida.' })
  causaData?: string;
}

/** Edita os campos editáveis de uma incidência (parcial). */
export class EditarIncidenciaDto {
  @IsOptional()
  @Matches(HHMM, { message: MSG_HHMM })
  horaSaida?: string;

  @IsOptional()
  @Matches(HHMM, { message: MSG_HHMM })
  horaEsperadaRetorno?: string;

  @IsOptional()
  @Matches(HHMM, { message: MSG_HHMM })
  horaReal?: string;

  @IsOptional()
  @IsString()
  motivo?: string;

  @IsOptional()
  @IsString()
  observacao?: string;
}

/** Filtros de listagem de incidências. */
export class ListarIncidenciasDto {
  @IsOptional()
  @IsString()
  colaboradorId?: string;

  @IsOptional()
  @IsIn(TIPOS_INCIDENCIA as unknown as string[], {
    message: 'Tipo de incidência inválido.',
  })
  tipo?: TipoIncidencia;

  @IsOptional()
  @IsDateString({}, { message: 'A data inicial deve ser uma data válida.' })
  inicio?: string;

  @IsOptional()
  @IsDateString({}, { message: 'A data final deve ser uma data válida.' })
  fim?: string;
}

/** Filtro de data para as sugestões (auto-detecção do ponto). */
export class SugestoesIncidenciaDto {
  @IsOptional()
  @IsDateString({}, { message: 'A data deve ser uma data válida (ISO 8601).' })
  data?: string;
}

/** Janela do ranking de incidências (tipo opcional para comparar um evento). */
export class RankingIncidenciasDto {
  @IsDateString({}, { message: 'A data inicial deve ser uma data válida.' })
  inicio!: string;

  @IsDateString({}, { message: 'A data final deve ser uma data válida.' })
  fim!: string;

  @IsOptional()
  @IsIn(TIPOS_INCIDENCIA as unknown as string[], {
    message: 'Tipo de incidência inválido.',
  })
  tipo?: TipoIncidencia;
}

/** Janela do panorama de sanções (advertência/suspensão). */
export class SancoesDto {
  @IsDateString({}, { message: 'A data inicial deve ser uma data válida.' })
  inicio!: string;

  @IsDateString({}, { message: 'A data final deve ser uma data válida.' })
  fim!: string;
}
