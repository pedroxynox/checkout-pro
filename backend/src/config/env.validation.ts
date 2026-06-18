import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export enum Ambiente {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

/**
 * Esquema das variáveis de ambiente. Mantém a configuração tipada e validada
 * na inicialização da aplicação (falha rápido se algo estiver incorreto).
 */
export class EnvironmentVariables {
  @IsEnum(Ambiente)
  @IsOptional()
  NODE_ENV: Ambiente = Ambiente.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  PORT = 3000;

  @IsString()
  @IsOptional()
  DATABASE_URL?: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'HORARIO_FIM_DO_DIA deve estar no formato HH:mm',
  })
  @IsOptional()
  HORARIO_FIM_DO_DIA = '18:00';
}

/**
 * Valida e converte as variáveis de ambiente cruas (strings) para o tipo
 * fortemente tipado. Usada por `@nestjs/config` via a opção `validate`.
 */
export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Configuração de ambiente inválida: ${errors.toString()}`);
  }

  return validated;
}
