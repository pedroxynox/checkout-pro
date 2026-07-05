import {
  IsBoolean,
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
  @IsString()
  usuarioId?: string;

  @IsOptional()
  @IsString()
  senha?: string;

  @IsOptional()
  @IsBoolean()
  gerenteDesenvolvedor?: boolean;

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
  @IsDateString(
    {},
    { message: 'A data de admissão deve ser uma data válida (ISO 8601).' },
  )
  dataAdmissao?: string;
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
  @IsString()
  usuarioId?: string;

  @IsOptional()
  @IsString()
  senha?: string;

  @IsOptional()
  @IsBoolean()
  gerenteDesenvolvedor?: boolean;

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
  @IsDateString(
    {},
    { message: 'A data de admissão deve ser uma data válida (ISO 8601).' },
  )
  dataAdmissao?: string;

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

/** Período (inicio/fim) do perfil inteligente do colaborador. */
export class PerfilColaboradorDto {
  @IsOptional()
  @IsDateString({}, { message: 'A data inicial deve ser uma data válida.' })
  inicio?: string;

  @IsOptional()
  @IsDateString({}, { message: 'A data final deve ser uma data válida.' })
  fim?: string;
}

/**
 * Associa um código bruto (matrícula/login do arquivo) a um colaborador, para
 * atribuir-lhe os lançamentos antes "não reconhecidos". Tratado como matrícula.
 */
export class AdicionarIdentificadorDto {
  @IsString()
  @IsNotEmpty({ message: 'O código (matrícula) é obrigatório.' })
  valor!: string;
}
