import { IsDateString } from 'class-validator';

/**
 * Payload de edição da Data_Inicial_Sistema (Requisito 5.3). A data é validada
 * pelo `class-validator`; formato inválido cai como 400 no `ValidationPipe`
 * global, com mensagem em pt-BR.
 */
export class EditarDataInicialDto {
  @IsDateString(
    {},
    { message: 'Data inicial inválida (use o formato AAAA-MM-DD).' },
  )
  dataInicial!: string;
}
