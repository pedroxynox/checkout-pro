import { Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { DataInicialModule } from '../data-inicial/data-inicial.module';
import { EscalaDomingoModule } from '../escala-domingo/escala-domingo.module';
import { CicloFolhaModule } from '../ciclo-folha/ciclo-folha.module';
import { FeriasModule } from '../ferias/ferias.module';
import { FeriadosModule } from '../feriados/feriados.module';
import { OperadoresController } from './operadores.controller';
import { OperadoresService } from './operadores.service';
import { OperadorTurnoController } from './operador-turno.controller';
import { OperadorTurnoService } from './operador-turno.service';
import { EncerramentoAutomaticoService } from './encerramento-automatico.service';

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
  imports: [
    NotificacoesModule,
    DataInicialModule,
    EscalaDomingoModule,
    CicloFolhaModule,
    // Férias (inativação não rígida): quem está de férias sai do quadro do dia.
    // Sem este import o quadro mostrava a pessoa como "Trabalha" durante as
    // férias, discordando da escala de fiscais e da escala publicada.
    FeriasModule,
    // Feriados: no feriado vale o horário de DOMINGO da pessoa. Sem este import
    // o quadro mostrava o horário de dia útil, divergindo da escala publicada.
    FeriadosModule,
  ],
  // EncerramentoAutomaticoService: crons que encerram as pendências de escala
  // (faltas e não-retornos) depois de 3 dias sem análise.
  providers: [
    OperadoresService,
    OperadorTurnoService,
    EncerramentoAutomaticoService,
  ],
  controllers: [OperadoresController, OperadorTurnoController],
  exports: [OperadoresService],
})
export class OperadoresModule {}
