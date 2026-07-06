import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** Registra o token de push (Expo) do dispositivo do usuário. */
export class RegistrarPushTokenDto {
  @IsString()
  @IsNotEmpty({ message: 'O token de push é obrigatório.' })
  @MaxLength(255)
  token!: string;

  @IsOptional()
  @IsIn(['android', 'ios', 'web'], { message: 'Plataforma inválida.' })
  plataforma?: string;
}

/** Remove o token de push (logout do aparelho). */
export class RemoverPushTokenDto {
  @IsString()
  @IsNotEmpty({ message: 'O token de push é obrigatório.' })
  @MaxLength(255)
  token!: string;
}
