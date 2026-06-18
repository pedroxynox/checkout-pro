import { Module } from '@nestjs/common';
import { IndicadoresService } from './indicadores.service';

/**
 * Modulo_Indicadores: Painel de Vendas (Req 2.1), indicadores percentuais e
 * de valor com classificação de cor (Req 2.2–2.5) e rankings de operadores e
 * fiscais (Req 2.2.6, 2.3.6, 2.4.6, 2.5.6).
 *
 * O `PrismaService` é provido globalmente pelo `PrismaModule`. Exporta o
 * `IndicadoresService` para uso pela camada de API (Tarefa 13).
 */
@Module({
  providers: [IndicadoresService],
  exports: [IndicadoresService],
})
export class IndicadoresModule {}
