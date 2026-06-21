import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AcessosController } from './acessos.controller';
import { AcessosService } from './acessos.service';

/**
 * Modulo_Acessos: autenticação por login individual e exclusivo (Req 7.1) e
 * autorização por perfil (Req 7.2).
 *
 * Configura o `JwtModule` de forma assíncrona, lendo o segredo e a expiração
 * do ambiente (com padrões seguros para desenvolvimento). Exporta o
 * `AcessosService` para uso pelos guards/controllers da camada de API.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'dev-secret-trocar',
        signOptions: {
          // Sessão de 30 dias por padrão (a equipe permanece logada ~1 mês);
          // ajustável via JWT_EXPIRES_IN (ex.: "8h", "30m", "30d").
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') ??
            '30d') as `${number}d`,
        },
      }),
    }),
  ],
  providers: [AcessosService],
  controllers: [AcessosController],
  exports: [AcessosService],
})
export class AcessosModule {}
