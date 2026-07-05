import { Module } from '@nestjs/common';
import { ResetOperacionalController } from './reset-operacional.controller';
import { ResetOperacionalService } from './reset-operacional.service';

/**
 * Modulo_ResetOperacional: operação administrativa que apaga os
 * `Dados_de_Movimento` e zera `insumos.saldo` numa única transação,
 * conservando os `Dados_de_Cadastro`. `PrismaService` é global (PrismaModule),
 * então não precisa ser reimportado.
 *
 * Requisitos 8.1, 8.5.
 */
@Module({
  controllers: [ResetOperacionalController],
  providers: [ResetOperacionalService],
})
export class ResetOperacionalModule {}
