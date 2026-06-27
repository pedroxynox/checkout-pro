import { IsIn, IsNotEmpty, IsString, MinLength } from 'class-validator';

/** Cadastro de uma nova pessoa/usuário (login por matrícula). */
export class CadastrarUsuarioDto {
  @IsString()
  @IsNotEmpty({ message: 'A matrícula é obrigatória.' })
  matricula!: string;

  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório.' })
  nome!: string;

  @IsIn(
    ['GERENTE', 'GERENTE_DESENVOLVEDOR', 'SUPERVISOR', 'FISCAL', 'IMPORTADOR'],
    {
      message:
        'O perfil deve ser GERENTE, GERENTE_DESENVOLVEDOR, SUPERVISOR, FISCAL ou IMPORTADOR.',
    },
  )
  perfil!:
    | 'GERENTE'
    | 'GERENTE_DESENVOLVEDOR'
    | 'SUPERVISOR'
    | 'FISCAL'
    | 'IMPORTADOR';

  @IsString()
  @MinLength(6, { message: 'A senha deve ter ao menos 6 caracteres.' })
  senha!: string;
}

/** Redefinição de senha de um usuário. */
export class RedefinirSenhaDto {
  @IsString()
  @MinLength(6, { message: 'A senha deve ter ao menos 6 caracteres.' })
  senha!: string;
}
