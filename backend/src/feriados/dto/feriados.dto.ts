import { IsDateString, IsIn, IsNotEmpty, IsString } from 'class-validator';

/** Cadastro manual de feriado ESTADUAL ou MUNICIPAL (os nacionais são automáticos). */
export class CriarFeriadoDto {
  @IsDateString({}, { message: 'A data deve ser válida (ISO 8601).' })
  data!: string;

  @IsString()
  @IsNotEmpty({ message: 'O nome do feriado é obrigatório.' })
  nome!: string;

  @IsIn(['ESTADUAL', 'MUNICIPAL'], {
    message: 'O âmbito deve ser ESTADUAL ou MUNICIPAL.',
  })
  ambito!: 'ESTADUAL' | 'MUNICIPAL';
}
