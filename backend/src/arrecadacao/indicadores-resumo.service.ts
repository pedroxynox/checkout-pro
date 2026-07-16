import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { ArrecadacaoService } from './arrecadacao.service';
import { IndicadoresInteligenteService } from './indicadores-inteligente.service';
import {
  CONFIG_ARRECADACAO,
  TIPOS_ARRECADACAO,
  TipoArrecadacao,
} from './arrecadacao.domain';

/**
 * Resumo diário automático dos indicadores. Todo dia às 08:00 (Brasília),
 * envia aos gestores um panorama do dia anterior: status (verde/amarelo/
 * vermelho) de cada indicador, operador do mês e eventuais anomalias.
 */
@Injectable()
export class IndicadoresResumoService {
  private readonly logger = new Logger(IndicadoresResumoService.name);

  constructor(
    private readonly arrecadacao: ArrecadacaoService,
    private readonly inteligente: IndicadoresInteligenteService,
    private readonly notificacoes: NotificacoesService,
  ) {}

  /** Avalia o emoji de semáforo do indicador no acumulado do mês. */
  private semaforo(
    tipo: TipoArrecadacao,
    valorMes: number,
    metaMes: number,
    pctMes: number | undefined,
  ): string {
    const config = CONFIG_ARRECADACAO[tipo];
    if (config.sentido === 'MENOR_MELHOR') {
      const v = pctMes ?? 0;
      if (v <= metaMes) return '🟢';
      if (v <= metaMes * 1.5) return '🟡';
      return '🔴';
    }
    // MAIOR_MELHOR
    if (valorMes >= metaMes) return '🟢';
    if (valorMes >= metaMes * 0.75) return '🟡';
    return '🔴';
  }

  /** Cron diário às 08:00 — resumo do estado dos indicadores. */
  @Cron('0 8 * * *', { timeZone: 'America/Sao_Paulo' })
  async resumoDiario(): Promise<void> {
    try {
      const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const linhas: string[] = [];

      for (const tipo of TIPOS_ARRECADACAO) {
        const resumo = await this.arrecadacao.resumo(tipo, ontem);
        const config = CONFIG_ARRECADACAO[tipo];
        const emoji = this.semaforo(
          tipo,
          resumo.totalMes,
          resumo.meta,
          resumo.percentualMes,
        );
        if (config.base === 'VENDAS') {
          linhas.push(
            `${emoji} ${resumo.titulo}: ${resumo.percentualMes ?? 0}% (meta ≤${resumo.meta}%)`,
          );
        } else {
          linhas.push(
            `${emoji} ${resumo.titulo}: R$${resumo.totalMes} no mês (meta R$${resumo.meta})`,
          );
        }
      }

      // Destaques do mês (Top 3 por categoria).
      const destaques = await this.inteligente.destaquesMes(ontem);
      if (destaques.trocoSolidario) {
        linhas.push(
          `\n🏆 Troco solidário: ${destaques.trocoSolidario.nome} (R$${destaques.trocoSolidario.total})`,
        );
      }
      if (destaques.recargas) {
        linhas.push(
          `🏆 Recargas: ${destaques.recargas.nome} (R$${destaques.recargas.total})`,
        );
      }
      if (destaques.cancelamentoItens) {
        linhas.push(
          `⚠️ Mais cancelou itens: ${destaques.cancelamentoItens.nome} (R$${destaques.cancelamentoItens.total})`,
        );
      }
      if (destaques.menosCancelou) {
        const txt =
          destaques.menosCancelou.total > 0
            ? `R$${destaques.menosCancelou.total}`
            : 'sem cancelamentos';
        linhas.push(
          `✅ Menos cancelou: ${destaques.menosCancelou.nome} (${txt})`,
        );
      }

      // Anomalias.
      const anomalias = await this.inteligente.anomalias(ontem);
      if (anomalias.length > 0) {
        linhas.push('\n⚠️ Atenção (acima da média):');
        for (const a of anomalias) {
          linhas.push(
            `  • ${a.nome} — ${CONFIG_ARRECADACAO[a.tipo].titulo}: R$${a.total} (média R$${a.media})`,
          );
        }
      }

      const gestores = await this.notificacoes.destinatariosComPermissao('INDICADORES_VISUALIZAR');
      await this.notificacoes.enviar(gestores, {
        titulo: '📊 Resumo de indicadores',
        mensagem: linhas.join('\n'),
      });
      this.logger.log('Resumo diário de indicadores enviado aos gestores.');
    } catch (erro) {
      this.logger.warn(`Falha ao gerar resumo diário: ${String(erro)}`);
    }
  }
}
