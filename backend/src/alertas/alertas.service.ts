import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { Notificacao } from '@prisma/client';
import { RELOGIO, Relogio } from '../common/relogio';
import { ChecklistService } from '../checklist/checklist.service';
import { TipoChecklist } from '../checklist/checklist.domain';
import { ArrecadacaoService } from '../arrecadacao/arrecadacao.service';
import { FechamentoService } from '../fechamento/fechamento.service';
import {
  CONFIG_ARRECADACAO,
  TIPOS_ARRECADACAO,
  TipoArrecadacao,
} from '../arrecadacao/arrecadacao.domain';
import { NotificacoesService } from '../notificacoes/notificacoes.service';

/** Nome do job dinâmico de importações pendentes (registrado no scheduler). */
const JOB_IMPORTACOES_PENDENTES = 'alerta-importacoes-pendentes';

/**
 * Fuso horário de operação da loja (Brasília, UTC−3). Os jobs agendados devem
 * disparar no horário **local de Brasília** (08:55, 13:55 e fim do dia), e não
 * no horário do servidor (UTC), que está 3 horas adiante.
 */
const FUSO_BRASILIA = 'America/Sao_Paulo';

/**
 * Monta a expressão cron diária (minuto hora * * *) a partir de um horário
 * "HH:mm". Função pura, testável de forma isolada (Req 1.4.2).
 */
export function expressaoCronDiaria(horario: string): string {
  const [hora, minuto] = horario.split(':').map((p) => Number(p));
  return `${minuto} ${hora} * * *`;
}

/**
 * Serviço de alertas agendados (Tarefa 15, Req 1.4.1, 1.4.2, 5.3.1–5.3.4).
 *
 * Usa `@nestjs/schedule` para disparar:
 * - alertas de checklist pendente nos horários-limite (08:55 abertura, 13:55
 *   fechamento), notificando a união dos fiscais online com o login gerencial;
 * - alerta de arquivos de importação pendentes no horário de fim do dia
 *   configurável (`HORARIO_FIM_DO_DIA`), notificando o login gerencial.
 *
 * A obtenção do "agora" é feita por um relógio injetável (`Relogio`), o que
 * torna a lógica testável de forma determinística (Tarefa 15.2). Os métodos
 * `disparar*` contêm a lógica e são chamados tanto pelos jobs agendados quanto
 * pelos testes com relógio fixo.
 */
@Injectable()
export class AlertasService implements OnModuleInit {
  private readonly logger = new Logger(AlertasService.name);

  constructor(
    private readonly checklistService: ChecklistService,
    private readonly arrecadacaoService: ArrecadacaoService,
    private readonly fechamentoService: FechamentoService,
    private readonly notificacoesService: NotificacoesService,
    private readonly config: ConfigService,
    private readonly scheduler: SchedulerRegistry,
    @Inject(RELOGIO) private readonly relogio: Relogio,
  ) {}

  /**
   * Registra dinamicamente o job de importações pendentes no horário de fim do
   * dia configurável (`HORARIO_FIM_DO_DIA`, padrão 18:00), pois o horário não é
   * conhecido em tempo de compilação (Req 1.4.2).
   */
  onModuleInit(): void {
    const horario = this.config.get<string>('HORARIO_FIM_DO_DIA') ?? '18:00';
    const expressao = expressaoCronDiaria(horario);

    if (this.scheduler.doesExist('cron', JOB_IMPORTACOES_PENDENTES)) {
      return;
    }
    const job = new CronJob(
      expressao,
      () => {
        void this.dispararAlertaImportacoesPendentes();
      },
      null,
      false,
      FUSO_BRASILIA,
    );
    this.scheduler.addCronJob(JOB_IMPORTACOES_PENDENTES, job as never);
    job.start();
    this.logger.log(
      `Alerta de importações pendentes agendado para ${horario} (${expressao}, ${FUSO_BRASILIA}).`,
    );
  }

  /** Lembrete de início do checklist de abertura (08:10 — 5 min antes). */
  @Cron('10 8 * * *', {
    name: 'lembrete-checklist-abertura',
    timeZone: FUSO_BRASILIA,
  })
  async lembreteChecklistAbertura(): Promise<boolean> {
    return this.dispararLembreteInicio('ABERTURA');
  }

  /** Lembrete de início do checklist de fechamento (13:10 — 5 min antes). */
  @Cron('10 13 * * *', {
    name: 'lembrete-checklist-fechamento',
    timeZone: FUSO_BRASILIA,
  })
  async lembreteChecklistFechamento(): Promise<boolean> {
    return this.dispararLembreteInicio('FECHAMENTO');
  }

  /** Alerta do checklist de abertura pendente (09:00 — 15 min antes do limite). */
  @Cron('0 9 * * *', {
    name: 'alerta-checklist-abertura',
    timeZone: FUSO_BRASILIA,
  })
  async alertaChecklistAbertura(): Promise<boolean> {
    return this.dispararAlertaChecklist('ABERTURA');
  }

  /** Alerta do checklist de fechamento pendente (14:00 — 15 min antes do limite). */
  @Cron('0 14 * * *', {
    name: 'alerta-checklist-fechamento',
    timeZone: FUSO_BRASILIA,
  })
  async alertaChecklistFechamento(): Promise<boolean> {
    return this.dispararAlertaChecklist('FECHAMENTO');
  }

