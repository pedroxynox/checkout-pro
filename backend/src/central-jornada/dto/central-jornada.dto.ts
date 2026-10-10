import { IsBoolean, IsDateString } from 'class-validator';

/** Marca/desmarca uma falta como débito de horas. */
export class MarcarDebitoDto {
  @IsBoolean({ message: 'debito deve ser true ou false.' })
  debito!: boolean;
}

/** Lança como débito um dia sem falta gravada ("faltou, não registrada"). */
export class LancarFaltaDebitoDto {
  @IsDateString(
    { strict: true },
    { message: 'data deve estar no formato AAAA-MM-DD.' },
  )
  data!: string;
}
