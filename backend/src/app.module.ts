import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { AcessosModule } from './acessos/acessos.module';
import { OperadoresModule } from './operadores/operadores.module';
import { ImportacoesModule } from './importacoes/importacoes.module';

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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
