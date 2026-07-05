import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { MarcoContrato, ResultadoDecisao } from '../contratos.domain';

const MARCOS: MarcoContrato[] = ['MARCO_45', 'MARCO_90'];
const RESULTADOS: ResultadoDecisao[] = ['APROVADO', 'REPROVADO'];

/** Define/atualiza a data de admissão de um colaborador (base do tempo de casa). */
export class DefinirAdmissaoDto {
  @IsDateString(
    {},
    { message: 'A data de admissão deve ser uma data válida (ISO 8601).' },
  )
  dataAdmissao!: string;
}

/** Registra a decisão de um marco (aprovar/reprovar 45 ou 90 dias). */
export class RegistrarDecisaoDto {
  @IsIn(MARCOS as unknown as string[], { message: 'Marco inválido.' })
  marco!: MarcoContrato;

  @IsIn(RESULTADOS as unknown as string[], {
    message: 'Resultado inválido (APROVADO ou REPROVADO).',
  })
  resultado!: ResultadoDecisao;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'A observação é muito longa (máx. 500).' })
  observacao?: string;
}

/** Filtros da listagem de contratos (cards). */
export class ListarContratosDto {
  @IsOptional()
  @IsString()
  busca?: string;

  @IsOptional()
  @IsIn(['experiencia', 'efetivado', 'encerrado', 'sem_admissao'], {
    message: 'Etiqueta inválida.',
  })
  etiqueta?: string;

  @IsOptional()
  @IsIn(['true', 'false'], {
    message: 'incluirSemAdmissao deve ser true/false.',
  })
  incluirSemAdmissao?: string;
}
