import { Module } from '@nestjs/common';
import { DataInicialController } from './data-inicial.controller';
import { DataInicialService } from './data-inicial.service';

/**
 * Módulo da Data_Inicial_Sistema (Modulo_DataInicial): leitura/edição da
 * configuração global *singleton* e fonte de verdade da data mínima.
 *
 * Exporta `DataInicialService` para reutilização por outros módulos. Na Ola B
 * (Tarefa 3) este módulo também proverá/exportará o `ValidacaoDataService`
 * compartilhado, injetado nos endpoints de carga/edição.
 *
 * PrismaService é global (PrismaModule), então não precisa ser reimportado.
 */
@Module({
  controllers: [DataInicialController],
  providers: [DataInicialService],
  exports: [DataInicialService],
})
export class DataInicialModule {}
