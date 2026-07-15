import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { TIPOS_BATIDA, TipoBatida } from '../ponto.domain';

const TIPOS_PESSOA = ['FISCAL', 'OPERADOR'] as const;
type TipoPessoa = (typeof TIPOS_PESSOA)[number];
const ORIGENS = ['MANUAL', 'LEITOR', 'EDITADO'] as const;
type Origem = (typeof ORIGENS)[number];

/** Registra uma batida do dia (hora do comprovante) para um colaborador. */
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

  /**
   * Nome exatamente como foi LIDO do comprovante (OCR). Quando a batida vem do
   * leitor (origem LEITOR), guardamos o vínculo "nome lido → pessoa" para
   * reconhecer a pessoa na hora nas próximas leituras.
   */
  @IsOptional()
  @IsString()
  nomeLido?: string;

  /** Confiança (0–1) da leitura que originou a batida (auditoria). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confianca?: number;
}

/** Leitura do comprovante: o texto já lido no aparelho (ML Kit, no APK). */
export class LerComprovanteDto {
  @IsString()
  @IsNotEmpty({ message: 'O texto do comprovante é obrigatório.' })
  texto!: string;
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
