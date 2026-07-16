import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { InsumosService } from './insumos.service';

/**
 * Serviço proativo de insumos — SÓ ALERTAS, nunca cria dados.
 *
 * Nada entra em requisições/estoque sem o gestor solicitar/aprovar. Os crons
 * apenas AVISAM os gestores:
 * 1. Diário (07:00): insumos em nível CRITICO — sugere criar a requisição.
 * 2. Ruptura iminente (12:00): insumos que podem acabar em ≤3 dias.
 * 3. Relatório semanal (segunda 08:00): resumo de consumo.
 *
 * Fuso: America/Sao_Paulo.
 */
@Injectable()
export class InsumosProativoService {
  private readonly logger = new Logger(InsumosProativoService.name);

  constructor(
    private readonly insumos: InsumosService,
    private readonly notificacoes: NotificacoesService,
  ) {}

  /**
   * CRON 1: Alerta de estoque crítico (07:00, antes da abertura). Apenas avisa
   * os gestores — NÃO cria requisição.
   */
  @Cron('0 7 * * *', { timeZone: 'America/Sao_Paulo' })
  async autoReposicao(): Promise<void> {
    const criticos = await this.insumos.insumosParaRepor();
    const apenasUrgentes = criticos.filter((i) => i.nivel === 'CRITICO');

    if (apenasUrgentes.length === 0) {
      this.logger.log('Estoque: nenhum insumo em nível crítico.');
      return;
    }

    // Apenas ALERTA — NÃO cria requisição. Nada entra em requisições/estoque
    // sem o gestor solicitar/aprovar.
    const gestores = await this.notificacoes.destinatariosComPermissao('INSUMOS');
    const linhas = apenasUrgentes.map(
      (i) => `• ${i.nome} (saldo: ${i.saldo} ${i.unidade}s)`,
    );
    await this.notificacoes.enviar(gestores, {
      titulo: '📦 Estoque crítico',
      mensagem: `Estes insumos estão em nível crítico:\n${linhas.join(
        '\n',
      )}\n\nCrie a requisição se precisar repor.`,
    });
    this.logger.log(
      `Alerta de estoque crítico: ${apenasUrgentes.length} insumo(s).`,
    );
  }

  /**
   * CRON 2: Alerta de ruptura iminente (≤3 dias).
   * Roda todo dia às 12:00 (meio do expediente).
   */
  @Cron('0 12 * * *', { timeZone: 'America/Sao_Paulo' })
  async alertaRupturaIminente(): Promise<void> {
    const todos = await this.insumos.listarProativo();
    const iminentes = todos.filter(
      (i) => i.diasAteRuptura !== null && i.diasAteRuptura <= 3,
    );

    if (iminentes.length === 0) return;

    const gestores = await this.notificacoes.destinatariosComPermissao('INSUMOS');
    const linhas = iminentes.map(
      (i) =>
        `• ${i.nome}: ~${i.diasAteRuptura} dia${i.diasAteRuptura === 1 ? '' : 's'} até acabar (saldo: ${i.saldo})`,
    );

    await this.notificacoes.enviar(gestores, {
      titulo: '🚨 Ruptura iminente de insumos',
      mensagem: `Os seguintes insumos podem acabar em breve:\n${linhas.join('\n')}\n\nVerifique o estoque e providencie reposição.`,
    });

    this.logger.warn(
      `Alerta de ruptura: ${iminentes.length} insumo(s) iminente(s).`,
    );
  }

  /**
   * CRON 3: Relatório semanal de consumo (segunda-feira 08:00).
   * Envia resumo da semana anterior aos gestores.
   */
  @Cron('0 8 * * 1', { timeZone: 'America/Sao_Paulo' })
  async relatorioSemanal(): Promise<void> {
    const todos = await this.insumos.listarProativo();
    const gestores = await this.notificacoes.destinatariosComPermissao('INSUMOS');

    const linhas = todos.map((i) => {
      const nivel =
        i.nivel === 'CRITICO' ? '🔴' : i.nivel === 'ATENCAO' ? '🟡' : '🟢';
      return `${nivel} ${i.nome}: consumo ${i.consumoSemana} | entrada ${i.entradaSemana} | saldo ${i.saldo}`;
    });

    await this.notificacoes.enviar(gestores, {
      titulo: '📊 Relatório semanal de insumos',
      mensagem: linhas.join('\n'),
    });
  }
}
