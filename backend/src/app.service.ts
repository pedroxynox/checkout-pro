import { Injectable } from '@nestjs/common';

export interface InfoAplicacao {
  nome: string;
  descricao: string;
  status: 'ok';
}

@Injectable()
export class AppService {
  /**
   * Retorna informações básicas da aplicação. Serve como endpoint de
   * verificação de saúde (health check) inicial do backend.
   */
  info(): InfoAplicacao {
    return {
      nome: 'Gestão de Frente de Caixa — Stok Center',
      descricao: 'API backend (NestJS)',
      status: 'ok',
    };
  }
}
