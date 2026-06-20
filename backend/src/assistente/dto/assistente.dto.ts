import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Envio de uma mensagem do usuário ao assistente de IA. */
export class EnviarMensagemDto {
  @IsString()
  @IsNotEmpty({ message: 'A mensagem não pode estar vazia.' })
  @MaxLength(2000, {
    message: 'A mensagem é muito longa (máx. 2000 caracteres).',
  })
  texto!: string;
}
