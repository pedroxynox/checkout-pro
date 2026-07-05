import { Module } from '@nestjs/common';
import { DataInicialController } from './data-inicial.controller';
import { DataInicialService } from './data-inicial.service';
import { ValidacaoDataService } from './validacao-data.service';

/**
 * Módulo da Data_Inicial_Sistema (Modulo_DataInicial): leitura/edição da
 * configuração global *singleton* e fonte de verdade da data mínima.
 *
 * Exporta `DataInicialService` (leitura/edição) e `ValidacaoDataService`
 * (validação de data mínima compartilhada) para reutilização pelos endpoints
 * de carga/edição (arrecadação, vendas, ausências, incidências, ponto,
 * checklist).
 *
 * PrismaService é global (PrismaModule), então não precisa ser reimportado.
 */
@Module({
  controllers: [DataInicialController],
  providers: [DataInicialService, ValidacaoDataService],
  exports: [DataInicialService, ValidacaoDataService],
})
export class DataInicialModule {}
