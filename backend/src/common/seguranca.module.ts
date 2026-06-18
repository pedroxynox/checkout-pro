import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AcessosModule } from '../acessos/acessos.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PerfilGuard } from './guards/perfil.guard';

/**
 * Módulo de segurança transversal (Tarefa 13). Registra globalmente o guard de
 * autenticação JWT (Req 7.1) e o guard de autorização por perfil (Req 7.2),
 * de modo que todas as rotas exijam autenticação por padrão — exceto as
 * marcadas com `@Publico()` (ex.: login). A autorização por perfil só é exigida
 * nas rotas anotadas com `@Funcionalidade(...)`.
 *
 * Configura o `JwtModule` com o mesmo segredo/expiração do `AcessosModule`,
 * permitindo que o `JwtAuthGuard` verifique os tokens emitidos no login.
 */
@Global()
@Module({
  imports: [
    AcessosModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'dev-secret-trocar',
        signOptions: {
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') ??
            '8h') as `${number}h`,
        },
      }),
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PerfilGuard },
  ],
  exports: [JwtModule],
})
export class SegurancaModule {}
