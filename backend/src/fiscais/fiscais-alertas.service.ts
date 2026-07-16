import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { FeriadosService } from '../feriados/feriados.service';
import {
  StatusFiscal,
  calcularJornada,
  inicioDoDia,
  isDomingo,
  jornadaEsperadaMs,
  primeiroNome,
} from './fiscais.domain';
import {
  agoraNaBrasilia,
  diaEncerradoEmBrasilia,
  fimDoDiaBrasiliaEmUtc,
} from '../common/datas';

/**
 * Serviço de alertas inteligentes para fiscais.
 *
 * Crons que rodam a cada minuto:
 * 1. Alerta de intervalo longo (>2h01min) → notifica o fiscal e os gestores.
 * 2. Alerta de cobertura mínima (<2 disponíveis) → notifica gestores.
 * 3. Detecção de patrões (semanalmente): intervalo longo recorrente, atrasos.
 * 4. Folga automática por excesso de extras (>7h no mês).
 *
 * Fuso horário: America/Sao_Paulo.
 */
@Injectable()
export class FiscaisAlertasService {
  private readonly logger = new Logger(FiscaisAlertasService.name);

  /** Evita enviar o mesmo alerta de intervalo mais de uma vez por fiscal por dia. */
  private alertasIntervaloEnviados = new Set<string>();
  /** Evita spam de cobertura: só alerta uma vez a cada 30 minutos. */
  private ultimoAlertaCobertura = 0;
  /** Evita alertar folga automática mais de uma vez por fiscal por mês. */
  private alertasFolgaAutomatica = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacoes: NotificacoesService,
    // Feriado conta como domingo: fica de fora do acúmulo de extras "de dia
    // útil". Opcional para não quebrar instanciações sem o serviço.
    @Optional() private readonly feriados?: FeriadosService,
  ) {}

  /** Reseta caches diários à meia-noite. */
  @Cron('0 0 * * *', { timeZone: 'America/Sao_Paulo' })
  resetarDiario(): void {
    this.alertasIntervaloEnviados.clear();
  }

  /** Reseta caches mensais no primeiro dia do mês. */
  @Cron('0 0 1 * *', { timeZone: 'America/Sao_Paulo' })
  resetarMensal(): void {
    this.alertasFolgaAutomatica.clear();
  }

  /**
   * ALERTA 1: Intervalo longo (>2h01min = 121 minutos).
   * Roda a cada minuto. Verifica fiscais em INTERVALO há mais de 2h01min.
   */
  @Cron('* * * * *', { timeZone: 'America/Sao_Paulo' })
  async verificarIntervalosLongos(): Promise<void> {
    const agora = new Date();
    const data = inicioDoDia(agora);

    // Buscar todos os registros de ponto de hoje.
    const registros = await this.prisma.registroPontoFiscal.findMany({
      where: { data },
      orderBy: { em: 'asc' },
    });

    // Agrupar por fiscal.
    const porFiscal = new Map<string, { status: StatusFiscal; em: Date }[]>();
    for (const r of registros) {
      const arr = porFiscal.get(r.fiscalId) ?? [];
      arr.push({ status: r.status as StatusFiscal, em: r.em });
      porFiscal.set(r.fiscalId, arr);
    }

    const LIMITE_INTERVALO_MS = 135 * 60 * 1000; // 2h15min

    for (const [fiscalId, regs] of porFiscal.entries()) {
      if (this.alertasIntervaloEnviados.has(fiscalId)) continue;

      // Verificar se o último status é INTERVALO.
      const ultimo = regs[regs.length - 1];
      if (!ultimo || ultimo.status !== 'INTERVALO') continue;

      // Calcular quanto tempo está em intervalo.
      const tempoIntervalo = agora.getTime() - ultimo.em.getTime();
      if (tempoIntervalo < LIMITE_INTERVALO_MS) continue;

      // Enviar alerta.
      const fiscal = await this.prisma.fiscal.findUnique({
        where: { id: fiscalId },
      });
      if (!fiscal) continue;

      const nome = primeiroNome(fiscal.nome);
      const minutos = Math.floor(tempoIntervalo / 60000);
      const horas = Math.floor(minutos / 60);
      const min = minutos % 60;
      const tempoStr = `${horas}h ${min.toString().padStart(2, '0')}min`;

      // Notificar o próprio fiscal.
      if (fiscal.usuarioId) {
        const usuario = await this.prisma.usuario.findUnique({
          where: { id: fiscal.usuarioId },
        });
        if (usuario) {
          await this.notificacoes.enviar([usuario], {
            titulo: '⚠️ Intervalo longo',
            mensagem: `Você está em intervalo há ${tempoStr}. Lembre-se de retornar ao serviço.`,
          });
        }
      }

      // Notificar a alçada da Central de Jornada (supervisor/gerente/admin).
      const gestores =
        await this.notificacoes.destinatariosComPermissao('CENTRAL_JORNADA');
      await this.notificacoes.enviar(gestores, {
        titulo: '⚠️ Intervalo excedido',
        mensagem: `${nome} está em intervalo há ${tempoStr} (limite: 2h15min).`,
      });

      this.alertasIntervaloEnviados.add(fiscalId);
      this.logger.warn(
        `Alerta de intervalo longo: ${fiscal.nome} (${tempoStr}).`,
      );
    }
  }

  /**
   * ALERTA 2: Cobertura mínima (<2 fiscais disponíveis).
   * Roda a cada minuto. Se cair para 1 fiscal, alerta urgente aos gestores.
   */
  @Cron('* * * * *', { timeZone: 'America/Sao_Paulo' })
  async verificarCobertura(): Promise<void> {
    const agora = new Date();
    const data = inicioDoDia(agora);

    // Só alertar durante horário comercial (06:00 - 23:00).
    const hora = agora.getHours();
    if (hora < 6 || hora >= 23) return;

    // Não alertar mais de uma vez a cada 30 minutos.
    if (agora.getTime() - this.ultimoAlertaCobertura < 30 * 60 * 1000) return;

    // Contar fiscais com último status = DISPONIVEL.
    const registros = await this.prisma.registroPontoFiscal.findMany({
      where: { data },
      orderBy: { em: 'asc' },
    });

    // Sem NENHUM registro de ponto no dia, ninguém iniciou o expediente — a
    // seção de fiscais pode nem estar em uso ainda. Não faz sentido alertar
    // "cobertura insuficiente" quando não há operação a cobrir: isso gerava um
    // falso alarme recorrente. Assim que os fiscais começarem a bater ponto, o
    // monitoramento volta a valer automaticamente (sem precisar religar nada).
    if (registros.length === 0) return;

    const ultimoStatus = new Map<string, StatusFiscal>();
    for (const r of registros) {
      ultimoStatus.set(r.fiscalId, r.status as StatusFiscal);
    }

    const disponiveis = [...ultimoStatus.values()].filter(
      (s) => s === 'DISPONIVEL',
    ).length;

    if (disponiveis >= 2) return; // OK

    if (disponiveis <= 1) {
      const gestores =
        await this.notificacoes.destinatariosComPermissao('ESCALA_EDITAR');
      const urgencia = disponiveis === 0 ? '🚨 URGENTE' : '⚠️ Atenção';
      await this.notificacoes.enviar(gestores, {
        titulo: `${urgencia}: Cobertura insuficiente`,
        mensagem:
          disponiveis === 0
            ? 'Nenhum fiscal disponível no momento! Ação imediata necessária.'
            : 'Apenas 1 fiscal disponível. Cobertura mínima (2) não atingida.',
      });
      this.ultimoAlertaCobertura = agora.getTime();
      this.logger.warn(
        `Alerta de cobertura: ${disponiveis} fiscal(is) disponível(is).`,
      );
    }
  }

  /**
   * ALERTA 3: Folga automática por excesso de horas extras (>7h no mês).
   * Roda uma vez por dia às 22:00 (após encerramento dos turnos).
   */
  @Cron('0 22 * * *', { timeZone: 'America/Sao_Paulo' })
  async verificarExtrasExcessivas(): Promise<void> {
    const agoraReal = new Date();
    const agoraPonto = agoraNaBrasilia();
    const inicioMes = new Date(
      Date.UTC(agoraPonto.getUTCFullYear(), agoraPonto.getUTCMonth(), 1),
    );
    const fimMes = new Date(
      Date.UTC(agoraPonto.getUTCFullYear(), agoraPonto.getUTCMonth() + 1, 1),
    );

    const LIMITE_EXTRAS_MS = 7 * 60 * 60 * 1000; // 7 horas

    // Feriados do mês (fonte única, igual à Central/Jornada da Equipe): feriado
    // conta como domingo e fica fora deste acúmulo.
    const feriadoSet = this.feriados
      ? new Set((await this.feriados.mapaNoPeriodo(inicioMes, fimMes)).keys())
      : new Set<number>();

    const fiscais = await this.prisma.fiscal.findMany();
    const registros = await this.prisma.registroPontoFiscal.findMany({
      where: { data: { gte: inicioMes, lt: fimMes } },
      orderBy: { em: 'asc' },
    });

    // Agrupar por fiscal e dia.
    const porFiscalDia = new Map<
      string,
      Map<string, { status: StatusFiscal; em: Date }[]>
    >();
    for (const r of registros) {
      const diaKey = r.data.toISOString();
      if (!porFiscalDia.has(r.fiscalId)) {
        porFiscalDia.set(r.fiscalId, new Map());
      }
      const mapa = porFiscalDia.get(r.fiscalId)!;
      if (!mapa.has(diaKey)) mapa.set(diaKey, []);
      mapa.get(diaKey)!.push({ status: r.status as StatusFiscal, em: r.em });
    }

    for (const fiscal of fiscais) {
      if (this.alertasFolgaAutomatica.has(fiscal.id)) continue;

      const mapaFiscal = porFiscalDia.get(fiscal.id);
      if (!mapaFiscal) continue;

      let totalExtrasMs = 0;
      for (const [diaKey, regs] of mapaFiscal.entries()) {
        const diaDate = new Date(diaKey);
        const diaSemana = diaDate.getUTCDay();
        if (isDomingo(diaSemana) || feriadoSet.has(diaDate.getTime())) continue;

        const diaEncerrado = diaEncerradoEmBrasilia(diaDate, agoraPonto);
        const limite = diaEncerrado
          ? fimDoDiaBrasiliaEmUtc(diaDate)
          : agoraReal;
        const jornada = calcularJornada(regs, limite, diaEncerrado);
        const esperado = jornadaEsperadaMs(diaSemana);
        const extra = jornada.cargaHorariaMs - esperado;
        if (extra > 0) totalExtrasMs += extra;
      }

      if (totalExtrasMs <= LIMITE_EXTRAS_MS) continue;

      // Enviar notificação sugerindo folga.
      const nome = primeiroNome(fiscal.nome);
      const horasExtras = Math.floor(totalExtrasMs / 3600000);
      const minExtras = Math.floor((totalExtrasMs % 3600000) / 60000);

      if (fiscal.usuarioId) {
        const usuario = await this.prisma.usuario.findUnique({
          where: { id: fiscal.usuarioId },
        });
        if (usuario) {
          await this.notificacoes.enviar([usuario], {
            titulo: '🎉 Dia de folga sugerido!',
            mensagem: `Você acumulou ${horasExtras}h${minExtras > 0 ? ` ${minExtras}min` : ''} extras neste mês. Converse com seu gestor para agendar um dia de descanso.`,
          });
        }
      }

      const gestores =
        await this.notificacoes.destinatariosComPermissao('CENTRAL_JORNADA');
      await this.notificacoes.enviar(gestores, {
        titulo: '📋 Folga sugerida por excesso de extras',
        mensagem: `${nome} acumulou ${horasExtras}h${minExtras > 0 ? `${minExtras}min` : ''} extras no mês. Considere conceder um dia livre para compensação.`,
      });

      this.alertasFolgaAutomatica.add(fiscal.id);
      this.logger.log(
        `Folga sugerida para ${fiscal.nome}: ${horasExtras}h${minExtras}min extras.`,
      );
    }
  }

  /**
   * ALERTA 4: Alertas inteligentes por padrão.
   * Roda toda segunda-feira às 08:00 — analisa a semana anterior.
   * Detecta: intervalos longos recorrentes e atrasos frequentes.
   */
  @Cron('0 8 * * 1', { timeZone: 'America/Sao_Paulo' })
  async analisarPadroes(): Promise<void> {
    const agora = new Date();
    const inicioSemana = new Date(agora);
    inicioSemana.setDate(inicioSemana.getDate() - 7);
    const fimSemana = inicioDoDia(agora);

    const fiscais = await this.prisma.fiscal.findMany();
    const registros = await this.prisma.registroPontoFiscal.findMany({
      where: { data: { gte: inicioDoDia(inicioSemana), lt: fimSemana } },
      orderBy: { em: 'asc' },
    });

    const escalas = await this.prisma.escalaEntry.findMany();
    const escalaMap = new Map<string, Map<number, string>>(); // fiscalId -> diaSemana -> entrada
    for (const e of escalas) {
      if (!e.entrada || e.folga) continue;
      if (!escalaMap.has(e.funcionarioId))
        escalaMap.set(e.funcionarioId, new Map());
      escalaMap.get(e.funcionarioId)!.set(e.diaSemana, e.entrada);
    }

    // Agrupar registros por fiscal e dia.
    const porFiscalDia = new Map<
      string,
      Map<string, { status: StatusFiscal; em: Date }[]>
    >();
    for (const r of registros) {
      const diaKey = r.data.toISOString();
      if (!porFiscalDia.has(r.fiscalId))
        porFiscalDia.set(r.fiscalId, new Map());
      const m = porFiscalDia.get(r.fiscalId)!;
      if (!m.has(diaKey)) m.set(diaKey, []);
      m.get(diaKey)!.push({ status: r.status as StatusFiscal, em: r.em });
    }

    const alertas: string[] = [];

    for (const fiscal of fiscais) {
      const mapaFiscal = porFiscalDia.get(fiscal.id);
      if (!mapaFiscal) continue;

      let diasComIntervaloLongo = 0;
      let diasComAtraso = 0;
      const escalaFiscal = escalaMap.get(fiscal.id);

      for (const [diaKey, regs] of mapaFiscal.entries()) {
        const diaDate = new Date(diaKey);
        const diaSemana = diaDate.getUTCDay();

        // Verificar intervalo longo (>2h).
        const jornada = calcularJornada(
          regs,
          new Date(diaDate.getTime() + 24 * 60 * 60 * 1000),
          true,
        );
        if (jornada.tempoIntervaloMs > 120 * 60 * 1000) {
          diasComIntervaloLongo++;
        }

        // Verificar atraso (primeiro DISPONIVEL > entrada + 15min).
        if (escalaFiscal) {
          const entradaPrevista = escalaFiscal.get(diaSemana);
          if (entradaPrevista && regs.length > 0) {
            const primeiro = regs[0];
            if (primeiro.status === 'DISPONIVEL') {
              const [h, m] = entradaPrevista.split(':').map(Number);
              const previstoDate = new Date(diaDate);
              previstoDate.setUTCHours(h, m + 15, 0, 0); // 15min de tolerância
              if (primeiro.em > previstoDate) {
                diasComAtraso++;
              }
            }
          }
        }
      }

      const nome = primeiroNome(fiscal.nome);
      if (diasComIntervaloLongo >= 3) {
        alertas.push(
          `${nome}: intervalo >2h em ${diasComIntervaloLongo} dias na semana passada.`,
        );
      }
      if (diasComAtraso >= 3) {
        alertas.push(
          `${nome}: atraso (>15min) em ${diasComAtraso} dias na semana passada.`,
        );
      }
    }

    if (alertas.length > 0) {
      const gestores =
        await this.notificacoes.destinatariosComPermissao('FISCAIS_STATUS');
      await this.notificacoes.enviar(gestores, {
        titulo: '📊 Padrões detectados (semana anterior)',
        mensagem: alertas.join('\n'),
      });
      this.logger.log(`Padrões detectados: ${alertas.length} alertas.`);
    }
  }
}
