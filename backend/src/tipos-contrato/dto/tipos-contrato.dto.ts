import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Cadastro de um tipo de contrato de jornada. Todos os tempos são em MINUTOS
 * (mais amigáveis na UI); o backend converte para ms ao aplicar as regras.
 */
export class CriarTipoContratoDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório.' })
  @MaxLength(60)
  nome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  descricao?: string;

  @IsArray()
  @ArrayMinSize(7, {
    message: 'Informe a carga base dos 7 dias (domingo a sábado).',
  })
  @ArrayMaxSize(7, {
    message: 'Informe a carga base dos 7 dias (domingo a sábado).',
  })
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(1440, { each: true })
  cargaBaseMinPorDia!: number[];

  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  diasComAdicional100!: number[];

  @IsInt()
  @Min(0)
  @Max(1440)
  maxTrabalhoSemIntervaloMin!: number;

  @IsInt()
  @Min(0)
  @Max(1440)
  intervaloMinimoMin!: number;

  @IsInt()
  @Min(0)
  @Max(1440)
  intervaloMaximoMin!: number;

  @IsInt()
  @Min(0)
  @Max(1440)
  limiteExtrasMin!: number;

  @IsInt()
  @Min(0)
  @Max(1440)
  riscoTac1h30Min!: number;

  @IsInt()
  @Min(0)
  @Max(1440)
  riscoTac1h40Min!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  intervaloMinimoEntreBatidasMin?: number;

  @IsOptional()
  @IsBoolean()
  intervaloObrigatorio?: boolean;

  @IsOptional()
  @IsBoolean()
  trabalhaDomingo?: boolean;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

/** Edição de um tipo de contrato: todos os campos são opcionais. */
export class AtualizarTipoContratoDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'O nome não pode ser vazio.' })
  @MaxLength(60)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  descricao?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(7, {
    message: 'Informe a carga base dos 7 dias (domingo a sábado).',
  })
  @ArrayMaxSize(7, {
    message: 'Informe a carga base dos 7 dias (domingo a sábado).',
  })
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(1440, { each: true })
  cargaBaseMinPorDia?: number[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  diasComAdicional100?: number[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  maxTrabalhoSemIntervaloMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  intervaloMinimoMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  intervaloMaximoMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  limiteExtrasMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  riscoTac1h30Min?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  riscoTac1h40Min?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  intervaloMinimoEntreBatidasMin?: number;

  @IsOptional()
  @IsBoolean()
  intervaloObrigatorio?: boolean;

  @IsOptional()
  @IsBoolean()
  trabalhaDomingo?: boolean;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

/** Ativa/desativa um tipo de contrato. */
export class AlternarAtivoDto {
  @IsBoolean()
  ativo!: boolean;
}
