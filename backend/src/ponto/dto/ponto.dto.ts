import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { TIPOS_BATIDA, TipoBatida } from '../ponto.domain';

const TIPOS_PESSOA = ['FISCAL', 'OPERADOR'] as const;
type TipoPessoa = (typeof TIPOS_PESSOA)[number];
const ORIGENS = ['MANUAL', 'LEITOR', 'EDITADO'] as const;
type Origem = (typeof ORIGENS)[number];

/** Registra uma batida do dia (hora do papelito) para um colaborador. */
export class RegistrarBatidaDto {
  @IsString()
  @IsNotEmpty({ message: 'A pessoa é obrigatória.' })
  pessoaId!: string;

  @IsOptional()
  @IsIn(TIPOS_PESSOA as unknown as string[])
  tipoPessoa?: TipoPessoa;

  @IsOptional()
  @IsString()
  colaboradorId?: string;

  @IsDateString({}, { message: 'data deve ser uma data válida (ISO).' })
  data!: string;

  @IsDateString({}, { message: 'hora deve ser uma data/hora válida (ISO).' })
  hora!: string;

  @IsOptional()
  @IsIn(ORIGENS as unknown as string[])
  origem?: Origem;

  @IsOptional()
  @IsString()
  comprovanteUrl?: string;
}

/** Leitura do papelito: texto (já lido no app) OU imagem (OCR no servidor). */
export class LerPapelitoDto {
  @IsOptional()
  @IsString()
  texto?: string;

  @IsOptional()
  @IsString()
  imagem?: string;
}

/** Corrige uma batida: a hora (reclassifica o dia) e/ou o tipo. */
export class EditarBatidaDto {
  @IsOptional()
  @IsDateString({}, { message: 'hora deve ser uma data/hora válida (ISO).' })
  hora?: string;

  @IsOptional()
  @IsIn(TIPOS_BATIDA as unknown as string[])
  tipo?: TipoBatida;
}
