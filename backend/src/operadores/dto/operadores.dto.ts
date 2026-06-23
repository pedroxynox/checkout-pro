import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

/** Cadastro/edição de operador por nome (Req 6.1). */
export class CadastrarOperadorDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome do operador é obrigatório.' })
  nome!: string;
}

/** Registro de ausência de uma pessoa (operador/fiscal) numa data (Req 6.2). */
export class RegistrarAusenciaDto {
  @IsString()
  @IsNotEmpty({ message: 'O identificador da pessoa é obrigatório.' })
  pessoaId!: string;

  @IsDateString(
    {},
    { message: 'A data deve estar em formato de data válido (ISO 8601).' },
  )
  data!: string;
}

/** Filtro por período do relatório de ausências (Req 6.3). */
export class PeriodoAusenciasDto {
  @IsDateString({}, { message: 'A data inicial deve ser uma data válida.' })
  inicio!: string;

  @IsDateString({}, { message: 'A data final deve ser uma data válida.' })
  fim!: string;
}

/** Item de escala diária para contagem por turno (Req 6.6). */
export class OperadorEscalaDiaDto {
  @IsString()
  @IsNotEmpty()
  operadorId!: string;

  @IsOptional()
  @IsString()
  entrada?: string | null;

  @IsOptional()
  folga?: boolean;

  @IsOptional()
  ferias?: boolean;

  @IsOptional()
  desligado?: boolean;
}

/** Corpo da contagem por turno: a escala do dia selecionado (Req 6.6.5–6.6.7). */
export class ContagemTurnoDto {
  @Type(() => OperadorEscalaDiaDto)
  operadores!: OperadorEscalaDiaDto[];
}

/** Turno fixo de um operador (Quadro de Operadores). */
export class TurnoOperadorDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório.' })
  nome!: string;

  @IsOptional()
  @IsIn(['M', 'F'], { message: 'genero deve ser M ou F' })
  genero?: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'entradaSemana deve ser HH:mm' })
  entradaSemana!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'saidaSemana deve ser HH:mm' })
  saidaSemana!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'entradaFds deve ser HH:mm' })
  entradaFds!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'saidaFds deve ser HH:mm' })
  saidaFds!: string;

  @IsInt()
  @Min(0)
  @Max(6)
  folgaDiaSemana!: number;
}

/** Importação em massa de turnos de operadores. */
export class ImportarTurnosDto {
  @Type(() => TurnoOperadorDto)
  turnos!: TurnoOperadorDto[];
}

/** Filtro (data de referência) da grade semanal. */
export class GradeOperadoresDto {
  @IsOptional()
  @IsDateString({}, { message: 'A data deve ser uma data válida (ISO 8601).' })
  data?: string;
}
