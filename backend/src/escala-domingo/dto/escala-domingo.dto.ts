import { IsDateString, IsIn } from 'class-validator';

/** Payload para definir o ponto de partida do rodízio de domingo. */
export class DefinirAncoraDomingoDto {
  /** Domingo de referência (ISO yyyy-mm-dd). Validado como domingo no serviço. */
  @IsDateString(
    {},
    { message: 'Data de referência inválida (use AAAA-MM-DD).' },
  )
  ancoraData!: string;

  /** Grupo que folga nesse domingo. */
  @IsIn(['G1', 'G2', 'G3'], { message: 'O grupo deve ser G1, G2 ou G3.' })
  ancoraGrupo!: string;
}
