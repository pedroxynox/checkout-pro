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

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const FUNCOES = ['OPERADOR', 'FISCAL', 'SUPERVISOR', 'GESTOR'];
const TURNOS = ['ABERTURA', 'INTERMEDIARIO', 'FECHAMENTO', 'APOIO'];

/** Cadastro de colaborador (operador por padrão). */
export class CadastrarColaboradorDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório.' })
  nome!: string;

  @IsString()
  @IsNotEmpty({ message: 'A matrícula é obrigatória.' })
  matricula!: string;

  @IsOptional()
  @IsString()
  login?: string;

  @IsOptional()
  @IsIn(FUNCOES, { message: 'Função inválida.' })
  funcao?: string;

  @IsOptional()
  @IsIn(['M', 'F'], { message: 'genero deve ser M ou F.' })
  genero?: string;

  @IsOptional()
  @IsIn(TURNOS, { message: 'Turno inválido.' })
  turno?: string;

  @IsOptional()
  @Matches(HHMM, { message: 'entradaSemana deve ser HH:mm.' })
  entradaSemana?: string;

  @IsOptional()
  @Matches(HHMM, { message: 'saidaSemana deve ser HH:mm.' })
  saidaSemana?: string;

  @IsOptional()
  @Matches(HHMM, { message: 'entradaFds deve ser HH:mm.' })
  entradaFds?: string;

  @IsOptional()
  @Matches(HHMM, { message: 'saidaFds deve ser HH:mm.' })
  saidaFds?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  folgaDiaSemana?: number;
}

/** Edição de colaborador — todos os campos opcionais. */
export class EditarColaboradorDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'O nome não pode ser vazio.' })
  nome?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'A matrícula não pode ser vazia.' })
  matricula?: string;

  @IsOptional()
  @IsString()
  login?: string;

  @IsOptional()
  @IsIn(FUNCOES, { message: 'Função inválida.' })
  funcao?: string;

  @IsOptional()
  @IsIn(['M', 'F'], { message: 'genero deve ser M ou F.' })
  genero?: string;

  @IsOptional()
  @IsIn(TURNOS, { message: 'Turno inválido.' })
  turno?: string;

  @IsOptional()
  @Matches(HHMM, { message: 'entradaSemana deve ser HH:mm.' })
  entradaSemana?: string;

  @IsOptional()
  @Matches(HHMM, { message: 'saidaSemana deve ser HH:mm.' })
  saidaSemana?: string;

  @IsOptional()
  @Matches(HHMM, { message: 'entradaFds deve ser HH:mm.' })
  entradaFds?: string;

  @IsOptional()
  @Matches(HHMM, { message: 'saidaFds deve ser HH:mm.' })
  saidaFds?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  folgaDiaSemana?: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

/** Filtros da listagem de colaboradores. */
export class ListarColaboradoresDto {
  @IsOptional()
  @IsString()
  busca?: string;

  @IsOptional()
  @IsIn(FUNCOES, { message: 'Função inválida.' })
  funcao?: string;

  @IsOptional()
  @IsIn(TURNOS, { message: 'Turno inválido.' })
  turno?: string;

  @IsOptional()
  @IsIn(['true', 'false'], { message: 'ativo deve ser true ou false.' })
  ativo?: string;
}
