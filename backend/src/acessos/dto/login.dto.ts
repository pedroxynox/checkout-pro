import { IsNotEmpty, IsString } from 'class-validator';

/** Corpo da requisição de login (Req 7.1): login individual e senha. */
export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: 'O login é obrigatório.' })
  login!: string;

  @IsString()
  @IsNotEmpty({ message: 'A senha é obrigatória.' })
  senha!: string;
}
