import { IsBoolean } from 'class-validator';

/** Marca/desmarca uma falta como débito de horas. */
export class MarcarDebitoDto {
  @IsBoolean({ message: 'debito deve ser true ou false.' })
  debito!: boolean;
}
