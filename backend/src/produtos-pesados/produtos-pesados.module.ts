import { Module } from '@nestjs/common';
import { ProdutosPesadosController } from './produtos-pesados.controller';
import { ProdutosPesadosService } from './produtos-pesados.service';

/**
 * Módulo do catálogo de produtos pesados (balança). Usa o `PrismaService`
 * global; não precisa importar o PrismaModule (é `@Global`).
 */
@Module({
  controllers: [ProdutosPesadosController],
  providers: [ProdutosPesadosService],
})
export class ProdutosPesadosModule {}
