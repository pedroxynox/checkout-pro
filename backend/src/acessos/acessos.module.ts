import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AcessosController } from './acessos.controller';
import { AcessosService } from './acessos.service';
import { resolverSegredoJwt } from '../common/config/jwt-secret';

/**
 * Modulo_Acessos: autenticação por login individual e exclusivo (Req 7.1) e
 * autorização por perfil (Req 7.2).
 *
 * Configura o `JwtModule` de forma assíncrona, lendo o segredo e a expiração
 * do ambiente. O segredo é obrigatório em produção (a API falha rápido se
 * ausente) e, em desenvolvimento/teste, usa um segredo aleatório efêmero por
 * processo — nunca um valor fixo versionado no repositório. Exporta o
 * `AcessosService` para uso pelos guards/controllers da camada de API.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: resolverSegredoJwt(config),
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
