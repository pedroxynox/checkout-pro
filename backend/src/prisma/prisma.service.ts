import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/** Teto padrão do pool de conexões quando DATABASE_CONNECTION_LIMIT não é definido. */
const LIMITE_CONEXOES_PADRAO = 10;

/** Tempo (segundos) que uma consulta espera por uma conexão livre no pool. */
const POOL_TIMEOUT_SEGUNDOS = 20;

/**
 * Aplica o teto de conexões do pool à string de conexão do Prisma.
 *
 * O plano de banco pago mais barato do Render (basic-256mb) tem um limite de
 * conexões baixo. Sem um teto explícito, o Prisma usa a fórmula padrão
 * (núcleos * 2 + 1), que — somada a migrações, seed e sessões manuais — pode
 * esgotar o banco. Fixamos `connection_limit` (e um `pool_timeout` maior que o
 * padrão) diretamente na URL, sem sobrescrever valores que já venham definidos
 * na própria string de conexão.
 */
export function aplicarLimiteDePool(
  urlBase: string | undefined,
  limite: number,
  poolTimeoutSegundos: number,
): string | undefined {
  if (!urlBase) return urlBase;
  try {
    const url = new URL(urlBase);
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', String(limite));
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', String(poolTimeoutSegundos));
    }
    return url.toString();
  } catch {
    // URL malformada: devolve como veio e deixa o Prisma reportar o erro claro.
    return urlBase;
  }
}

/**
 * Serviço de acesso ao banco de dados via Prisma.
 *
 * Estende o `PrismaClient` e integra o ciclo de vida do Nest: conecta ao
 * inicializar o módulo e desconecta ao destruí-lo. É injetável em qualquer
 * serviço de domínio que precise persistir ou consultar dados.
 *
 * Aplica um teto explícito ao pool de conexões (ver `aplicarLimiteDePool`),
 * dimensionado para uma única instância web sobre o Postgres pago do Render.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const limite = Number(
      process.env.DATABASE_CONNECTION_LIMIT ?? LIMITE_CONEXOES_PADRAO,
    );
    const limiteValido =
      Number.isInteger(limite) && limite > 0 ? limite : LIMITE_CONEXOES_PADRAO;
    const url = aplicarLimiteDePool(
      process.env.DATABASE_URL,
      limiteValido,
      POOL_TIMEOUT_SEGUNDOS,
    );
    // Sem DATABASE_URL (dev/teste), delega ao datasource padrão do schema.
    super(url ? { datasources: { db: { url } } } : undefined);
  }

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
