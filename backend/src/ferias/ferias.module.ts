import { Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { FeriasController } from './ferias.controller';
import { FeriasService } from './ferias.service';

/**
 * Módulo de Férias: inativação NÃO rígida de um colaborador por um período
 * (some da escala e não gera falta automática, mantendo `ativo = true`).
 *
 * Exporta o `FeriasService` para a escala (fiscais/operadores) consultar quem
 * está de férias num dia (`colaboradoresDeFeriasNoDia`). Importa o
 * `NotificacoesModule` para os avisos; o `PrismaService` é global.
 */
@Module({
  imports: [NotificacoesModule],
  providers: [FeriasService],
  controllers: [FeriasController],
  exports: [FeriasService],
})
export class FeriasModule {}
