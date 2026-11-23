import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Um dia da disponibilidade. Entrada e saída vazias = sem horário nesse dia; o
 * formato HH:mm, "só uma das duas" e "saída depois da entrada" são conferidos no
 * domínio (`validarVigencia`), com a mensagem do dia.
 */
export class DisponibilidadeDiaDto {
  /** 0 = domingo … 6 = sábado. */
  @IsInt({ message: 'diaSemana deve ser de 0 (domingo) a 6 (sábado).' })
  @Min(0)
  @Max(6)
  diaSemana!: number;

  @IsOptional()
  @IsString()
  entrada?: string | null;

  @IsOptional()
  @IsString()
  saida?: string | null;
}

/**
 * Campos comuns de uma vigência da jornada. Grupo e folgas são conferidos no
 * domínio contra o contrato do dia.
 */
abstract class CamposVigenciaJornadaDto {
  /** Ausente = o contrato que já decide o dia. Trocar exige ADMIN_DADOS. */
  @IsOptional()
  @IsString()
  tipoContratoJornadaId?: string | null;

  /** 'G1' | 'G2' | 'G3'; null ou vazio = sem grupo. */
  @IsOptional()
  @IsString()
  grupo?: string | null;

  /** 0 = domingo … 6 = sábado; só sem grupo. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true, message: 'Folga fixa deve ser de 0 a 6.' })
  folgasFixas?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => DisponibilidadeDiaDto)
  disponibilidade?: DisponibilidadeDiaDto[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  motivo?: string | null;
}

const MSG_DATA = 'Data "vale a partir de" inválida (use AAAA-MM-DD).';

/** `PUT /colaboradores/:id/jornada`: a data é obrigatória. */
export class GravarJornadaDto extends CamposVigenciaJornadaDto {
  /** Primeiro dia (AAAA-MM-DD). */
  @IsDateString({}, { message: MSG_DATA })
  aPartirDe!: string;
}

/** Bloco `jornada` do `POST /colaboradores`. */
export class JornadaDoCadastroDto extends CamposVigenciaJornadaDto {
  /** Primeiro dia (AAAA-MM-DD); ausente = a data de admissão (ou hoje). */
  @IsOptional()
  @IsDateString({}, { message: MSG_DATA })
  aPartirDe?: string;
}
