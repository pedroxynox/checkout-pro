import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  Prisma,
  TipoOcorrenciaAutomatica,
  TipoPessoaPonto,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  agoraNaBrasilia,
  inicioDoDia,
  periodoFolhaDeslocado,
} from '../common/datas';
import { FiscaisService, EscaladoDia } from '../fiscais/fiscais.service';
import { OperadoresService } from '../operadores/operadores.service';
import { IncidenciasService } from '../incidencias/incidencias.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { IncidenciaDuplicadaError } from '../incidencias/incidencias.errors';
import { FiscalDeFolgaError } from '../fiscais/fiscais.errors';
import {
  AusenciaDuplicadaError,
  FaltaEmDiaDeFolgaError,
} from '../operadores/operadores.errors';
import { PontoService } from './ponto.service';
import {
  ALERTA_ATRASO_MIN,
  FALTA_AUTOMATICA_MIN,
  estadoSemBatida,
  minutosAposEntrada,
} from './deteccao-automatica.domain';
import {
  FatosDoDia,
  descreverMotivo,
  ehFaltaAutomaticaPendente,
  motivoParaRemoverFalta,
  motivoParaRemoverNaoRetorno,
} from './revalidacao-automatica.domain';
import { FeriasService } from '../ferias/ferias.service';
import { FolgaService } from '../escala-domingo/folga.service';

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
 * **Duas fontes de vigiados.** A escala responde "quem devia trabalhar", mas
 * desde que o ponto em dia de folga passou a ser aceito (ADR 0019) ela deixou de
 * responder "quem está trabalhando": quem bate ponto num dia marcado como folga
 * é excluído de `escaladosDoDia` e ficava fora de toda a vigilância — justamente
 * a pessoa em situação irregular saía do intervalo e ninguém era avisado. Por
 * isso o cron também varre O RELÓGIO PONTO (quem bateu hoje) e vigia quem não
 * está na escala. Ver `vigiadosForaDaEscala`.
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
    // Opcional: sem ele a revalidação simplesmente não usa "de férias" como
    // motivo (os outros motivos seguem valendo).
    @Optional() private readonly ferias?: FeriasService,
    // Regra única de folga (ficha + escala semanal). Sem ela a auto-cura não usa
    // "dia de folga" como motivo — os outros seguem valendo.
    @Optional() private readonly folga?: FolgaService,
  ) {}

  /** Verifica faltas automáticas e não-retornos a cada 5 minutos. */
  @Cron('*/5 * * * *', { timeZone: 'America/Sao_Paulo' })
  async verificar(): Promise<void> {
    const agora = agoraNaBrasilia();
    const dia = inicioDoDia(agora);

    // Primeiro apaga o que já não é verdade, depois detecta o que é. Nesta ordem
    // uma ocorrência revalidada não é reavaliada no mesmo ciclo, e o "já tem
    // falta?" da detecção enxerga a base já limpa.
    try {
      await this.revalidarOcorrenciasAutomaticas(agora);
    } catch (erro) {
      this.logger.warn(
        `Falha na revalidação das ocorrências automáticas: ${String(erro)}`,
      );
    }

    // Avisos de "ponto em dia de folga" que já foram resolvidos: o gestor
    // corrigiu a escala e aquele dia não é mais folga. Fica aqui, junto da
    // revalidação, porque é a mesma ideia — um apontamento só vive enquanto for
    // verdade — e porque o gatilho é uma edição de CADASTRO, que não passa pelo
    // Relógio Ponto e portanto não tem como notificar por si mesma.
    try {
      await this.revalidarAvisosPontoEmFolga(agora);
    } catch (erro) {
      this.logger.warn(
        `Falha na revalidação dos avisos de ponto em folga: ${String(erro)}`,
      );
    }

    let escalados: EscaladoDia[];
    try {
      escalados = await this.fiscais.escaladosDoDia(dia);
    } catch (erro) {
      this.logger.warn(`Falha ao carregar escalados do dia: ${String(erro)}`);
      return;
    }
    // Sem `return` quando a escala do dia está vazia: as batidas são a SEGUNDA
    // fonte de vigiados, e num dia em que só trabalhou gente marcada como de
    // folga a escala vem vazia — era exatamente aí que a vigilância silenciava.

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
          // `tipoPessoa` sai de graça no mesmo round-trip e é o que permite usar
          // esta leitura como SEGUNDA FONTE de vigiados (só o par
          // pessoaId+tipoPessoa identifica alguém para `jornadaDoDia`).
          select: { pessoaId: true, tipoPessoa: true, colaboradorId: true },
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
    // AS DUAS chaves de cada batida. Uma pessoa pode ter duas identidades de
    // ponto: quem muda de função para FISCAL passa a bater com um `Fiscal.id`
    // novo, e o escalado é identificado por esse id — mas as batidas do dia da
    // mudança ainda podem estar gravadas com o `Colaborador.id`. Olhando só
    // `pessoaId`, a varredura não as via, concluía "não bateu ponto" e marcava
    // FALTA AUTOMÁTICA em quem estava trabalhando. A revalidação já cruzava as
    // duas chaves (`carregarFatosDoPeriodo`), então a falta se curava sozinha no
    // ciclo seguinte — mas depois de notificar o gestor e assustar a pessoa.
    const comAtividade = new Set<string>([
      ...batidas.flatMap((b) =>
        b.colaboradorId ? [b.pessoaId, b.colaboradorId] : [b.pessoaId],
      ),
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

    // SEGUNDA FONTE: quem bateu ponto hoje sem estar na escala do dia.
    let foraDaEscala: EscaladoDia[] = [];
    try {
      foraDaEscala = await this.vigiadosForaDaEscala(escalados, batidas);
    } catch (erro) {
      // Modo de falha correto: seguir vigiando a escala (comportamento antigo),
      // nunca deixar de vigiar quem está escalado.
      this.logger.warn(
        `Falha ao montar os vigiados fora da escala: ${String(erro)} — o ciclo segue só com a escala.`,
      );
    }
    const aVigiar = [...escalados, ...foraDaEscala];
    if (aVigiar.length === 0) return;

    // Dias que o gestor JÁ EXCLUIU à mão: a detecção não insiste. Sem isto,
    // excluir uma card não tinha efeito prático — a condição seguia verdadeira e
    // o próximo ciclo (5 min) recriava a ocorrência.
    const [excluidasFalta, excluidasNaoRetorno] = await Promise.all([
      this.idsComExclusao('FALTA', dia),
      this.idsComExclusao('NAO_RETORNO_INTERVALO', dia),
    ]);

    for (const escalado of aVigiar) {
      try {
        // As duas chaves nos DOIS lados: o escalado é identificado pelo id da
        // batida (`Fiscal.id` para fiscais) mas conhece a própria ficha, e as
        // batidas guardam ambas. Comparar só `pessoaId` deixava passar quem
        // mudou de função — as batidas do dia estavam sob a ficha, não sob a
        // identidade nova.
        if (
          comAtividade.has(escalado.pessoaId) ||
          (escalado.colaboradorId != null &&
            comAtividade.has(escalado.colaboradorId))
        ) {
          await this.verificarNaoRetorno(
            escalado,
            dia,
            naoRetornoRegistrado,
            excluidasNaoRetorno,
          );
        } else {
          // Sem batida: 1h de atraso → avisa (uma vez); 2h → falta automática.
          // Os estados são mutuamente exclusivos (ver `estadoSemBatida`), então
          // no máximo um dos dois age.
          //
          // Quem vem da SEGUNDA FONTE nunca cai aqui: foi derivado das próprias
          // batidas do dia, então está em `comAtividade` por construção. E ainda
          // que caísse, `entradaPrevista` é null para ele — `estadoSemBatida`
          // devolve AGUARDANDO e os dois métodos abaixo não fazem nada. Nunca se
          // cobra atraso nem se marca falta de quem não era esperado hoje.
          await this.verificarAtraso(escalado, dia, agora, idsComFalta);
          await this.verificarFaltaAutomatica(
            escalado,
            dia,
            agora,
            idsComFalta,
            excluidasFalta,
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
   * SEGUNDA FONTE de vigiados: quem **bateu ponto hoje sem estar na escala**.
   *
   * A vigilância nasceu guiada pela escala, o que era suficiente enquanto o
   * ponto em dia de folga fosse recusado. Depois que passou a ser aceito (ADR
   * 0019 — na prática é a folga que mudou e o cadastro não foi atualizado),
   * abriu-se um vão: `escaladosDoDia` exclui quem está de folga, então a pessoa
   * trabalhava o dia inteiro fora de qualquer verificação. Saía para o intervalo,
   * não voltava, e o gestor não recebia nada — o pior caso possível, porque é
   * exatamente o dia em que a escala já está errada.
   *
   * Derivar de `batidas_ponto` (e não de `AvisoPontoEmFolga`) cobre o vão inteiro
   * de uma vez: folga, férias lançadas por engano, escala não publicada, convocação
   * de última hora. A pergunta deixa de ser "por que ela não está na escala?" e
   * passa a ser "ela está trabalhando?".
   *
   * O que estas pessoas recebem é **só o não-retorno do intervalo**, e isso é
   * garantido por construção, não por um `if`: elas vêm das batidas do dia, logo
   * entram sempre pelo ramo "tem atividade" do loop; e `entradaPrevista` é null,
   * o que torna atraso e falta automática inertes mesmo se algum dia caírem no
   * outro ramo. Cobrar atraso de quem não era esperada seria absurdo, e marcar
   * falta de quem está trabalhando, um bug.
   *
   * Exige `colaboradorId`: a `IncidenciaEscala` do não-retorno é keyed por ficha,
   * então sem ela não há o que registrar (`registrarBatida` resolve a ficha antes
   * de gravar, portanto o caso normal sempre a tem).
   */
  private async vigiadosForaDaEscala(
    escalados: readonly EscaladoDia[],
    batidas: readonly {
      pessoaId: string;
      tipoPessoa: TipoPessoaPonto;
      colaboradorId: string | null;
    }[],
  ): Promise<EscaladoDia[]> {
    if (batidas.length === 0) return [];

    // AS DUAS chaves de quem já está na escala — o vigiado da escala é
    // identificado pelo `Fiscal.id` mas a batida pode estar sob a ficha (o
    // incidente da mudança de função, ADR 0020). Comparar por uma só chave
    // duplicaria a pessoa: ela seria vigiada como escalada E como "fora da
    // escala".
    const naEscala = new Set<string>();
    for (const e of escalados) {
      naEscala.add(e.pessoaId);
      if (e.colaboradorId) naEscala.add(e.colaboradorId);
    }

    // Uma entrada por pessoa (são até 4 batidas por dia cada uma).
    const candidatos = new Map<
      string,
      { pessoaId: string; tipoPessoa: 'FISCAL' | 'OPERADOR'; ficha: string }
    >();
    for (const b of batidas) {
      // Só as identidades de ponto que `jornadaDoDia` sabe calcular.
      if (b.tipoPessoa !== 'FISCAL' && b.tipoPessoa !== 'OPERADOR') continue;
      if (!b.colaboradorId) continue;
      if (naEscala.has(b.pessoaId) || naEscala.has(b.colaboradorId)) continue;
      if (candidatos.has(b.pessoaId)) continue;
      candidatos.set(b.pessoaId, {
        pessoaId: b.pessoaId,
        tipoPessoa: b.tipoPessoa,
        ficha: b.colaboradorId,
      });
    }
    if (candidatos.size === 0) return [];

    const vigiados: EscaladoDia[] = [];
    for (const c of candidatos.values()) {
      vigiados.push({
        pessoaId: c.pessoaId,
        tipoPessoa: c.tipoPessoa,
        colaboradorId: c.ficha,
        // Só rótulo de log/aviso; nenhuma decisão depende dele.
        nome: await this.nomePessoaDoAviso({
          pessoaId: c.pessoaId,
          colaboradorId: c.ficha,
        }),
        funcao: c.tipoPessoa,
        // Não existe hora prevista para um dia em que a pessoa não era esperada
        // — e é esse null que mantém atraso e falta fora de cena.
        entradaPrevista: null,
      });
    }
    return vigiados;
  }

  /**
   * Ids (pessoa ou ficha) com exclusão do gestor para o tipo/dia informados.
   *
   * Defensivo por opção: se esta leitura falhar, devolve vazio e a detecção
   * segue como antes (insistindo). O modo de falha correto aqui é "voltar ao
   * comportamento antigo", nunca "parar de detectar faltas".
   */
  private async idsComExclusao(
    tipo: TipoOcorrenciaAutomatica,
    dia: Date,
  ): Promise<Set<string>> {
    const ids = new Set<string>();
    try {
      const exclusoes = await this.prisma.exclusaoOcorrenciaAutomatica.findMany(
        {
          where: { tipo, data: dia },
          select: { pessoaId: true, colaboradorId: true },
        },
      );
      for (const e of exclusoes) {
        ids.add(e.pessoaId);
        if (e.colaboradorId) ids.add(e.colaboradorId);
      }
    } catch (erro) {
      this.logger.warn(
        `Falha ao ler as exclusões de ${tipo}: ${String(erro)} — a detecção segue sem elas.`,
      );
    }
    return ids;
  }

  /**
   * REVALIDAÇÃO das ocorrências automáticas do ciclo de folha aberto.
   *
   * A detecção escreve um fato sobre um dia; este método pergunta, para cada
   * fato que o SISTEMA lançou, **se ele ainda é verdade** — e apaga o que não é.
   *
   * Por que uma varredura, e não mais um gancho: os fatos deixam de ser verdade
   * por muitos caminhos (batida em atraso, batida corrigida à mão, atestado
   * lançado depois, férias atribuídas retroativamente, importação). Pendurar uma
   * limpeza em cada um desses eventos significa cobrir só os que alguém lembrou
   * — e foi exatamente o que aconteceu: as cards ficavam na tela pedindo
   * justificativa por algo que já não existia. Perguntando "ainda é verdade?"
   * não importa o caminho.
   *
   * **Janela: o ciclo de folha ABERTO.** É o período que ainda se pode corrigir;
   * ciclos fechados são história e não se mexe neles. Também é o que permite a
   * correção retroativa (marcar férias hoje cobrindo dias da semana passada).
   *
   * **Só toca o que o sistema criou:** faltas `automatica` ainda não convertidas
   * (ver `ehFaltaAutomaticaPendente`) e não-retornos `DETECTADO_PONTO`. Nada
   * registrado por uma pessoa é apagado aqui.
   *
   * Best-effort: qualquer falha é registrada e não interrompe o ciclo.
   */
  /**
   * Fecha os avisos de "bateu ponto em dia de FOLGA" que já não valem.
   *
   * O aviso nasce quando alguém registra ponto num dia que o cadastro diz ser
   * folga dela — na prática, a folga mudou e ninguém atualizou o sistema. A
   * correção é o gestor **mudar a folga no cadastro**, e é aí que está o
   * problema: essa edição não passa pelo Relógio Ponto, então nada lá tem como
   * perceber que o assunto foi resolvido.
   *
   * Esta varredura fecha o ciclo: para cada aviso ainda aberto do período de
   * folha, pergunta de novo à **regra única de folga** se aquele dia continua
   * sendo folga. Se não for mais, marca `resolvidoEm` e avisa **uma vez** que
   * está resolvido — a mesma cortesia que o alerta de TAC já tem ao ser
   * corrigido.
   *
   * `resolvidoEm` é gravado em vez de a linha ser apagada por dois motivos: a
   * trava de "avisar uma vez" continua valendo (o índice único segue lá), e fica
   * rastro de que a correção aconteceu.
   *
   * Best-effort: qualquer falha é registrada e não interrompe o ciclo.
   */
  private async revalidarAvisosPontoEmFolga(agora: Date): Promise<void> {
    const { inicio, fimExclusivo } = periodoFolhaDeslocado(agora, 0);
    const abertos = await this.prisma.avisoPontoEmFolga.findMany({
      where: {
        resolvidoEm: null,
        dia: { gte: inicio, lt: fimExclusivo },
      },
      select: { id: true, pessoaId: true, colaboradorId: true, dia: true },
    });
    if (abertos.length === 0) return;

    // Uma consulta de folga para todos os dias envolvidos.
    const dias = [...new Set(abertos.map((a) => a.dia.getTime()))].map(
      (t) => new Date(t),
    );
    const consultorFolga = this.folga ? await this.folga.consultor(dias) : null;
    // Sem o serviço de folga não há como saber se deixou de ser folga: não se
    // fecha nada (melhor um aviso aberto de mais do que um fechado sem base).
    if (!consultorFolga) return;

    for (const aviso of abertos) {
      const aindaEhFolga = consultorFolga.ehFolga(aviso.dia, [
        aviso.pessoaId,
        aviso.colaboradorId,
      ]);
      if (aindaEhFolga) continue;
      try {
        await this.prisma.avisoPontoEmFolga.update({
          where: { id: aviso.id },
          data: { resolvidoEm: agora },
        });
        this.logger.log(
          `Aviso de ponto em folga resolvido: ${aviso.pessoaId} em ${aviso.dia.toISOString().slice(0, 10)}.`,
        );
        if (this.notificacoes) {
          const nome = await this.nomePessoaDoAviso(aviso);
          await this.notificacoes.notificarSupervisaoEGerencia({
            titulo: '✅ Escala corrigida',
            mensagem:
              `${nome} já não está de folga em ${aviso.dia.toISOString().slice(0, 10)} — ` +
              `a escala foi atualizada e o apontamento daquele dia deixou de existir.`,
          });
        }
      } catch (erro) {
        this.logger.warn(
          `Não foi possível fechar o aviso de ponto em folga ${aviso.id}: ${String(erro)}`,
        );
      }
    }
  }

  /**
   * Nome de uma pessoa a partir do par de ids (ficha primeiro, fiscal como
   * fallback). Usado nos avisos e nos logs, onde é só rótulo — nenhuma decisão
   * depende dele, por isso o default genérico em vez de falhar.
   */
  private async nomePessoaDoAviso(aviso: {
    pessoaId: string;
    colaboradorId: string | null;
  }): Promise<string> {
    if (aviso.colaboradorId) {
      const ficha = await this.prisma.colaborador.findUnique({
        where: { id: aviso.colaboradorId },
        select: { nome: true },
      });
      if (ficha?.nome) return ficha.nome;
    }
    const fiscal = await this.prisma.fiscal.findUnique({
      where: { id: aviso.pessoaId },
      select: { nome: true },
    });
    return fiscal?.nome ?? 'Colaborador';
  }

  private async revalidarOcorrenciasAutomaticas(agora: Date): Promise<void> {
    const { inicio, fimExclusivo } = periodoFolhaDeslocado(agora, 0);

    const [faltas, naoRetornos] = await Promise.all([
      this.prisma.ausencia.findMany({
        where: {
          data: { gte: inicio, lt: fimExclusivo },
          automatica: true,
          atestadoId: null,
          aPrazo: false,
        },
        select: {
          id: true,
          pessoaId: true,
          colaboradorId: true,
          data: true,
          automatica: true,
          atestadoId: true,
          aPrazo: true,
        },
      }),
      this.prisma.incidenciaEscala.findMany({
        where: {
          tipo: 'NAO_RETORNO_INTERVALO',
          origem: 'DETECTADO_PONTO',
          data: { gte: inicio, lt: fimExclusivo },
        },
        select: {
          id: true,
          colaboradorId: true,
          funcionarioId: true,
          data: true,
        },
      }),
    ]);
    if (faltas.length === 0 && naoRetornos.length === 0) return;

    // Fatos do período, carregados de uma vez (a varredura roda a cada 5 min).
    const dias = [
      ...new Set([
        ...faltas.map((f) => f.data.getTime()),
        ...naoRetornos.map((i) => i.data.getTime()),
      ]),
    ].map((t) => new Date(t));
    const fatos = await this.carregarFatosDoPeriodo(inicio, fimExclusivo, dias);

    for (const falta of faltas) {
      // Guarda extra: a consulta já filtra, mas a regra de "o que é uma falta
      // automática pendente" mora no domínio e é ela que vale.
      if (!ehFaltaAutomaticaPendente(falta)) continue;
      const motivo = motivoParaRemoverFalta(
        fatos.para(falta.data, [falta.pessoaId, falta.colaboradorId]),
      );
      if (!motivo) continue;
      try {
        await this.prisma.ausencia.delete({ where: { id: falta.id } });
        this.logger.log(
          `Falta automática removida (${descreverMotivo(motivo)}): ${falta.pessoaId} em ${falta.data.toISOString().slice(0, 10)}.`,
        );
      } catch (erro) {
        this.logger.warn(
          `Não foi possível remover a falta automática ${falta.id}: ${String(erro)}`,
        );
      }
    }

    for (const inc of naoRetornos) {
      const motivo = motivoParaRemoverNaoRetorno(
        fatos.para(inc.data, [inc.colaboradorId, inc.funcionarioId]),
      );
      if (!motivo) continue;
      try {
        await this.prisma.incidenciaEscala.delete({ where: { id: inc.id } });
        this.logger.log(
          `Não retorno automático removido (${descreverMotivo(motivo)}): ${inc.colaboradorId} em ${inc.data.toISOString().slice(0, 10)}.`,
        );
      } catch (erro) {
        this.logger.warn(
          `Não foi possível remover o não-retorno ${inc.id}: ${String(erro)}`,
        );
      }
    }
  }

  /**
   * Carrega os fatos do período (batidas, coberturas e férias) e devolve um
   * consultor `para(dia, ids)` que monta os `FatosDoDia` de uma pessoa num dia.
   *
   * Os ids são consultados aos pares (`pessoaId` e `colaboradorId`) porque um
   * fiscal bate ponto por uma identidade e tem a ficha noutra — ignorar isso é a
   * origem de metade dos casos em que a limpeza não acontecia.
   */
  private async carregarFatosDoPeriodo(
    inicio: Date,
    fimExclusivo: Date,
    dias: readonly Date[],
  ): Promise<{
    para: (dia: Date, ids: readonly (string | null)[]) => FatosDoDia;
  }> {
    // Consultor de folga dos dias varridos: é o que permite apagar a falta
    // lançada em dia de descanso, que de outra forma ficaria para sempre (a
    // auto-cura espera uma batida, e num dia de folga ela nunca chega).
    const consultorFolga = this.folga ? await this.folga.consultor(dias) : null;

    const [batidas, coberturas, feriasPorDia] = await Promise.all([
      this.prisma.batidaPonto.findMany({
        where: { data: { gte: inicio, lt: fimExclusivo } },
        select: { pessoaId: true, colaboradorId: true, data: true, tipo: true },
      }),
      // Coberturas do dia: atestado (`atestadoId`) ou ausência a prazo.
      this.prisma.ausencia.findMany({
        where: {
          data: { gte: inicio, lt: fimExclusivo },
          OR: [{ atestadoId: { not: null } }, { aPrazo: true }],
        },
        select: {
          pessoaId: true,
          colaboradorId: true,
          data: true,
          atestadoId: true,
          aPrazo: true,
        },
      }),
      this.feriasPorDia(dias),
    ]);

    const chave = (dia: Date, id: string): string => `${dia.getTime()}|${id}`;
    const comBatida = new Set<string>();
    const comRetorno = new Set<string>();
    for (const b of batidas) {
      const d = inicioDoDia(b.data);
      for (const id of [b.pessoaId, b.colaboradorId]) {
        if (!id) continue;
        comBatida.add(chave(d, id));
        if (b.tipo === 'RETORNO_INTERVALO') comRetorno.add(chave(d, id));
      }
    }
    const comAtestado = new Set<string>();
    const comAPrazo = new Set<string>();
    for (const c of coberturas) {
      const d = inicioDoDia(c.data);
      for (const id of [c.pessoaId, c.colaboradorId]) {
        if (!id) continue;
        if (c.atestadoId) comAtestado.add(chave(d, id));
        if (c.aPrazo) comAPrazo.add(chave(d, id));
      }
    }

    const algum = (
      conjunto: Set<string>,
      dia: Date,
      ids: readonly (string | null)[],
    ) => ids.some((id) => !!id && conjunto.has(chave(dia, id)));

    return {
      para: (dia, ids) => {
        const d = inicioDoDia(dia);
        const deFerias = ids.some(
          (id) => !!id && (feriasPorDia.get(d.getTime())?.has(id) ?? false),
        );
        return {
          temBatida: algum(comBatida, d, ids),
          // "Fechou o intervalo" = existe batida de RETORNO_INTERVALO no dia. A
          // reclassificação do ponto mantém esse tipo coerente com a ordem das
          // batidas, então a presença do retorno é o sinal de que voltou.
          intervaloFechado: algum(comRetorno, d, ids),
          temAtestado: algum(comAtestado, d, ids),
          temAusenciaAPrazo: algum(comAPrazo, d, ids),
          deFerias,
          ehFolga: consultorFolga?.ehFolga(d, ids) ?? false,
        };
      },
    };
  }

  /** Colaboradores de férias em cada dia informado (vazio sem o serviço). */
  private async feriasPorDia(
    dias: readonly Date[],
  ): Promise<Map<number, Set<string>>> {
    const mapa = new Map<number, Set<string>>();
    if (!this.ferias) return mapa;
    for (const dia of dias) {
      const d = inicioDoDia(dia);
      try {
        mapa.set(d.getTime(), await this.ferias.colaboradoresDeFeriasNoDia(d));
      } catch {
        // Best-effort: sem a informação de férias, apenas não se usa esse motivo.
      }
    }
    return mapa;
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
    idsComFalta: ReadonlySet<string>,
  ): Promise<void> {
    if (!this.notificacoes) return;
    const minutos = minutosAposEntrada(escalado.entradaPrevista, agora);
    if (estadoSemBatida(minutos) !== 'ALERTA') return;

    // Já há ausência registrada para o dia (atestado, ausência a prazo ou falta
    // já lançada)? Então a pessoa NÃO era esperada, e avisar que ela "estava
    // escalada e não bateu ponto" é ruído — pior: com um atestado em mãos, o
    // aviso contradiz o próprio sistema. Mesma checagem de dupla chave que a
    // falta automática já fazia; este aviso não fazia nenhuma.
    const ids = [escalado.pessoaId, escalado.colaboradorId].filter(
      (id): id is string => !!id,
    );
    if (ids.some((id) => idsComFalta.has(id))) return;

    // Reserva a trava (uma por pessoa/dia). Se já existe, alguém já avisou hoje.
    //
    // Reserva sob AS DUAS identidades. A tabela é keyed só por `pessoaId`, então
    // uma pessoa com duas identidades de ponto (`Fiscal.id` + ficha) gerava duas
    // linhas distintas — e portanto DOIS avisos do mesmo atraso, um por chave.
    // Basta uma das reservas colidir para o aviso já ter saído: nesse caso não se
    // repete. Para operadores as duas chaves são iguais e nada muda (uma linha).
    const idsTrava = [
      ...new Set(ids), // pessoaId + colaboradorId, já sem nulos
    ];
    for (const pessoaId of idsTrava) {
      try {
        await this.prisma.alertaAtrasoEnviado.create({
          data: { pessoaId, dia },
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
    excluidas: ReadonlySet<string>,
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

    // O gestor já excluiu a falta deste dia: a decisão dele prevalece sobre a
    // detecção. Sem esta guarda, a card voltava sozinha no ciclo seguinte.
    if (ids.some((id) => excluidas.has(id))) return;

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
      // erro — só não marca.
      //
      // Duplicidade e FOLGA são silenciosas: são "não é caso de marcar", e este
      // método roda a cada 5 minutos — avisar sobre elas encheria o log com a
      // mesma linha o dia inteiro para a mesma pessoa. A guarda de folga aqui é
      // a última linha de defesa: quem está de folga já deveria ter ficado fora
      // de `escaladosDoDia`.
      const naoEhCasoDeMarcar =
        erro instanceof AusenciaDuplicadaError ||
        erro instanceof FaltaEmDiaDeFolgaError ||
        erro instanceof FiscalDeFolgaError;
      if (!naoEhCasoDeMarcar) {
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
    excluidas: ReadonlySet<string>,
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

    // O gestor já excluiu o não-retorno deste dia: não insiste.
    if (
      excluidas.has(escalado.colaboradorId) ||
      excluidas.has(escalado.pessoaId)
    ) {
      return;
    }

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
