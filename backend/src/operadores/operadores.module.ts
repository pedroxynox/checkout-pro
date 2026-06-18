import { Module } from '@nestjs/common';
import { OperadoresController } from './operadores.controller';
import { OperadoresService } from './operadores.service';

/**
 * Modulo_Operadores: cadastro de operadores e unicidade de nome (Req 6.1),
 * ausências e relatório por período (Req 6.2, 6.3) e classificação/contagem de
 * operadores por turno (Req 6.6).
 *
 * O `PrismaService` é provido globalmente pelo `PrismaModule`. Exporta o
 * `OperadoresService` para uso pela camada de API (Tarefa 13).
 */
@Module({
  providers: [OperadoresService],
  controllers: [OperadoresController],
  exports: [OperadoresService],
})
export class OperadoresModule {}
