import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { agoraNaBrasilia, inicioDoDia } from '../common/datas';
import { FiscaisService, EscaladoDia } from '../fiscais/fiscais.service';
import { OperadoresService } from '../operadores/operadores.service';
import { IncidenciasService } from '../incidencias/incidencias.service';
import { IncidenciaDuplicadaError } from '../incidencias/incidencias.errors';
import { AusenciaDuplicadaError } from '../operadores/operadores.errors';
import { PontoService } from './ponto.service';
import { INTERVALO_MAXIMO_MS } from './ponto.domain';
import {
  FALTA_AUTOMATICA_MIN,
  estadoSemBatida,
  minutosAposEntrada,
} from './deteccao-automatica.domain';

/** Autor "sistema" das marcações automáticas (auditoria). */
const AUTOR_SISTEMA = { id: 'sistema', nome: 'Detecção automática' };

/**
 * Detecção automática de faltas e não-retornos (verificador a cada 5 minutos).
 *
 * Substitui a marcação manual na escala: cruza a ESCALA do dia (quem deve
 * trabalhar) com o Relógio Ponto (quem bateu) e:
 *
 *  - **Falta automática:** o colaborador escalado que NÃO bateu ponto até 2h
 *    após a hora de entrada prevista é marcado como falta (mesmo fluxo/avisos
 *    da falta manual, mas com `automatica = true`). Se depois bater ponto, a
 *    falta automática é removida (ver `PontoService`).
 *  - **Não retorno do intervalo:** quem saiu para o intervalo e não voltou —
 *    intervalo em curso já acima do máximo (3h no 6x1) — tem o "não retorno"
 *    registrado automaticamente (origem DETECTADO_PONTO).
 *
 * O alerta preventivo de 1h (atraso) é apenas visual (calculado na "equipe do
 * dia"), então este cron não age nele — só na falta (2h) e no não retorno.
 *
 * Best-effort e defensivo: uma pessoa com dados inconsistentes nunca impede a
 * verificação das demais, e nenhuma falha trava o serviço.
 */
@Injectable()
export class PontoDeteccaoAutomaticaService {
  private readonly logger = new Logger(PontoDeteccaoAutomaticaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fiscais: FiscaisService,
    private readonly operadores: OperadoresService,
    private readonly incidencias: IncidenciasService,
    private readonly ponto: PontoService,
  ) {}

  /** Verifica faltas automáticas e não-retornos a cada 5 minutos. */
  @Cron('*/5 * * * *', { timeZone: 'America/Sao_Paulo' })
  async verificar(): Promise<void> {
    const agora = agoraNaBrasilia();
    const dia = inicioDoDia(agora);

    let escalados: EscaladoDia[];
    try {
      escalados = await this.fiscais.escaladosDoDia(dia);
    } catch (erro) {
      this.logger.warn(`Falha ao carregar escalados do dia: ${String(erro)}`);
      return;
    }
    if (escalados.length === 0) return;

    // Quem tem atividade hoje: batidas do Relógio Ponto OU registros de status
    // de fiscal (um fiscal pode estar trabalhando sem ter usado o comprovante).
    const [batidas, registrosFiscais] = await Promise.all([
      this.prisma.batidaPonto.findMany({
        where: { data: dia },
        select: { pessoaId: true },
      }),
      this.prisma.registroPontoFiscal.findMany({
        where: { data: dia },
        select: { fiscalId: true },
      }),
    ]);
    const comAtividade = new Set<string>([
      ...batidas.map((b) => b.pessoaId),
      ...registrosFiscais.map((r) => r.fiscalId),
    ]);

    for (const escalado of escalados) {
      try {
        if (comAtividade.has(escalado.pessoaId)) {
          await this.verificarNaoRetorno(escalado, dia);
        } else {
          await this.verificarFaltaAutomatica(escalado, dia, agora);
        }
      } catch (erro) {
        this.logger.warn(
          `Falha ao verificar ${escalado.nome} (${escalado.pessoaId}): ${String(erro)}`,
        );
      }
    }
  }

