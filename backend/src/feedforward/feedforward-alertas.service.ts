import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { primeiroNome } from '../fiscais/fiscais.domain';
import { FeedforwardService } from './feedforward.service';

const FUSO = 'America/Sao_Paulo';

/**
 * Avisos do Feedforward.
 *
 * Um cron diário (08:00 BRT) busca os pontos a melhorar cujo prazo venceu (hoje
 * ou antes) e que ainda estão pendentes, e avisa **supervisores e gerentes**
 * que é hora do próximo acompanhamento. Um `Set` em memória (resetado à
 * meia-noite) evita reenviar o mesmo aviso no mesmo dia caso o processo
 * reinicie — mesmo padrão do `ContratosAlertasService`.
 *
 * O `NotificacoesService` é opcional (ausente em testes unitários).
 */
@Injectable()
export class FeedforwardAlertasService {
  private readonly logger = new Logger(FeedforwardAlertasService.name);

  /** Marca (ponto + dia) já avisada hoje — evita duplicar. */
  private avisosEnviados = new Set<string>();

  constructor(
    private readonly feedforward: FeedforwardService,
    @Optional() private readonly notificacoes?: NotificacoesService,
  ) {}

  /** Reseta o cache de anti-duplicação à meia-noite. */
  @Cron('0 0 * * *', { timeZone: FUSO })
  resetarDiario(): void {
    this.avisosEnviados.clear();
  }

  /** Avalia e envia os avisos de prazos vencidos do dia (08:00 BRT). */
  @Cron('0 8 * * *', { timeZone: FUSO })
  async verificarPrazos(hoje: Date = new Date()): Promise<void> {
    if (!this.notificacoes) return;
    const vencidos = await this.feedforward.pontosVencidosDoDia(hoje);
    if (vencidos.length === 0) return;

    const destinatarios =
      await this.notificacoes.destinatariosComPermissao('FEEDFORWARD_VISUALIZAR');
    if (destinatarios.length === 0) return;

    const diaISO = hoje.toISOString().slice(0, 10);
    for (const v of vencidos) {
      const chave = `${v.pontoId}:${diaISO}`;
      if (this.avisosEnviados.has(chave)) continue;
      try {
        await this.notificacoes.enviar(destinatarios, {
          titulo: '📌 Feedforward: prazo para acompanhar',
          mensagem: `O prazo do feedforward de ${primeiroNome(v.nome)} chegou: "${v.descricao}". Faça o próximo acompanhamento.`,
        });
        this.avisosEnviados.add(chave);
        this.logger.log(`Aviso de feedforward enviado: ${chave}.`);
      } catch (e) {
        // Defensivo: um aviso com falha não deve derrubar os demais.
        this.logger.warn(`Falha ao enviar aviso de feedforward ${chave}: ${e}`);
      }
    }
  }
}
