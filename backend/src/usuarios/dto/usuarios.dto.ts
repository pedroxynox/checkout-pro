import { IsIn, IsNotEmpty, IsString, MinLength } from 'class-validator';

/** Cadastro de uma nova pessoa/usuário (login por matrícula). */
export class CadastrarUsuarioDto {
  @IsString()
  @IsNotEmpty({ message: 'A matrícula é obrigatória.' })
  matricula!: string;

  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório.' })
  nome!: string;

  @IsIn(['GERENTE', 'FISCAL'], {
    message: 'O perfil deve ser GERENTE ou FISCAL.',
  })
  perfil!: 'GERENTE' | 'FISCAL';

  @IsString()
  @MinLength(4, { message: 'A senha deve ter ao menos 4 caracteres.' })
  senha!: string;
}

/** Redefinição de senha de um usuário. */
export class RedefinirSenhaDto {
  @IsString()
  @MinLength(4, { message: 'A senha deve ter ao menos 4 caracteres.' })
  senha!: string;
}