  /**
   * Lembrete de fim de expediente (22:20): avisa a todos que os arquivos do dia
   * precisam ser carregados para concluir o fechamento.
   */
  @Cron('20 22 * * *', {
    name: 'lembrete-fechamento-arquivos',
    timeZone: FUSO_BRASILIA,
  })
  async lembreteFechamentoArquivos(): Promise<boolean> {
    return this.dispararLembreteFechamentoArquivos();
  }

  /**
   * Lembrete de início (Req: 5 min antes da janela abrir): se o checklist ainda
   * está pendente, avisa para realizá-lo. Retorna `true` quando disparado.
   */
  async dispararLembreteInicio(tipo: TipoChecklist): Promise<boolean> {
    const agora = this.relogio.agora();
    const deveLembrar = await this.checklistService.verificarLembreteInicio(
      tipo,
      agora,
    );
    if (!deveLembrar) {
      return false;
    }
    const rotulo = tipo === 'ABERTURA' ? 'abertura' : 'fechamento';
    const janelaIni = tipo === 'ABERTURA' ? '08:15' : '13:15';
    await this.notificacoesService.notificarAlertaChecklist({
      titulo: `Checklist de ${rotulo} em breve`,
      mensagem: `O checklist de ${rotulo} começa às ${janelaIni} (em ~5 min). Não esqueça de enviar o print.`,
    });
    this.logger.log(`Lembrete de início do checklist de ${rotulo} disparado.`);
    return true;
  }

  /**
   * Dispara o alerta de checklist pendente (15 min antes do limite): se ainda
   * está pendente, notifica a união dos fiscais online com o login gerencial.
   * Retorna `true` quando o alerta foi disparado.
   */
  async dispararAlertaChecklist(tipo: TipoChecklist): Promise<boolean> {
    const agora = this.relogio.agora();
    const deveAlertar = await this.checklistService.verificarAlerta(
      tipo,
      agora,
    );
    if (!deveAlertar) {
      return false;
    }
    const rotulo = tipo === 'ABERTURA' ? 'abertura' : 'fechamento';
    const limite = tipo === 'ABERTURA' ? '09:15' : '14:15';
    await this.notificacoesService.notificarAlertaChecklist({
      titulo: `Checklist de ${rotulo} pendente`,
      mensagem: `O checklist de ${rotulo} ainda não foi concluído. Faltam ~15 min para o limite (${limite}). Envie o print o quanto antes.`,
    });
    this.logger.warn(`Alerta de checklist de ${rotulo} disparado.`);
    return true;
  }

  /**
   * Dispara o alerta de arquivos pendentes no fim do dia (Req 1.4.1).
   *
   * MIGRAÇÃO (manutenção): antes este alerta lia a tabela do fluxo ANTIGO de
   * importação (CSV/XLSX), que hoje não é mais alimentada — o que tornava o
   * alerta obsoleto. Agora ele usa o fluxo ATUAL de arrecadação
   * (`ArrecadacaoService.status`): pendente = tipo que ainda não foi enviado
   * nem marcado como "sem movimento" no dia. Se houver pendentes, notifica o
   * login gerencial. Retorna a lista de tipos pendentes (vazia quando nada
   * está pendente).
   */
  async dispararAlertaImportacoesPendentes(): Promise<TipoArrecadacao[]> {
    const agora = this.relogio.agora();
    const status = await this.arrecadacaoService.status(agora);
    const pendentes = TIPOS_ARRECADACAO.filter(
      (tipo) => status[tipo] === 'PENDENTE',
    );
    if (pendentes.length === 0) {
      return [];
    }
    const gerenciais = await this.notificacoesService.loginGerencial();
    const titulos = pendentes.map((tipo) => CONFIG_ARRECADACAO[tipo].titulo);
    await this.notificacoesService.enviar(gerenciais, {
      titulo: 'Importações pendentes',
      mensagem: `Há indicadores pendentes de importação hoje: ${titulos.join(
        ', ',
      )}.`,
    });
    this.logger.warn(
      `Alerta de importações pendentes disparado: ${pendentes.join(', ')}.`,
    );
    return pendentes;
  }

  /**
   * Lembrete das 22:20 para concluir o fechamento do dia. Se o fechamento ainda
   * NÃO está completo (falta enviar arrecadações e/ou vendas), avisa todos os
   * perfis operacionais para carregarem os arquivos do dia. Se o fechamento já
   * foi concluído, não incomoda ninguém. Retorna `true` quando o lembrete foi
   * disparado.
   */
  async dispararLembreteFechamentoArquivos(): Promise<boolean> {
    const agora = this.relogio.agora();
    const completo = await this.fechamentoService.estaCompleto(agora);
    if (completo) {
      return false;
    }
    const destinatarios = await this.notificacoesService.destinatariosGerais();
    await this.notificacoesService.enviar(destinatarios, {
      titulo: 'Fechamento pendente',
      mensagem:
        'Não esqueça de carregar os arquivos do dia (arrecadações e vendas) ' +
        'para concluir o fechamento.',
    });
    this.logger.warn('Lembrete de fechamento (22:20) disparado.');
    return true;
  }

  /** Notificações geradas pelo último alerta — utilitário para testes/depuração. */
  async historicoNotificacoes(usuarioId: string): Promise<Notificacao[]> {
    return this.notificacoesService.historico(usuarioId);
  }
}
