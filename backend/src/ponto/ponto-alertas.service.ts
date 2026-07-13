import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { inicioDoDia } from '../common/datas';
import { PontoService } from './ponto.service';

/**
 * Alertas do Registro de Ponto — Fase A.
 *
 * A cada minuto verifica os fiscais que ainda estão trabalhando hoje e:
 * - quando as horas extras chegam a 1h45 (ainda trabalhando), envia um aviso
 *   **a todos os fiscais** de que a pessoa vai exceder o horário diário — o
 *   aviso repete a cada minuto enquanto o alerta estiver ativo (o fiscal pode
 *   continuar batendo/carregando o papelito);
 * - quando o dia é classificado como **TAC** (Termo de Ajustamento de Conduta:
 *   extras acima de 1h50, ou intervalo menor que 1h ou maior que 3h), notifica
 *   **todos os usuários** — uma única vez por dia por colaborador.
 *
 * A decisão (limiar/TAC) vem do domínio (`ponto.domain`), via `PontoService`,
 * de modo que o alerta e o painel usem exatamente a mesma regra.
 */
@Injectable()
export class PontoAlertasService {
  private readonly logger = new Logger(PontoAlertasService.name);

  /** Colaboradores já avisados de TAC hoje (evita repetir). Reseta à meia-noite. */
  private tacAvisados = new Set<string>();
  private diaAtual = new Date().toDateString();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacoes: NotificacoesService,
    private readonly ponto: PontoService,
  ) {}

  /** Reseta os avisos de TAC a cada dia. */
  @Cron('0 0 * * *', { timeZone: 'America/Sao_Paulo' })
  resetarDiario(): void {
    this.tacAvisados.clear();
    this.diaAtual = new Date().toDateString();
  }

  /** Verifica a cada minuto quem está perto/acima do limite diário. */
  @Cron('* * * * *', { timeZone: 'America/Sao_Paulo' })
  async verificar(): Promise<void> {
    // Fallback caso o cron da meia-noite não tenha rodado.
    const hoje = new Date().toDateString();
    if (hoje !== this.diaAtual) {
      this.tacAvisados.clear();
      this.diaAtual = hoje;
    }

    const dia = inicioDoDia(new Date());
    // Fiscais com batidas hoje (candidatos a estar trabalhando).
    const grupos = await this.prisma.batidaPonto.groupBy({
      by: ['pessoaId'],
      where: { data: dia, tipoPessoa: 'FISCAL' },
    });
    if (grupos.length === 0) return;

    const ids = grupos.map((g) => g.pessoaId);
    const fiscais = await this.prisma.fiscal.findMany({
      where: { id: { in: ids } },
    });
    const nomePorId = new Map(fiscais.map((f) => [f.id, f.nome]));

    for (const { pessoaId } of grupos) {
      const { jornada } = await this.ponto.jornadaDoDia(
        pessoaId,
        'FISCAL',
        dia,
      );
      const nome = nomePorId.get(pessoaId) ?? 'Colaborador';

      // Aviso "vai exceder" — repete a cada minuto enquanto ativo.
      if (jornada.alertaIminente) {
        await this.notificarFiscais({
          titulo: '⏰ Jornada perto do limite',
          mensagem: `${nome} está prestes a exceder o horário diário permitido (já passou de 1h45 de horas extras).`,
        });
      }

      // TAC — uma vez por colaborador por dia.
      if (jornada.tac && !this.tacAvisados.has(pessoaId)) {
        this.tacAvisados.add(pessoaId);
        await this.notificacoes.notificarTodos({
          titulo: '⚠️ TAC — Termo de Ajustamento de Conduta',
          mensagem: `${nome}: ${jornada.motivosTac.join('; ')}.`,
        });
        this.logger.log(
          `TAC registrado para ${nome}: ${jornada.motivosTac.join('; ')}.`,
        );
      }
    }
  }

  /** Envia um aviso a todos os usuários com perfil FISCAL. */
  private async notificarFiscais(conteudo: {
    titulo: string;
    mensagem: string;
  }): Promise<void> {
    const fiscais = await this.prisma.usuario.findMany({
      where: { perfil: 'FISCAL' },
    });
    if (fiscais.length === 0) return;
    await this.notificacoes.enviar(fiscais, conteudo);
  }
}
