import { Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { DataInicialModule } from '../data-inicial/data-inicial.module';
import { EscalaDomingoModule } from '../escala-domingo/escala-domingo.module';
import { OperadoresController } from './operadores.controller';
import { OperadoresService } from './operadores.service';
import { OperadorTurnoController } from './operador-turno.controller';
import { OperadorTurnoService } from './operador-turno.service';

/**
 * Modulo_Operadores: cadastro de operadores e unicidade de nome (Req 6.1),
 * ausências e relatório por período (Req 6.2, 6.3) e classificação/contagem de
 * operadores por turno (Req 6.6). Inclui o Quadro de Operadores (escala fixa
 * visual: grade semanal trabalha/folga/falta + cobertura por dia, tablero ao
 * vivo, analítica de faltas e avisos automáticos).
 *
 * Importa o `NotificacoesModule` para os avisos (faltas da semana e cobertura
 * crítica). O `PrismaService` é provido globalmente pelo `PrismaModule`.
 */
@Module({
  imports: [NotificacoesModule, DataInicialModule, EscalaDomingoModule],
  providers: [OperadoresService, OperadorTurnoService],
  controllers: [OperadoresController, OperadorTurnoController],
  exports: [OperadoresService],
})
export class OperadoresModule {}
