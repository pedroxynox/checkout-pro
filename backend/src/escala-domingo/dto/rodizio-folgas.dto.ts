import { IsDateString, IsInt, IsObject, Max, Min } from 'class-validator';
import { MAX_SEMANAS_CICLO } from '../rodizio-folgas.domain';

/**
 * Uma vigência do rodízio de folgas (gravar ou simular). O padrão por grupo e
 * semana é validado no domínio (`validarRodizio`): 2 dias distintos por semana,
 * nunca o sábado.
 */
export class DefinirRodizioFolgasDto {
  /** Segunda-feira de início (AAAA-MM-DD). */
  @IsDateString({}, { message: 'Data de início inválida (use AAAA-MM-DD).' })
  vigenteDesde!: string;

  @IsInt({ message: 'Informe o número de semanas do ciclo.' })
  @Min(1)
  @Max(MAX_SEMANAS_CICLO)
  semanasNoCiclo!: number;

  /** { "G1": [[4,5],[2,3],[1,0]], "G2": …, "G3": … } (0 = domingo). */
  @IsObject({ message: 'Informe as folgas de G1, G2 e G3.' })
  padrao!: Record<string, number[][]>;
}
