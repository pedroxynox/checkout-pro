import { Module } from '@nestjs/common';
import { OperadoresController } from './operadores.controller';
import { OperadoresService } from './operadores.service';
import { OperadorTurnoController } from './operador-turno.controller';
import { OperadorTurnoService } from './operador-turno.service';

/**
 * Modulo_Operadores: cadastro de operadores e unicidade de nome (Req 6.1),
 * ausências e relatório por período (Req 6.2, 6.3) e classificação/contagem de
 * operadores por turno (Req 6.6). Inclui o Quadro de Operadores (escala fixa
 * visual: grade semanal trabalha/folga/falta + cobertura por dia).
 *
 * O `PrismaService` é provido globalmente pelo `PrismaModule`. Exporta o
 * `OperadoresService` para uso pela camada de API (Tarefa 13).
 */
@Module({
  providers: [OperadoresService, OperadorTurnoService],
  controllers: [OperadoresController, OperadorTurnoController],
  exports: [OperadoresService],
})
export class OperadoresModule {}
