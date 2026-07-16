import { plainToInstance, Type } from 'class-transformer';
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

  // @Type garante a conversão explícita de string -> number, pois provedores
  // de hospedagem (ex.: Render) sempre fornecem PORT como string. Não depende
  // de enableImplicitConversion/emitDecoratorMetadata.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  PORT = 3000;

  // URL de conexão do banco de dados (Prisma). OBRIGATÓRIA em produção — a
  // exigência é imposta por `validateEnv` (falha rápida no boot). Opcional em
  // desenvolvimento/teste.
  @IsString()
  @IsOptional()
  DATABASE_URL?: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'HORARIO_FIM_DO_DIA deve estar no formato HH:mm',
  })
  @IsOptional()
  HORARIO_FIM_DO_DIA = '22:50';

  // Segredo de assinatura dos tokens JWT (Modulo_Acessos). OBRIGATÓRIO em
  // produção — a exigência é imposta por `validateEnv` (falha rápida no boot).
  // Opcional em desenvolvimento/teste (usa-se um segredo aleatório efêmero).
  @IsString()
  @IsOptional()
  JWT_SECRET?: string;

  // Tempo de expiração do token JWT (ex.: "8h", "30m").
  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN?: string;

  // Chave da API do Google Gemini (assistente de IA / chat flutuante). Obtida
  // gratuitamente no Google AI Studio. Opcional: sem ela, o assistente
  // responde com uma mensagem amigável de "não configurado".
  @IsString()
  @IsOptional()
  GEMINI_API_KEY?: string;

  // Modelo Gemini usado pelo assistente. Padrão: gemini-2.5-flash (rápido e
  // com camada gratuita ativa; o gemini-2.0-flash foi descontinuado em
  // jun/2026 e ficou sem cota gratuita).
  @IsString()
  @IsOptional()
  GEMINI_MODEL = 'gemini-2.5-flash';

  // Lista de origens permitidas para CORS (separadas por vírgula). Ex.:
  // "https://checkout-pro-web.onrender.com". Se vazio, em dev reflete a origem.
  @IsString()
  @IsOptional()
  CORS_ORIGINS?: string;

  // Janela de retenção (em meses) dos colaboradores desligados antes da purga
  // mensal apagar a ficha e o histórico de RRHH. Protege o histórico
  // disciplinar/trabalhista de desligados recentes. Padrão: 3 meses. Aumente
  // conforme a exigência legal do cliente.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  RETENCAO_INATIVOS_MESES = 3;
}

/**
 * Valida e converte as variáveis de ambiente cruas (strings) para o tipo
 * fortemente tipado. Usada por `@nestjs/config` via a opção `validate`.
 */
export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config);

  const errors = validateSync(validated, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Configuração de ambiente inválida: ${errors.toString()}`);
  }

  if (validated.NODE_ENV === Ambiente.Production && !validated.JWT_SECRET) {
    throw new Error(
      'Configuração de ambiente inválida: JWT_SECRET é obrigatório quando NODE_ENV=production.',
    );
  }

  if (validated.NODE_ENV === Ambiente.Production && !validated.DATABASE_URL) {
    throw new Error(
      'Configuração de ambiente inválida: DATABASE_URL é obrigatório quando NODE_ENV=production.',
    );
  }

  return validated;
}
