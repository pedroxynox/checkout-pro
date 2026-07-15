import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { inicioDoDia } from '../common/datas';
import { PontoService } from './ponto.service';

/**
 * Verificador periódico dos riscos de TAC.
 *
 * A cada minuto recalcula a jornada das pessoas que bateram ponto no dia e
 * delega ao PontoService o aviso das etapas 1h30, 1h40 e TAC. A deduplicação
 * é persistente (tabela `AlertaTacEnviado`) e compartilhada com o registro da
 * batida, portanto cron e batida nunca geram duas mensagens da mesma etapa —
 * nem mesmo após um reinício do servidor ou com múltiplas instâncias.
 */
@Injectable()
export class PontoAlertasService {
  private readonly logger = new Logger(PontoAlertasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ponto: PontoService,
  ) {}

  /** Verifica a cada minuto quem atingiu uma nova etapa de risco/TAC. */
  @Cron('* * * * *', { timeZone: 'America/Sao_Paulo' })
  async verificar(): Promise<void> {
    const dia = inicioDoDia(new Date());
    const grupos = await this.prisma.batidaPonto.groupBy({
      by: ['pessoaId', 'tipoPessoa'],
      where: { data: dia },
    });

    for (const { pessoaId, tipoPessoa } of grupos) {
      if (tipoPessoa !== 'FISCAL' && tipoPessoa !== 'OPERADOR') continue;
      try {
        const resposta = await this.ponto.jornadaDoDia(
          pessoaId,
          tipoPessoa,
          dia,
        );
        await this.ponto.avisarAlertaTacSeNecessario(
          pessoaId,
          tipoPessoa,
          dia,
          resposta,
        );
      } catch {
        // Uma pessoa com dados inconsistentes não impede verificar as demais.
        this.logger.warn(`Falha ao verificar alerta de TAC para ${pessoaId}.`);
      }
    }
  }
}
