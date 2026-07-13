import { Module } from '@nestjs/common';
import { EscalaDomingoController } from './escala-domingo.controller';
import { EscalaDomingoService } from './escala-domingo.service';

/**
 * Módulo do rodízio de domingo: leitura/edição da âncora (ponto de partida) da
 * rotação por grupos (G1/G2/G3), guardada no singleton `ConfigSistema`.
 *
 * Exporta o serviço para reutilização pela tela de Escalas (resolução de quem
 * trabalha/folga em cada domingo). PrismaService é global.
 */
@Module({
  controllers: [EscalaDomingoController],
  providers: [EscalaDomingoService],
  exports: [EscalaDomingoService],
})
export class EscalaDomingoModule {}