  /**
   * Marca a falta automática quando já passaram 2h da entrada prevista sem
   * nenhuma batida. Não sobrescreve uma falta já existente (manual ou anterior)
   * e nunca marca de quem não tem hora de entrada definida no dia.
   */
  private async verificarFaltaAutomatica(
    escalado: EscaladoDia,
    dia: Date,
    agora: Date,
  ): Promise<void> {
    const minutos = minutosAposEntrada(escalado.entradaPrevista, agora);
    if (estadoSemBatida(minutos) !== 'FALTA') return;

    // Já existe falta para a pessoa nesse dia? (manual ou automática) → não
    // duplica nem sobrescreve.
    const jaFalta = await this.prisma.ausencia.findFirst({
      where: { data: dia, pessoaId: escalado.pessoaId },
      select: { id: true },
    });
    if (jaFalta) return;

    try {
      if (escalado.tipoPessoa === 'FISCAL') {
        // `registrarFalta` espera um INSTANTE real: internamente converte para
        // o dia civil de Brasília (`diaCivilBrasilia`). Passamos `new Date()`
        // (que resolve exatamente para o `dia` deste ciclo), NÃO o `dia` já
        // truncado — passar o dia truncado o converteria de novo, caindo no
        // dia anterior e reavisando a falta a cada verificação (spam).
        await this.fiscais.registrarFalta(escalado.pessoaId, new Date(), {
          automatica: true,
        });
      } else {
        await this.operadores.registrarAusencia(
          escalado.pessoaId,
          dia,
          AUTOR_SISTEMA,
          { automatica: true },
        );
      }
      this.logger.log(
        `Falta automática: ${escalado.nome} (sem ponto ${FALTA_AUTOMATICA_MIN}min após a entrada).`,
      );
    } catch (erro) {
      // Corrida (bateu ponto/foi marcado agora), folga ou ciclo fechado: não é
      // erro — só não marca. Duplicidade é silenciosa.
      if (!(erro instanceof AusenciaDuplicadaError)) {
        this.logger.warn(
          `Não foi possível marcar falta de ${escalado.nome}: ${String(erro)}`,
        );
      }
    }
  }

  /**
   * Registra o "não retorno do intervalo" quando a jornada está EM_INTERVALO e
   * o intervalo em curso já ultrapassou o máximo (3h no 6x1). Idempotente: não
   * duplica se já houver um não-retorno do dia. Só para quem tem ficha
   * (`colaboradorId`), pois a incidência é keyed por colaborador.
   */
  private async verificarNaoRetorno(
    escalado: EscaladoDia,
    dia: Date,
  ): Promise<void> {
    if (!escalado.colaboradorId) return;

    const resposta = await this.ponto.jornadaDoDia(
      escalado.pessoaId,
      escalado.tipoPessoa,
      dia,
    );
    if (
      resposta.jornada.status !== 'EM_INTERVALO' ||
      resposta.jornada.intervaloMs <= INTERVALO_MAXIMO_MS
    ) {
      return;
    }

    // Já registrado hoje? (evita duplicar a cada 5 min)
    const jaRegistrado = await this.prisma.incidenciaEscala.findFirst({
      where: {
        colaboradorId: escalado.colaboradorId,
        tipo: 'NAO_RETORNO_INTERVALO',
        data: dia,
      },
      select: { id: true },
    });
    if (jaRegistrado) return;

    const saida = resposta.batidas.find((b) => b.tipo === 'SAIDA_INTERVALO');
    const horaSaida = saida ? saida.hora.slice(11, 16) : undefined;

    try {
      await this.incidencias.registrar(
        {
          colaboradorId: escalado.colaboradorId,
          tipo: 'NAO_RETORNO_INTERVALO',
          data: dia.toISOString(),
          horaSaida,
          origem: 'DETECTADO_PONTO',
        },
        AUTOR_SISTEMA,
      );
      this.logger.log(
        `Não retorno automático: ${escalado.nome} (intervalo acima de 3h).`,
      );
    } catch (erro) {
      // Duplicidade é esperada em corrida — silenciosa.
      if (!(erro instanceof IncidenciaDuplicadaError)) {
        this.logger.warn(
          `Não foi possível registrar não-retorno de ${escalado.nome}: ${String(erro)}`,
        );
      }
    }
  }
}
