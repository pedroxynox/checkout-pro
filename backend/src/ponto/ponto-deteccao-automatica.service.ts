import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { agoraNaBrasilia, inicioDoDia } from '../common/datas';
import { FiscaisService, EscaladoDia } from '../fiscais/fiscais.service';
import { OperadoresService } from '../operadores/operadores.service';
import { IncidenciasService } from '../incidencias/incidencias.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { IncidenciaDuplicadaError } from '../incidencias/incidencias.errors';
import { AusenciaDuplicadaError } from '../operadores/operadores.errors';
import { PontoService } from './ponto.service';
import {
  ALERTA_ATRASO_MIN,
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
    // Opcional: alguns testes instanciam o serviço sem o barramento de avisos.
    // Em produção o DI injeta (NotificacoesModule já é importado no módulo).
    @Optional() private readonly notificacoes?: NotificacoesService,
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

    // Carrega de UMA vez os sinais do dia (antes fazíamos um findFirst por
    // escalado — N consultas no caminho quente que roda a cada 5 min):
    //  - batidas/registros de fiscal (quem tem atividade hoje);
    //  - todas as faltas do dia (para o "já tem falta?"), cobrindo AS DUAS
    //    chaves (pessoaId E colaboradorId);
    //  - não-retornos já registrados hoje (para o "já registrado?").
    const [batidas, registrosFiscais, ausenciasDoDia, naoRetornosDoDia] =
      await Promise.all([
        this.prisma.batidaPonto.findMany({
          where: { data: dia },
          select: { pessoaId: true },
        }),
        this.prisma.registroPontoFiscal.findMany({
          where: { data: dia },
          select: { fiscalId: true },
        }),
        this.prisma.ausencia.findMany({
          where: { data: dia },
          select: { pessoaId: true, colaboradorId: true },
        }),
        this.prisma.incidenciaEscala.findMany({
          where: { tipo: 'NAO_RETORNO_INTERVALO', data: dia },
          select: { colaboradorId: true },
        }),
      ]);
    const comAtividade = new Set<string>([
      ...batidas.map((b) => b.pessoaId),
      ...registrosFiscais.map((r) => r.fiscalId),
    ]);
    // Ids (pessoaId OU colaboradorId) que já têm falta hoje — a união das duas
    // colunas reproduz em memória o `OR pessoaId/colaboradorId` da consulta.
    const idsComFalta = new Set<string>();
    for (const a of ausenciasDoDia) {
      idsComFalta.add(a.pessoaId);
      if (a.colaboradorId) idsComFalta.add(a.colaboradorId);
    }
    const naoRetornoRegistrado = new Set(
      naoRetornosDoDia.map((i) => i.colaboradorId),
    );

    for (const escalado of escalados) {
      try {
        if (comAtividade.has(escalado.pessoaId)) {
          await this.verificarNaoRetorno(escalado, dia, naoRetornoRegistrado);
        } else {
          // Sem batida: 1h de atraso → avisa (uma vez); 2h → falta automática.
          // Os estados são mutuamente exclusivos (ver `estadoSemBatida`), então
          // no máximo um dos dois age.
          await this.verificarAtraso(escalado, dia, agora);
          await this.verificarFaltaAutomatica(
            escalado,
            dia,
            agora,
            idsComFalta,
          );
        }
      } catch (erro) {
        this.logger.warn(
          `Falha ao verificar ${escalado.nome} (${escalado.pessoaId}): ${String(erro)}`,
        );
      }
    }
  }

  /**
   * Aviso PREVENTIVO de atraso: quando já passou 1h (mas ainda não 2h) da
   * entrada prevista sem nenhuma batida, notifica a supervisão/gerência. Não
   * lança falta (isso é aos 2h) — é só um alerta para agir a tempo.
   *
   * Enviado UMA vez por pessoa/dia: a linha em `alertaAtrasoEnviado` (índice
   * único `pessoaId+dia`) é a trava atômica — reserva com um INSERT e só então
   * envia; em `P2002` (já reservado) não repete. Assim o cron de 5 min,
   * reinícios e múltiplas instâncias nunca geram avisos duplicados.
   */
  private async verificarAtraso(
    escalado: EscaladoDia,
    dia: Date,
    agora: Date,
  ): Promise<void> {
    if (!this.notificacoes) return;
    const minutos = minutosAposEntrada(escalado.entradaPrevista, agora);
    if (estadoSemBatida(minutos) !== 'ALERTA') return;

    // Reserva a trava (uma por pessoa/dia). Se já existe, alguém já avisou hoje.
    try {
      await this.prisma.alertaAtrasoEnviado.create({
        data: { pessoaId: escalado.pessoaId, dia },
      });
    } catch (erro) {
      if (
        erro instanceof Prisma.PrismaClientKnownRequestError &&
        erro.code === 'P2002'
      ) {
        return; // já avisado hoje — não repete
      }
      throw erro;
    }

    try {
      await this.notificacoes.notificarComPermissao('CENTRAL_JORNADA', {
        titulo: '⏰ Atraso: 1h sem registrar o ponto',
        mensagem: `${escalado.nome} estava escalado(a) para ${escalado.entradaPrevista} e já faz ${ALERTA_ATRASO_MIN} min sem bater ponto. Verifique antes que vire falta.`,
      });
      this.logger.log(
        `Alerta de atraso (1h): ${escalado.nome} (sem ponto ${ALERTA_ATRASO_MIN}min após a entrada).`,
      );
    } catch (erro) {
      // A reserva já impede repetição; um envio falho é best-effort (não trava
      // a verificação das demais pessoas).
      this.logger.warn(
        `Não foi possível avisar o atraso de ${escalado.nome}: ${String(erro)}`,
      );
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
    idsComFalta: ReadonlySet<string>,
  ): Promise<void> {
    const minutos = minutosAposEntrada(escalado.entradaPrevista, agora);
    if (estadoSemBatida(minutos) !== 'FALTA') return;

    // Já existe falta para a pessoa nesse dia? (manual, automática ou a prazo)
    // → não duplica nem sobrescreve. Consulta em memória (o conjunto de faltas
    // do dia foi carregado UMA vez neste ciclo) cobrindo AS DUAS chaves:
    // `pessoaId` (Fiscal.id p/ fiscais, Colaborador.id p/ operadores) E o
    // vínculo com a ficha `colaboradorId`. Isso é essencial para a ausência a
    // prazo de um FISCAL: ela é gravada com a ficha (Colaborador.id), enquanto
    // o escalado é identificado pelo Fiscal.id — checar só `pessoaId` não a
    // encontrava e o cron remarcava uma falta duplicada. Como fallback, o
    // próprio `registrarFalta`/`registrarAusencia` é idempotente.
    const ids = [escalado.pessoaId, escalado.colaboradorId].filter(
      (v): v is string => !!v,
    );
    if (ids.some((id) => idsComFalta.has(id))) return;

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
   * o intervalo em curso já ultrapassou o máximo do CONTRATO da pessoa (3h no
   * 6x1, data-driven). Idempotente: não duplica se já houver um não-retorno do
   * dia. Só para quem tem ficha (`colaboradorId`), pois a incidência é keyed
   * por colaborador.
   *
   * **Auto-cura:** quando já EXISTE um não-retorno do dia e a pessoa fechou o
   * intervalo (voltou, jornada normal), o não-retorno AUTO-detectado é removido
   * — é um falso positivo que ficou porque o retorno entrou depois do ciclo que
   * o marcou (anotado em atraso, corrigido à mão, reenvio). Assim qualquer via
   * de registro do retorno acaba limpando a marca, não só a batida normal (que
   * o `PontoService` já trata no ato). Recalcula a jornada de quem já tem o
   * não-retorno (custo pequeno: são poucas pessoas por dia).
   */
  private async verificarNaoRetorno(
    escalado: EscaladoDia,
    dia: Date,
    naoRetornoRegistrado: ReadonlySet<string>,
  ): Promise<void> {
    if (!escalado.colaboradorId) return;

    const jaTemNaoRetorno = naoRetornoRegistrado.has(escalado.colaboradorId);

    const resposta = await this.ponto.jornadaDoDia(
      escalado.pessoaId,
      escalado.tipoPessoa,
      dia,
    );

    // Auto-cura: já há um não-retorno do dia, mas o intervalo foi fechado
    // (retorno registrado e jornada fora do estado de não-retorno). Remove o
    // AUTO-detectado (os manuais do gestor não são tocados) e encerra.
    if (jaTemNaoRetorno) {
      const fechouIntervalo =
        !resposta.jornada.naoRetornoIntervalo &&
        resposta.batidas.some((b) => b.tipo === 'RETORNO_INTERVALO');
      if (fechouIntervalo) {
        try {
          const removidos = await this.incidencias.removerNaoRetornoAutomatico(
            escalado.colaboradorId,
            dia,
          );
          if (removidos > 0) {
            this.logger.log(
              `Não retorno automático removido: ${escalado.nome} (fechou o intervalo; falso positivo).`,
            );
          }
        } catch (erro) {
          this.logger.warn(
            `Não foi possível remover não-retorno de ${escalado.nome}: ${String(erro)}`,
          );
        }
      }
      return;
    }

    // Não-retorno data-driven, calculado na jornada com o intervalo máximo do
    // CONTRATO da pessoa: saiu para o intervalo, não voltou e passou do máximo.
    // Vale INCLUSIVE quando o turno já foi dado por encerrado (intervalo
    // obrigatório) — caso que antes escapava, pois a checagem exigia o status
    // EM_INTERVALO, que nunca ocorria nesses contratos ao cruzar o máximo.
    if (!resposta.jornada.naoRetornoIntervalo) return;

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
        `Não retorno automático: ${escalado.nome} (intervalo acima do máximo do contrato).`,
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
