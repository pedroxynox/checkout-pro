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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
