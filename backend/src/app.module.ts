import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AlertasModule } from './alertas/alertas.module';
import { DominioExceptionFilter } from './common/filters/dominio-exception.filter';
import { SegurancaModule } from './common/seguranca.module';
import { StorageModule } from './storage/storage.module';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { AcessosModule } from './acessos/acessos.module';
import { OperadoresModule } from './operadores/operadores.module';
import { ImportacoesModule } from './importacoes/importacoes.module';
import { IndicadoresModule } from './indicadores/indicadores.module';
import { LoteApaeModule } from './lote-apae/lote-apae.module';
import { InsumosModule } from './insumos/insumos.module';
import { FiscaisModule } from './fiscais/fiscais.module';
import { ChecklistModule } from './checklist/checklist.module';
import { NotificacoesModule } from './notificacoes/notificacoes.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    SegurancaModule,
    StorageModule,
    AcessosModule,
    OperadoresModule,
    ImportacoesModule,
    IndicadoresModule,
    LoteApaeModule,
    InsumosModule,
    FiscaisModule,
    ChecklistModule,
    NotificacoesModule,
    AlertasModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: DominioExceptionFilter },
  ],
})
export class AppModule {}
