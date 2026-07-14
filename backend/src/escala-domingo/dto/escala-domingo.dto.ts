import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDateString,
  IsIn,
} from 'class-validator';

/** Payload para definir o rodízio de domingo (referência + ordem do ciclo). */
export class DefinirAncoraDomingoDto {
  /** 1º domingo de referência do ciclo (ISO yyyy-mm-dd). Validado no serviço. */
  @IsDateString(
    {},
    { message: 'Data de referência inválida (use AAAA-MM-DD).' },
  )
  ancoraData!: string;

  /**
   * Ordem do ciclo: quem folga no 1º, 2º e 3º domingos (ex.: ['G1','G3','G2']).
   * Deve conter G1, G2 e G3, cada um uma vez (validado no serviço).
   */
  @ArrayMinSize(3, { message: 'Informe os 3 grupos do ciclo.' })
  @ArrayMaxSize(3, { message: 'Informe exatamente os 3 grupos do ciclo.' })
  @IsIn(['G1', 'G2', 'G3'], {
    each: true,
    message: 'Cada grupo do ciclo deve ser G1, G2 ou G3.',
  })
  ordem!: string[];
}
