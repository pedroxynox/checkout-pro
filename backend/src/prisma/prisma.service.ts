import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Serviço de acesso ao banco de dados via Prisma.
 *
 * Estende o `PrismaClient` e integra o ciclo de vida do Nest: conecta ao
 * inicializar o módulo e desconecta ao destruí-lo. É injetável em qualquer
 * serviço de domínio que precise persistir ou consultar dados.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Conexão com o banco de dados estabelecida.');
    } catch (error) {
      // Não interrompe o bootstrap caso o banco ainda não esteja disponível;
      // a conexão será tentada novamente na primeira consulta.
      this.logger.warn(
        `Não foi possível conectar ao banco de dados na inicialização: ${
          (error as Error).message
        }`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
