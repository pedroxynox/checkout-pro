import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

export interface InfoAplicacao {
  nome: string;
  descricao: string;
  status: 'ok';
}

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  /** Informações básicas da aplicação (rota pública `/`). */
  info(): InfoAplicacao {
    return {
      nome: 'Check-out PRO',
      descricao: 'API backend (NestJS)',
      status: 'ok',
    };
  }

  /** Liveness: o processo está de pé. Não toca no banco. */
  saude(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /**
   * Readiness: verifica se o banco de dados responde. Lança 503 caso não,
   * para que orquestradores/monitores não roteiem tráfego para uma instância
   * incapaz de servir. Mantém o boot tolerante (a conexão pode subir depois).
   */
  async prontidao(): Promise<{ status: 'ok'; banco: 'ok' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', banco: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Banco de dados indisponível');
    }
  }
}
