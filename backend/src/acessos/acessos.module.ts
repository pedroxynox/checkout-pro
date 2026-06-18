import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
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
          // `expiresIn` aceita formatos como "8h"/"30m"; o tipo do pacote `ms`
          // é restritivo, então normalizamos para string.
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') ??
            '8h') as `${number}h`,
        },
      }),
    }),
  ],
  providers: [AcessosService],
  exports: [AcessosService],
})
export class AcessosModule {}
