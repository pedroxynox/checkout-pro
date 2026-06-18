import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
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
    PrismaModule,
    AcessosModule,
    OperadoresModule,
    ImportacoesModule,
    IndicadoresModule,
    LoteApaeModule,
    InsumosModule,
    FiscaisModule,
    ChecklistModule,
    NotificacoesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
