import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { primeiroNome } from '../fiscais/fiscais.domain';
import { FeedforwardService, PontoVencido } from './feedforward.service';

const FUSO = 'America/Sao_Paulo';

/**
 * Avisos do Feedforward.
 *
 * Um cron diário (08:00 BRT) busca os pontos a melhorar pendentes que devem ser
 * avisados hoje — no dia em que o prazo vence e, se continuarem pendentes, a
 * cada 7 dias (regra `deveAvisarPonto`) — e avisa quem tem
 * `FEEDFORWARD_VISUALIZAR` que é hora do próximo acompanhamento. Envia **um
 * aviso por colaborador**, reunindo os pontos dele. Um `Set` em memória
 * (resetado à meia-noite) evita reenviar o mesmo aviso no mesmo dia caso o
 * cron rode de novo — mesmo padrão do `ContratosAlertasService`.
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

    // Um aviso por colaborador por dia (reúne todos os pontos dele).
    const porColaborador = new Map<string, PontoVencido[]>();
    for (const v of vencidos) {
      const lista = porColaborador.get(v.colaboradorId) ?? [];
      lista.push(v);
      porColaborador.set(v.colaboradorId, lista);
    }

    const diaISO = hoje.toISOString().slice(0, 10);
    for (const [colaboradorId, pontos] of porColaborador) {
      const chave = `${colaboradorId}:${diaISO}`;
      if (this.avisosEnviados.has(chave)) continue;
      try {
        await this.notificacoes.enviar(destinatarios, {
          titulo: '📌 Feedforward: prazo para acompanhar',
          mensagem: mensagemAviso(pontos),
        });
        this.avisosEnviados.add(chave);
        this.logger.log(
          `Aviso de feedforward enviado: ${chave} (${pontos.length} ponto(s)).`,
        );
      } catch (e) {
        // Defensivo: um aviso com falha não deve derrubar os demais.
        this.logger.warn(`Falha ao enviar aviso de feedforward ${chave}: ${e}`);
      }
    }
  }
}

/** Texto do aviso de um colaborador (um ou vários pontos). */
export function mensagemAviso(pontos: PontoVencido[]): string {
  const nome = primeiroNome(pontos[0].nome);
  const quando = (p: PontoVencido): string =>
    p.diasAtraso === 0 ? 'vence hoje' : `venceu há ${p.diasAtraso} dias`;
  if (pontos.length === 1) {
    const p = pontos[0];
    return p.diasAtraso === 0
      ? `O prazo do feedforward de ${nome} chegou: "${p.descricao}". Faça o próximo acompanhamento.`
      : `O ponto do feedforward de ${nome} continua pendente (${quando(p)}): "${p.descricao}". Revise-o no perfil.`;
  }
  const itens = pontos.map((p) => `"${p.descricao}" (${quando(p)})`).join('; ');
  return `${nome} tem ${pontos.length} pontos de feedforward para acompanhar: ${itens}. Revise-os no perfil.`;
}
