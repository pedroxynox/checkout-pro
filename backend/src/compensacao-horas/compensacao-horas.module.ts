import { Module } from '@nestjs/common';
import { CentralJornadaModule } from '../central-jornada/central-jornada.module';
import { CicloFolhaModule } from '../ciclo-folha/ciclo-folha.module';
import { EscalaDomingoModule } from '../escala-domingo/escala-domingo.module';
import { FeriadosModule } from '../feriados/feriados.module';
import { FeriasModule } from '../ferias/ferias.module';
import { TiposContratoModule } from '../tipos-contrato/tipos-contrato.module';
import { CompensacaoHorasController } from './compensacao-horas.controller';
import { CompensacaoHorasService } from './compensacao-horas.service';

/**
 * Módulo da Compensação de horas (ADR 0021).
 *
 * Consome, sem reimplementar: o saldo de 50% da `CentralJornadaService`, a regra
 * única de folga do `FolgaService`, os feriados, as férias e as estatísticas de
 * venda (funções puras de `vendas.domain`). O `PrismaService` é global.
 *
 * A dependência é **de mão única de propósito**. Esta seção importa a Central
 * (precisa do saldo apurado por ela), mas a Central **não** importa esta: ela lê
 * as compensações aprovadas por uma função livre
 * (`carregarCompensacoesAprovadas`), no mesmo padrão de `carregarMapaDeFeriados`.
 * A alternativa — as duas se importarem com `forwardRef` — funciona, mas
 * transforma qualquer erro de ordem de inicialização num `undefined` silencioso
 * dentro do cálculo de horas, o pior lugar para uma dependência frágil.
 */
@Module({
  imports: [
    CentralJornadaModule,
    EscalaDomingoModule,
    FeriadosModule,
    FeriasModule,
    CicloFolhaModule,
    TiposContratoModule,
  ],
  controllers: [CompensacaoHorasController],
  providers: [CompensacaoHorasService],
  exports: [CompensacaoHorasService],
})
export class CompensacaoHorasModule {}
