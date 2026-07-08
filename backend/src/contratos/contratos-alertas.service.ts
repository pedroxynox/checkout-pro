import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { primeiroNome } from '../fiscais/fiscais.domain';
import { ContratosService, AlertaDoDia } from './contratos.service';
import { AlertaContrato } from './contratos.domain';

const FUSO = 'America/Sao_Paulo';

/**
 * Alertas inteligentes dos Contratos de experiência.
 *
 * Um cron diário (08:00 BRT) avalia todos os operadores com admissão definida e
 * avisa os gestores quando um marco (45/90 dias) está a <= 5 dias de vencer
 * ("faltam X dias") ou já venceu sem decisão ("decisão em atraso"). Como roda
 * **uma vez por dia**, o contador 5→0 emerge naturalmente; um `Set` em memória
 * (resetado à meia-noite) é a rede de segurança contra reenvio caso o processo
 * reinicie e o cron rode de novo no mesmo dia — mesmo padrão de
 * `FiscaisAlertasService`.
 *
 * O `NotificacoesService` é opcional (ausente em testes unitários), no mesmo
 * padrão dos demais serviços de alerta.
 */
@Injectable()
export class ContratosAlertasService {
  private readonly logger = new Logger(ContratosAlertasService.name);

  /** Marca (colaborador+tipo+marco+dia) já avisada hoje — evita duplicar. */
  private avisosEnviados = new Set<string>();

  constructor(
    private readonly contratos: ContratosService,
    @Optional() private readonly notificacoes?: NotificacoesService,
  ) {}

  /** Reseta o cache de anti-duplicação à meia-noite. */
  @Cron('0 0 * * *', { timeZone: FUSO })
  resetarDiario(): void {
    this.avisosEnviados.clear();
  }

  /** Avalia e envia os alertas de contrato do dia (08:00 BRT). */
  @Cron('0 8 * * *', { timeZone: FUSO })
  async verificarContratos(hoje: Date = new Date()): Promise<void> {
    if (!this.notificacoes) return;
    const alertas = await this.contratos.avaliarAlertasDoDia(hoje);
    if (alertas.length === 0) return;

    const gestores = await this.notificacoes.gestores();
    if (gestores.length === 0) return;

    const diaISO = hoje.toISOString().slice(0, 10);
    for (const item of alertas) {
      const chave = `${item.colaboradorId}:${item.alerta.tipo}:${item.alerta.marco}:${diaISO}`;
      if (this.avisosEnviados.has(chave)) continue;
      const { titulo, mensagem } = montarMensagem(
        primeiroNome(item.nome),
        item.alerta,
      );
      try {
        await this.notificacoes.enviar(gestores, { titulo, mensagem });
        this.avisosEnviados.add(chave);
        this.logger.log(`Alerta de contrato enviado: ${chave}.`);
      } catch (e) {
        // Defensivo: um alerta com falha não deve derrubar os demais.
        this.logger.warn(`Falha ao enviar alerta de contrato ${chave}: ${e}`);
      }
    }
  }
}

/** Rótulo humano do marco (dias). */
function rotuloMarco(marco: AlertaContrato['marco']): string {
  return marco === 'MARCO_45' ? '45 dias' : '90 dias';
}

/** Monta título + mensagem do alerta (VENCIMENTO ou DECISAO_ATRASO). */
function montarMensagem(
  nome: string,
  alerta: AlertaContrato,
): { titulo: string; mensagem: string } {
  const marco = rotuloMarco(alerta.marco);
  if (alerta.tipo === 'DECISAO_ATRASO') {
    const atraso =
      alerta.dias <= 0
        ? 'vence hoje'
        : `venceu há ${alerta.dias} dia${alerta.dias === 1 ? '' : 's'}`;
    return {
      titulo: '⚠️ Decisão de contrato em atraso',
      mensagem: `O contrato de experiência de ${nome} ${atraso} no marco de ${marco} sem decisão. Aprove ou reprove.`,
    };
  }
  const prazo =
    alerta.dias === 0
      ? 'hoje'
      : `em ${alerta.dias} dia${alerta.dias === 1 ? '' : 's'}`;
  return {
    titulo: '⏳ Contrato de experiência vencendo',
    mensagem: `O contrato de experiência de ${nome} completa ${marco} ${prazo} e será efetivado automaticamente. Se pretende encerrar, faça antes.`,
  };
}

// Reexport para os testes do serviço (mantém a montagem de mensagem coesa).
export { montarMensagem as _montarMensagemContrato };
export type { AlertaDoDia };
