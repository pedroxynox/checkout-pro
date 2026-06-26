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
import { UsuariosModule } from './usuarios/usuarios.module';
import { ArrecadacaoModule } from './arrecadacao/arrecadacao.module';
import { VendasModule } from './vendas/vendas.module';
import { MetasModule } from './metas/metas.module';
import { OperadoresModule } from './operadores/operadores.module';
import { ColaboradoresModule } from './colaboradores/colaboradores.module';
import { LoteApaeModule } from './lote-apae/lote-apae.module';
import { InsumosModule } from './insumos/insumos.module';
import { RequisicoesModule } from './requisicoes/requisicoes.module';
import { FiscaisModule } from './fiscais/fiscais.module';
import { ChecklistModule } from './checklist/checklist.module';
import { NotificacoesModule } from './notificacoes/notificacoes.module';
import { AssistenteModule } from './assistente/assistente.module';

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
    UsuariosModule,
    ArrecadacaoModule,
    VendasModule,
    MetasModule,
    OperadoresModule,
    ColaboradoresModule,
    LoteApaeModule,
    InsumosModule,
    RequisicoesModule,
    FiscaisModule,
    ChecklistModule,
    NotificacoesModule,
    AssistenteModule,
    AlertasModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: DominioExceptionFilter },
  ],
})
export class AppModule {}
