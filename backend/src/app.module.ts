import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AlertasModule } from './alertas/alertas.module';
import { DominioExceptionFilter } from './common/filters/dominio-exception.filter';
import { CorrelationIdMiddleware } from './common/correlation-id.middleware';
import { LoggingInterceptor } from './common/logging.interceptor';
import { SegurancaModule } from './common/seguranca.module';
import { StorageModule } from './storage/storage.module';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { AcessosModule } from './acessos/acessos.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { ArrecadacaoModule } from './arrecadacao/arrecadacao.module';
import { VendasModule } from './vendas/vendas.module';
import { MetasModule } from './metas/metas.module';
import { OperadoresModule } from './operadores/operadores.module';
import { ColaboradoresModule } from './colaboradores/colaboradores.module';
import { IncidenciasModule } from './incidencias/incidencias.module';
import { LoteApaeModule } from './lote-apae/lote-apae.module';
import { InsumosModule } from './insumos/insumos.module';
import { RequisicoesModule } from './requisicoes/requisicoes.module';
import { FiscaisModule } from './fiscais/fiscais.module';
import { ChecklistModule } from './checklist/checklist.module';
import { NotificacoesModule } from './notificacoes/notificacoes.module';
import { AssistenteModule } from './assistente/assistente.module';
import { DataInicialModule } from './data-inicial/data-inicial.module';
import { ResetOperacionalModule } from './reset-operacional/reset-operacional.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    // Limite GLOBAL de requisições — teto ALTO de anti-abuso apenas. Vários
    // usuários da loja compartilham UM ÚNICO IP público (NAT), então um limite
    // global baixo causaria falsos 429 para o time inteiro. O limite restrito
    // (brute force) é aplicado SOMENTE ao login, no AcessosController.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 2000 }]),
    PrismaModule,
    SegurancaModule,
    StorageModule,
    AcessosModule,
    UsuariosModule,
    ArrecadacaoModule,
    VendasModule,
    MetasModule,
    OperadoresModule,
    ColaboradoresModule,
    IncidenciasModule,
    LoteApaeModule,
    InsumosModule,
    RequisicoesModule,
    FiscaisModule,
    ChecklistModule,
    NotificacoesModule,
    AssistenteModule,
    AlertasModule,
    DataInicialModule,
    ResetOperacionalModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: DominioExceptionFilter },
    // Guarda global de rate limiting. Aplica o teto global (acima) a todas as
    // rotas; rotas com @Throttle têm seus próprios limites (ex.: login).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Observabilidade: log de uma linha por requisição (método, url, status,
    // duração e id de correlação) após a conclusão.
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Anexa/propaga o id de correlação (x-request-id) em todas as rotas.
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
