import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { Notificacao } from '@prisma/client';
import { RELOGIO, Relogio } from '../common/relogio';
import { ChecklistService } from '../checklist/checklist.service';
import { TipoChecklist } from '../checklist/checklist.domain';
import { ImportacoesService } from '../importacoes/importacoes.service';
import { TipoArquivo } from '../importacoes/importacoes.domain';
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
    private readonly importacoesService: ImportacoesService,
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

  /** Job de alerta do checklist de abertura no horário-limite (08:55). */
  @Cron('55 8 * * *', {
    name: 'alerta-checklist-abertura',
    timeZone: FUSO_BRASILIA,
  })
  async alertaChecklistAbertura(): Promise<boolean> {
    return this.dispararAlertaChecklist('ABERTURA');
  }

  /** Job de alerta do checklist de fechamento no horário-limite (13:55). */
  @Cron('55 13 * * *', {
    name: 'alerta-checklist-fechamento',
    timeZone: FUSO_BRASILIA,
  })
  async alertaChecklistFechamento(): Promise<boolean> {
    return this.dispararAlertaChecklist('FECHAMENTO');
  }

  /**
   * Dispara o alerta de checklist pendente (Req 5.3.1–5.3.4): se, no instante
   * atual (relógio injetável), o horário-limite foi atingido e o checklist do
   * dia ainda está pendente, notifica a união dos fiscais online com o login
   * gerencial. Retorna `true` quando o alerta foi disparado.
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
    await this.notificacoesService.notificarAlertaChecklist({
      titulo: `Checklist de ${rotulo} pendente`,
      mensagem: `O checklist de ${rotulo} ainda não foi concluído. Conclua-o o quanto antes.`,
    });
    this.logger.warn(`Alerta de checklist de ${rotulo} disparado.`);
    return true;
  }

  /**
   * Dispara o alerta de arquivos de importação pendentes no fim do dia
   * (Req 1.4.1): se houver tipos pendentes no dia atual, notifica o login
   * gerencial. Retorna a lista de tipos pendentes que originou a notificação
   * (vazia quando nada está pendente).
   */
  async dispararAlertaImportacoesPendentes(): Promise<TipoArquivo[]> {
    const agora = this.relogio.agora();
    const pendentes =
      await this.importacoesService.verificarPendentesFimDoDia(agora);
    if (pendentes.length === 0) {
      return [];
    }
    const gerenciais = await this.notificacoesService.loginGerencial();
    await this.notificacoesService.enviar(gerenciais, {
      titulo: 'Importações pendentes',
      mensagem: `Há arquivos pendentes de importação hoje: ${pendentes.join(
        ', ',
      )}.`,
    });
    this.logger.warn(
      `Alerta de importações pendentes disparado: ${pendentes.join(', ')}.`,
    );
    return pendentes;
  }

  /** Notificações geradas pelo último alerta — utilitário para testes/depuração. */
  async historicoNotificacoes(usuarioId: string): Promise<Notificacao[]> {
    return this.notificacoesService.historico(usuarioId);
  }
}
