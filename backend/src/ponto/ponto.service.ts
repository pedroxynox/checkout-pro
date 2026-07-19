import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { BatidaPonto, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  diaCivilBrasilia,
  diaEncerradoEmBrasilia,
  inicioDoDia,
} from '../common/datas';
import { UsuarioAutenticado } from '../common/decorators/usuario-atual.decorator';
import {
  type EtapaAlertaTac,
  INTERVALO_MAXIMO_MS,
  RegrasContrato,
  StatusJornadaPonto,
  TipoBatida,
  batidaDuplicada,
  calcularJornadaDia,
  classificarBatidas,
  etapaAlertaTac,
  statusFiscalDeJornada,
  statusFiscalDeTipoBatida,
} from './ponto.domain';
import { FiscaisService } from '../fiscais/fiscais.service';
import { StatusFiscal } from '../fiscais/fiscais.domain';
import { EditarBatidaDto, RegistrarBatidaDto } from './dto/ponto.dto';
import { PontoOcrService } from './ponto-ocr.service';
import { FUNCOES_PONTO_NAO_FISCAL } from './pessoas-ponto';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { FeriadosService } from '../feriados/feriados.service';
import { TiposContratoService } from '../tipos-contrato/tipos-contrato.service';
import { EscalaDomingoService } from '../escala-domingo/escala-domingo.service';
import { ehDiaDeFolga } from '../escala-domingo/escala-domingo.domain';
import { CicloFolhaService } from '../ciclo-folha/ciclo-folha.service';
import { ValidacaoDataService } from '../data-inicial/validacao-data.service';
import { mapearFiscalColaborador } from '../fiscais/colaborador-vinculo';
import {
  BatidaDuplicadaError,
  DataHoraPontoInvalidaError,
  HoraForaDoDiaError,
  HoraFuturaError,
  LimiteBatidasDiaError,
  PessoaPontoInativaError,
  PessoaPontoNaoEncontradaError,
  PontoEmFolgaError,
  RetornoAposLimiteIntervaloError,
} from './ponto.errors';

/** Transição de status do fiscal derivada de uma batida (em UTC real). */
type TransicaoFiscal = { status: StatusFiscal; em: Date };

// As batidas são gravadas com a HORA DO COMPROVANTE (hora de parede de Brasília)
// rotulada como UTC (ex.: "09:00" → "...T09:00:00Z"). Para medir o segmento
// "em curso" (quando falta a próxima batida) o "agora" precisa estar na MESMA
// referência de hora de parede de Brasília — senão o relógio conta 3h a mais
// (fuso UTC−3). O Brasil não tem horário de verão desde 2019, então o
// deslocamento é fixo.
const OFFSET_BRASILIA_MS = -3 * 60 * 60 * 1000;
function agoraNaBrasilia(): Date {
  return new Date(Date.now() + OFFSET_BRASILIA_MS);
}

/**
 * Sentido inverso do offset acima: a hora da batida está em Brasília rotulada
 * como Z, então somamos 3h para obter o instante em UTC real. Usado na ponte
 * batidas → status do fiscal, cujo `calcularJornada` usa `new Date()` real.
 */
const OFFSET_BRASILIA_PARA_UTC_MS = 3 * 60 * 60 * 1000;

/** Etapas de alerta em ordem crescente de gravidade. */
const ETAPAS_TAC_CRESCENTE: readonly EtapaAlertaTac[] = [
  'RISCO_1H30',
  'RISCO_1H40',
  'TAC',
];

/** Índice de gravidade de uma etapa (maior = mais grave); -1 quando nula. */
function ordemEtapa(etapa: EtapaAlertaTac | null): number {
  return etapa ? ETAPAS_TAC_CRESCENTE.indexOf(etapa) : -1;
}

/** Rótulo curto de uma etapa, para as mensagens de correção. */
function rotuloEtapa(etapa: EtapaAlertaTac): string {
  if (etapa === 'RISCO_1H30') return 'risco de TAC';
  if (etapa === 'RISCO_1H40') return 'risco alto de TAC';
  return 'TAC';
}

/** Uma batida como exibida ao app. */
export interface BatidaView {
  id: string;
  hora: string;
  tipo: TipoBatida;
  origem: string;
  registradoPorNome: string | null;
}

/** Jornada do dia (serializável) exposta ao app. */
export interface JornadaView {
  trabalhadoMs: number;
  intervaloMs: number;
  status: StatusJornadaPonto;
  baseMs: number;
  horasExtrasMs: number;
  horasExtras50Ms: number;
  horasExtras100Ms: number;
  alertaIminente: boolean;
  tac: boolean;
  motivosTac: string[];
  faltando: string[];
  /** Saiu para o intervalo e não voltou dentro do máximo do contrato. */
  naoRetornoIntervalo: boolean;
}

/** Resposta do dia: dados da pessoa, jornada calculada e batidas. */
export interface JornadaDiaResposta {
  pessoaId: string;
  tipoPessoa: string;
  data: string;
  jornada: JornadaView;
  batidas: BatidaView[];
}

/** Um evento da trilha de alertas de TAC (serializável). */
export interface EventoTacView {
  tipo: 'AVISADO' | 'CORRIGIDO' | 'REINCIDENTE';
  etapa: EtapaAlertaTac | null;
  motivos: string | null;
  em: string;
}

/** Histórico de alertas de TAC de uma pessoa num dia. */
export interface HistoricoTacResposta {
  pessoaId: string;
  data: string;
  eventos: EventoTacView[];
}

/** Pessoa selecionável para registrar o ponto. */
export interface PessoaPonto {
  id: string;
  nome: string;
  tipoPessoa: 'FISCAL' | 'OPERADOR';
  /** Ficha do Cadastro de Colaboradores (para não-fiscais); null p/ fiscais. */
  colaboradorId?: string | null;
}

/**
 * Registro de Ponto (leitor de comprovante) — Fase A.
 *
 * Grava as batidas do relógio físico (uma linha por batida), classifica-as
 * pela ordem cronológica do dia e calcula a jornada (delegando a matemática ao
 * domínio puro `ponto.domain`). A hora que vale é a do comprovante.
 */
@Injectable()
export class PontoService {
  /**
   * Anti-spam dos avisos de risco/TAC. Cada etapa é enviada no máximo uma vez
   * por pessoa/dia; chaves diferentes permitem a escalada 1h30 → 1h40 → TAC.
   *
   * A dedup DEFINITIVA é a tabela `AlertaTacEnviado` (índice único por
   * pessoa/dia/etapa), que sobrevive a reinícios e coordena múltiplas
   * instâncias. Estes dois conjuntos são apenas um cache em processo:
   * `alertasTacAvisados` evita ir ao banco quando a etapa já foi confirmada
   * nesta instância; `alertasTacEmEnvio` impede envio duplicado enquanto a
   * mesma etapa está sendo processada (batida e cron ao mesmo tempo).
   */
  private readonly alertasTacAvisados = new Set<string>();
  private readonly alertasTacEmEnvio = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly validacaoData: ValidacaoDataService,
    // Ponte batidas → status do fiscal. Opcional para não quebrar testes
    // unitários que exercitam só a persistência das batidas.
    @Optional() private readonly fiscais?: FiscaisService,
    // Memória do leitor (aprende "nome lido → pessoa"). Opcional pelo mesmo
    // motivo: testes unitários de persistência não precisam dela.
    @Optional() private readonly ocr?: PontoOcrService,
    // Aviso de TAC (supervisão/gerência) e feriados. Opcionais: os testes de
    // persistência das batidas não precisam deles.
    @Optional() private readonly notificacoes?: NotificacoesService,
    @Optional() private readonly feriados?: FeriadosService,
    // Rodízio de domingo (âncora do ciclo G1/G2/G3). Opcional: sem ele, o
    // bloqueio de folga em domingo só vale para quem está fora do rodízio.
    @Optional() private readonly escalaDomingo?: EscalaDomingoService,
    // Fechamento do ciclo de folha. Opcional: sem ele, não há bloqueio por
    // ciclo fechado (testes unitários de persistência não precisam dele).
    @Optional() private readonly cicloFolha?: CicloFolhaService,
    // Regras por tipo de contrato (data-driven). Opcional: sem ele, o cálculo
    // usa o contrato padrão (6x1), preservando o comportamento vigente.
    @Optional() private readonly tiposContrato?: TiposContratoService,
  ) {}

  /** Bloqueia a modificação quando o ciclo de folha da data está fechado. */
  private async exigirCicloAberto(data: Date): Promise<void> {
    if (this.cicloFolha) {
      await this.cicloFolha.exigirCicloAberto(data);
    }
  }

  /** Executa uma mutação de batidas com isolamento forte e retry de conflito. */
  private async transacaoSerializavel<T>(
    operacao: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let tentativa = 0; ; tentativa += 1) {
      try {
        return await this.prisma.$transaction(operacao, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (erro) {
        const conflitoSerializacao =
          erro instanceof Prisma.PrismaClientKnownRequestError &&
          erro.code === 'P2034';
        if (!conflitoSerializacao || tentativa >= 4) throw erro;
      }
    }
  }

  /**
   * Busca pessoas por nome para escolher de quem é o comprovante: fiscais (da
   * tabela Fiscal) + colaboradores não-fiscais ativos (operadores/supervisores)
   * do Cadastro de Colaboradores. Gerentes e desligados ficam de fora.
   */
  async buscarPessoas(busca?: string): Promise<PessoaPonto[]> {
    const termo = busca?.trim();
    const normalizarBusca = (valor: string): string =>
      valor
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR');
    const termoNormalizado = termo ? normalizarBusca(termo) : null;
    const whereColaborador: Prisma.ColaboradorWhereInput = {
      ativo: true,
      funcao: { in: FUNCOES_PONTO_NAO_FISCAL },
      ...(termo ? { nome: { contains: termo, mode: 'insensitive' } } : {}),
    };

    const [fiscais, usuarios, colaboradoresFiscais, colaboradores] =
      await Promise.all([
        this.prisma.fiscal.findMany({
          orderBy: { nome: 'asc' },
          select: { id: true, nome: true, usuarioId: true },
        }),
        this.prisma.usuario.findMany({ select: { id: true, login: true } }),
        this.prisma.colaborador.findMany({
          where: { ativo: true, funcao: 'FISCAL' },
          select: { id: true, nome: true, matricula: true, usuarioId: true },
        }),
        this.prisma.colaborador.findMany({
          where: whereColaborador,
          orderBy: { nome: 'asc' },
          take: 20,
        }),
      ]);

    // Fiscal só aparece quando possui uma ficha canônica ATIVA. O vínculo é o
    // mesmo usado pela Central/Jornada: conta compartilhada ou matrícula/login.
    const fiscalParaColaborador = mapearFiscalColaborador(
      fiscais,
      usuarios,
      colaboradoresFiscais,
    );
    const pessoas: PessoaPonto[] = [
      ...fiscais.flatMap((f) => {
        const vinculo = fiscalParaColaborador.get(f.id);
        if (!vinculo) return [];
        if (
          termoNormalizado &&
          !normalizarBusca(f.nome).includes(termoNormalizado) &&
          !normalizarBusca(vinculo.nome).includes(termoNormalizado)
        ) {
          return [];
        }
        return [
          {
            id: f.id,
            nome: vinculo.nome,
            tipoPessoa: 'FISCAL' as const,
            colaboradorId: vinculo.colaboradorId,
          },
        ];
      }),
      ...colaboradores.map((c) => ({
        id: c.id,
        nome: c.nome,
        tipoPessoa: 'OPERADOR' as const,
        colaboradorId: c.id,
      })),
    ];
    return pessoas.sort((a, b) => a.nome.localeCompare(b.nome)).slice(0, 20);
  }

  /** Valida a pessoa no servidor e devolve sua ficha canônica ativa. */
  private async colaboradorAtivoDaPessoa(
    pessoaId: string,
    tipoPessoa: 'FISCAL' | 'OPERADOR',
  ): Promise<string> {
    if (tipoPessoa === 'OPERADOR') {
      const colaborador = await this.prisma.colaborador.findUnique({
        where: { id: pessoaId },
        select: { id: true, ativo: true, funcao: true },
      });
      if (!colaborador) throw new PessoaPontoNaoEncontradaError();
      if (
        !colaborador.ativo ||
        !FUNCOES_PONTO_NAO_FISCAL.includes(colaborador.funcao)
      ) {
        throw new PessoaPontoInativaError();
      }
      return colaborador.id;
    }

    const fiscal = await this.prisma.fiscal.findUnique({
      where: { id: pessoaId },
      select: { id: true, usuarioId: true },
    });
    if (!fiscal) throw new PessoaPontoNaoEncontradaError();
    if (!fiscal.usuarioId) throw new PessoaPontoInativaError();

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: fiscal.usuarioId },
      select: { login: true },
    });
    // O vínculo direto por conta tem prioridade absoluta. A matrícula/login é
    // apenas fallback, como no helper canônico usado pela Central de Jornada.
    let colaborador = await this.prisma.colaborador.findFirst({
      where: {
        ativo: true,
        funcao: 'FISCAL',
        usuarioId: fiscal.usuarioId,
      },
      select: { id: true },
    });
    if (!colaborador && usuario?.login) {
      colaborador = await this.prisma.colaborador.findFirst({
        where: {
          ativo: true,
          funcao: 'FISCAL',
          matricula: {
            equals: usuario.login.trim(),
            mode: 'insensitive',
          },
        },
        select: { id: true },
      });
    }
    if (!colaborador) throw new PessoaPontoInativaError();
    return colaborador.id;
  }

  /**
   * Rejeita o registro de ponto quando o dia é FOLGA (descanso) da pessoa: dia
   * de folga fixo da semana (`folgaDiaSemana`) ou domingo de folga pelo rodízio
   * (`grupoDomingo` + âncora). Sem a ficha, não bloqueia (defensivo).
   */
  private async exigirDiaSemFolga(
    colaboradorId: string,
    dia: Date,
  ): Promise<void> {
    const ficha = await this.prisma.colaborador.findUnique({
      where: { id: colaboradorId },
      select: { folgaDiaSemana: true, grupoDomingo: true },
    });
    if (!ficha) return;
    // A âncora do rodízio só é necessária aos domingos; nos demais dias a folga
    // depende apenas de `folgaDiaSemana` (evita uma consulta desnecessária).
    const ancora =
      dia.getUTCDay() === 0 && this.escalaDomingo
        ? await this.escalaDomingo.obterAncora()
        : null;
    if (ehDiaDeFolga(ficha, dia, ancora)) {
      throw new PontoEmFolgaError();
    }
  }

  /** Converte uma data recebida internamente, protegendo chamadas sem DTO. */
  private dataValida(valor: string | Date): Date {
    const data = valor instanceof Date ? new Date(valor) : new Date(valor);
    if (Number.isNaN(data.getTime())) throw new DataHoraPontoInvalidaError();
    return data;
  }

  /** Garante que a hora pertence ao dia e não aponta para o futuro. */
  private validarHoraDoDia(dia: Date, hora: Date): void {
    if (inicioDoDia(hora).getTime() !== dia.getTime()) {
      throw new HoraForaDoDiaError();
    }
    if (hora.getTime() > agoraNaBrasilia().getTime()) {
      throw new HoraFuturaError();
    }
  }

  /**
   * Reenvio idempotente: se já existe uma batida com este `clienteId`, devolve
   * a jornada do dia dela (sem criar duplicata); null se ainda não existe.
   *
   * A idempotência só vale para o MESMO registro: um `clienteId` reutilizado
   * para OUTRA pessoa é uso indevido do cliente e é tratado como duplicata
   * (nunca devolve a jornada de outra pessoa por engano).
   */
  private async jornadaIdempotente(
    dto: RegistrarBatidaDto,
  ): Promise<JornadaDiaResposta | null> {
    if (!dto.clienteId) return null;
    const existente = await this.prisma.batidaPonto.findUnique({
      where: { clienteId: dto.clienteId },
      select: { pessoaId: true, tipoPessoa: true, data: true },
    });
    if (!existente) return null;
    if (
      existente.pessoaId !== dto.pessoaId ||
      existente.tipoPessoa !== (dto.tipoPessoa ?? 'FISCAL')
    ) {
      throw new BatidaDuplicadaError();
    }
    return this.jornadaDoDia(
      existente.pessoaId,
      existente.tipoPessoa,
      existente.data,
    );
  }

  /** Registra uma nova batida e devolve a jornada do dia recalculada. */
  async registrarBatida(
    dto: RegistrarBatidaDto,
    usuario: UsuarioAutenticado,
  ): Promise<JornadaDiaResposta> {
    // Idempotência: se esta batida já foi gravada antes (mesmo `clienteId`),
    // devolve a jornada existente sem criar duplicata (reenvio da fila offline).
    const idempotente = await this.jornadaIdempotente(dto);
    if (idempotente) return idempotente;
    const dia = inicioDoDia(this.dataValida(dto.data));
    const hora = this.dataValida(dto.hora);
    this.validarHoraDoDia(dia, hora);
    await this.validacaoData.exigirDataPermitida(dia);
    await this.exigirCicloAberto(dia);

    const tipoPessoa = dto.tipoPessoa ?? 'FISCAL';
    const colaboradorId = await this.colaboradorAtivoDaPessoa(
      dto.pessoaId,
      tipoPessoa,
    );
    // Bloqueia o fichaje em dia de folga (descanso) — folga fixa da semana ou
    // domingo de folga pelo rodízio. Fiscais e operadores usam o mesmo cadastro.
    await this.exigirDiaSemFolga(colaboradorId, dia);

    // Regras do contrato (para o limite de intervalo). Sem serviço, usa o padrão.
    const regras = this.tiposContrato
      ? await this.tiposContrato.regrasDoColaborador(colaboradorId)
      : undefined;
    const maxIntervaloMs = regras?.intervaloMaximoMs ?? INTERVALO_MAXIMO_MS;
    const dadosBatida: Prisma.BatidaPontoUncheckedCreateInput = {
      clienteId: dto.clienteId ?? null,
      pessoaId: dto.pessoaId,
      tipoPessoa,
      colaboradorId,
      data: dia,
      hora,
      // Tipo provisório — a mesma transação ajusta toda a ordem do dia.
      tipo: 'ENTRADA',
      origem: dto.origem ?? 'MANUAL',
      confianca: dto.confianca ?? null,
      comprovanteUrl: dto.comprovanteUrl ?? null,
      registradoPor: usuario.sub,
      registradoPorNome: usuario.nome ?? null,
    };

    // Uma única operação atômica (SERIALIZABLE): ler o dia, validar limite e
    // duplicidade, gravar, reordenar e reescrever o log do fiscal. Se duas
    // solicitações disputarem a mesma vaga/horário, o PostgreSQL aborta uma
    // delas (P2034); no retry ela já vê o estado atualizado e é recusada,
    // então nunca há 5ª batida nem duplicada persistida. A publicação em tempo
    // real e os avisos ficam FORA da transação (efeitos externos, pós-commit).
    let transicoes: TransicaoFiscal[] | null;
    let eraPrimeira: boolean;
    try {
      ({ transicoes, eraPrimeira } = await this.transacaoSerializavel(
        async (tx) => {
          const batidasDoDia = await tx.batidaPonto.findMany({
            where: { pessoaId: dto.pessoaId, tipoPessoa, data: dia },
            select: { hora: true },
          });
          if (batidasDoDia.length >= 4) throw new LimiteBatidasDiaError();
          if (
            batidaDuplicada(
              hora.getTime(),
              batidasDoDia.map((b) => b.hora.getTime()),
            )
          ) {
            throw new BatidaDuplicadaError();
          }

          // Bloqueia o RETORNO do intervalo depois do máximo (3h no 6x1): se
          // esta batida, uma vez ordenada no dia, vira o retorno do intervalo e
          // o intervalo já ultrapassou o limite, a pessoa é tratada como
          // "não retorno" — o retorno é recusado (o dia fica como não retorno).
          const classificadasComNova = classificarBatidas(
            [...batidasDoDia, { hora }].map((b, i) => ({
              id: String(i),
              hora: b.hora,
            })),
            regras?.maxTrabalhoSemIntervaloMs,
            regras?.intervaloObrigatorio ?? false,
          );
          const saidaIntervalo = classificadasComNova.find(
            (c) => c.tipo === 'SAIDA_INTERVALO',
          );
          const retornoIntervalo = classificadasComNova.find(
            (c) => c.tipo === 'RETORNO_INTERVALO',
          );
          if (
            saidaIntervalo &&
            retornoIntervalo &&
            retornoIntervalo.hora.getTime() === hora.getTime() &&
            retornoIntervalo.hora.getTime() - saidaIntervalo.hora.getTime() >
              maxIntervaloMs
          ) {
            throw new RetornoAposLimiteIntervaloError();
          }

          await tx.batidaPonto.create({ data: dadosBatida });
          await this.reclassificarNoCliente(tx, dto.pessoaId, tipoPessoa, dia);
          const transicoesFiscal = await this.sincronizarFiscalNoCliente(
            tx,
            dto.pessoaId,
            tipoPessoa,
            dia,
          );
          return {
            transicoes: transicoesFiscal,
            eraPrimeira: batidasDoDia.length === 0,
          };
        },
      ));
    } catch (erro) {
      // Corrida de idempotência: outro reenvio concorrente do mesmo `clienteId`
      // gravou a batida primeiro (viola o índice único). Não é duplicata: devolve
      // a jornada já existente em vez de propagar o erro.
      if (
        dto.clienteId &&
        erro instanceof Prisma.PrismaClientKnownRequestError &&
        erro.code === 'P2002'
      ) {
        const idempotenteAposCorrida = await this.jornadaIdempotente(dto);
        if (idempotenteAposCorrida) return idempotenteAposCorrida;
      }
      throw erro;
    }
    // Aprende o vínculo "nome lido → pessoa" quando a batida veio do leitor,
    // para reconhecer a pessoa na hora nas próximas leituras. Best-effort: uma
    // falha aqui não deve impedir o registro da batida.
    if (dto.origem === 'LEITOR' && dto.nomeLido) {
      await this.aprenderAlias({ ...dto, colaboradorId }, tipoPessoa);
    }
    await this.publicarStatusFiscal(dto.pessoaId, transicoes);
    // A pessoa bateu ponto: se havia uma FALTA AUTOMÁTICA (lançada pela
    // detecção do Relógio Ponto porque ela ainda não tinha registrado), ela é
    // removida — a pessoa veio trabalhar. Faltas manuais do gestor permanecem
    // (só notificamos o conflito). Best-effort: nunca trava a batida.
    if (eraPrimeira) {
      await this.removerFaltaAutomaticaAoFichar(dto.pessoaId, colaboradorId);
      // Detecta o cruzamento ponto ↔ ausência (falta MANUAL): avisa a
      // supervisão uma vez, na primeira batida do dia. Não bloqueia.
      await this.avisarConflitoAusenciaSeNecessario(
        dto.pessoaId,
        colaboradorId,
        tipoPessoa,
        dia,
      );
    }
    const resposta = await this.jornadaDoDia(dto.pessoaId, tipoPessoa, dia);
    // Status ao vivo do OPERADOR no painel da escala (tempo real): quando um
    // operador bate ponto, propagamos o status derivado da jornada pelo mesmo
    // canal WebSocket dos fiscais. Fiscais já são cobertos por
    // `publicarStatusFiscal` acima. Best-effort: nunca trava a batida.
    if (tipoPessoa === 'OPERADOR' && colaboradorId && this.fiscais) {
      try {
        await this.fiscais.publicarStatusColaborador(
          colaboradorId,
          statusFiscalDeJornada(resposta.jornada.status),
        );
      } catch {
        // best-effort: o painel se atualiza na reconsulta periódica.
      }
    }
    // Avisa a supervisão/gerência ao entrar em risco de TAC ou em TAC.
    await this.avisarAlertaTacSeNecessario(
      dto.pessoaId,
      tipoPessoa,
      dia,
      resposta,
    );
    return resposta;
  }

  /**
   * Avisa a supervisão e a gerência nas etapas 1h30, 1h40 e TAC. Cada etapa é
   * enviada no máximo uma vez por pessoa/dia. Se a jornada saltar diretamente
   * para uma etapa maior, envia somente a etapa atual e marca as inferiores
   * como consumidas. Best-effort: uma falha nunca trava a batida.
   *
   * A não-repetição é garantida pela tabela `AlertaTacEnviado`: reservamos a
   * etapa atual com um INSERT (o índice único é a trava atômica) e só então
   * enviamos. Como o registro é persistente, um reinício do servidor ou uma
   * segunda instância não reenviam a mesma etapa. Se o envio falhar, a reserva
   * é liberada para o próximo ciclo tentar de novo.
   *
   * Também é chamado pelo verificador periódico, para avisar enquanto a pessoa
   * continua trabalhando sem precisar aguardar a próxima batida.
   */
  async avisarAlertaTacSeNecessario(
    pessoaId: string,
    tipoPessoa: 'FISCAL' | 'OPERADOR',
    dia: Date,
    resposta: JornadaDiaResposta,
  ): Promise<void> {
    if (!this.notificacoes) return;

    const chaveDia = dia.toISOString();
    const etapa = etapaAlertaTac(
      resposta.jornada.horasExtrasMs,
      resposta.jornada.tac,
    );
    if (!etapa) return;

    const etapasConsumidas: EtapaAlertaTac[] =
      etapa === 'TAC'
        ? ['RISCO_1H30', 'RISCO_1H40', 'TAC']
        : etapa === 'RISCO_1H40'
          ? ['RISCO_1H30', 'RISCO_1H40']
          : ['RISCO_1H30'];
    const chavesConsumidas = etapasConsumidas.map(
      (etapaConsumida) => `${pessoaId}:${chaveDia}:${etapaConsumida}`,
    );
    const chaveAtual = chavesConsumidas[chavesConsumidas.length - 1];

    // Cache em processo: já confirmada ou em envio nesta instância.
    if (
      this.alertasTacAvisados.has(chaveAtual) ||
      this.alertasTacEmEnvio.has(chaveAtual)
    ) {
      return;
    }

    // Reserva atômica no banco (sobrevive a reinícios e coordena instâncias).
    const reserva = await this.reservarEtapaTac(pessoaId, dia, etapa);
    if (reserva === 'JA_ENVIADO') {
      for (const chave of chavesConsumidas) {
        this.alertasTacAvisados.add(chave);
      }
      return;
    }

    for (const chave of chavesConsumidas) {
      this.alertasTacEmEnvio.add(chave);
    }

    try {
      const nome = await this.nomeDaPessoa(pessoaId, tipoPessoa);
      const conteudo = this.conteudoAlertaTac(nome, etapa, resposta);
      await this.notificacoes.notificarSupervisaoEGerencia(conteudo);
      // Envio confirmado: persiste também as etapas inferiores consumidas para
      // que não sejam reenviadas em ciclos futuros (idempotente).
      if (reserva === 'RESERVADO') {
        await this.registrarEtapasConsumidas(pessoaId, dia, etapasConsumidas);
      }
      // Trilha para a supervisão: um novo excesso avisado DEPOIS de uma
      // correção no mesmo dia é uma reincidência (situação nova de verdade).
      await this.registrarEventoAvisado(
        pessoaId,
        dia,
        etapa,
        resposta.jornada.motivosTac,
      );
      for (const chave of chavesConsumidas) {
        this.alertasTacAvisados.add(chave);
      }
    } catch {
      // Envio falhou: libera a reserva para o próximo ciclo tentar de novo.
      // (Só quando fomos nós que reservamos; sem reserva não há o que liberar.)
      if (reserva === 'RESERVADO') {
        await this.liberarEtapaTac(pessoaId, dia, etapa);
      }
    } finally {
      for (const chave of chavesConsumidas) {
        this.alertasTacEmEnvio.delete(chave);
      }
    }
  }

  /**
   * Tenta reservar a etapa atual gravando uma linha em `AlertaTacEnviado`. O
   * índice único (pessoa/dia/etapa) transforma o INSERT numa trava atômica:
   * - `RESERVADO`: gravamos agora, então somos responsáveis por enviar;
   * - `JA_ENVIADO`: o índice recusou (P2002), outra batida/instância já cuidou;
   * - `INDISPONIVEL`: o banco falhou — segue-se com o cache em memória para não
   *   perder o aviso (pode reenviar após reinício, como no comportamento antigo).
   */
  private async reservarEtapaTac(
    pessoaId: string,
    dia: Date,
    etapa: EtapaAlertaTac,
  ): Promise<'RESERVADO' | 'JA_ENVIADO' | 'INDISPONIVEL'> {
    try {
      await this.prisma.alertaTacEnviado.create({
        data: { pessoaId, dia, etapa },
      });
      return 'RESERVADO';
    } catch (erro) {
      if (
        erro instanceof Prisma.PrismaClientKnownRequestError &&
        erro.code === 'P2002'
      ) {
        return 'JA_ENVIADO';
      }
      return 'INDISPONIVEL';
    }
  }

  /** Persiste as etapas inferiores consumidas (idempotente). Best-effort. */
  private async registrarEtapasConsumidas(
    pessoaId: string,
    dia: Date,
    etapas: EtapaAlertaTac[],
  ): Promise<void> {
    try {
      await this.prisma.alertaTacEnviado.createMany({
        data: etapas.map((etapa) => ({ pessoaId, dia, etapa })),
        skipDuplicates: true,
      });
    } catch {
      // Best-effort: a etapa atual já está reservada; as inferiores são um
      // reforço para não reenviar avisos menores depois.
    }
  }

  /** Libera a reserva de uma etapa quando o envio falhou. Best-effort. */
  private async liberarEtapaTac(
    pessoaId: string,
    dia: Date,
    etapa: EtapaAlertaTac,
  ): Promise<void> {
    try {
      await this.prisma.alertaTacEnviado.deleteMany({
        where: { pessoaId, dia, etapa },
      });
    } catch {
      // Best-effort: se não conseguir liberar, o pior caso é não reenviar esta
      // etapa preventiva; nunca trava a batida.
    }
  }

  /**
   * Grava na trilha (`EventoAlertaTac`) que um aviso foi enviado. Se já houve um
   * CORRIGIDO neste dia, registra como REINCIDENTE (novo excesso real) em vez de
   * AVISADO. Best-effort: a trilha nunca deve travar o aviso.
   */
  private async registrarEventoAvisado(
    pessoaId: string,
    dia: Date,
    etapa: EtapaAlertaTac,
    motivos: string[],
  ): Promise<void> {
    try {
      const corrigidoAntes = await this.prisma.eventoAlertaTac.findFirst({
        where: { pessoaId, dia, tipo: 'CORRIGIDO' },
        select: { id: true },
      });
      await this.prisma.eventoAlertaTac.create({
        data: {
          pessoaId,
          dia,
          tipo: corrigidoAntes ? 'REINCIDENTE' : 'AVISADO',
          etapa,
          motivos: motivos.length > 0 ? motivos.join('; ') : null,
        },
      });
    } catch {
      // Best-effort: a trilha é um complemento; sua falha nunca afeta o aviso.
    }
  }

  /**
   * Reavalia o alerta de TAC depois de uma correção/exclusão de batida.
   *
   * Se a jornada saiu de uma etapa que JÁ tinha sido avisada (a correção
   * resolveu o excesso), então: (1) libera a reserva das etapas acima da atual
   * em `AlertaTacEnviado`, para que um novo excesso futuro possa ser avisado de
   * novo; (2) grava um evento CORRIGIDO na trilha; (3) avisa a supervisão de que
   * a jornada foi corrigida. Se a correção NÃO reduziu a etapa, não faz nada
   * aqui (o `avisarAlertaTacSeNecessario` chamado em seguida cuida de avisar uma
   * etapa mais grave, se for o caso). Best-effort em todas as escritas.
   */
  private async reavaliarAlertaTacAposCorrecao(
    pessoaId: string,
    tipoPessoa: 'FISCAL' | 'OPERADOR',
    dia: Date,
    resposta: JornadaDiaResposta,
  ): Promise<void> {
    const etapaAtual = etapaAlertaTac(
      resposta.jornada.horasExtrasMs,
      resposta.jornada.tac,
    );

    let enviados: { etapa: EtapaAlertaTac }[];
    try {
      enviados = await this.prisma.alertaTacEnviado.findMany({
        where: { pessoaId, dia },
        select: { etapa: true },
      });
    } catch {
      return; // Sem acesso ao banco não há como reavaliar.
    }

    const maiorEnviada = enviados.reduce<EtapaAlertaTac | null>(
      (maior, { etapa }) =>
        ordemEtapa(etapa) > ordemEtapa(maior) ? etapa : maior,
      null,
    );
    // Só é "correção" se antes avisamos uma etapa que agora não vale mais.
    if (!maiorEnviada || ordemEtapa(etapaAtual) >= ordemEtapa(maiorEnviada)) {
      return;
    }

    const etapasLiberadas = ETAPAS_TAC_CRESCENTE.filter(
      (e) => ordemEtapa(e) > ordemEtapa(etapaAtual),
    );
    const chaveDia = dia.toISOString();
    for (const e of etapasLiberadas) {
      this.alertasTacAvisados.delete(`${pessoaId}:${chaveDia}:${e}`);
      this.alertasTacEmEnvio.delete(`${pessoaId}:${chaveDia}:${e}`);
    }
    try {
      await this.prisma.alertaTacEnviado.deleteMany({
        where: { pessoaId, dia, etapa: { in: etapasLiberadas } },
      });
    } catch {
      // Best-effort: se não liberar, no pior caso não reavisa uma reincidência.
    }
    // A jornada continua numa etapa menor (etapaAtual) — que já foi
    // necessariamente atingida antes (a escalada é monotônica). Garante a
    // reserva dela e das inferiores para que o `avisarAlertaTacSeNecessario`
    // seguinte NÃO a trate como um novo excesso e a marque como REINCIDENTE por
    // engano (borda de reinício em que a reserva inferior se perdeu).
    if (etapaAtual) {
      const etapasMantidas = ETAPAS_TAC_CRESCENTE.filter(
        (e) => ordemEtapa(e) <= ordemEtapa(etapaAtual),
      );
      await this.registrarEtapasConsumidas(pessoaId, dia, etapasMantidas);
      const chaveDia = dia.toISOString();
      for (const e of etapasMantidas) {
        this.alertasTacAvisados.add(`${pessoaId}:${chaveDia}:${e}`);
      }
    }
    try {
      await this.prisma.eventoAlertaTac.create({
        data: { pessoaId, dia, tipo: 'CORRIGIDO', etapa: maiorEnviada },
      });
    } catch {
      // Best-effort: a trilha é um complemento.
    }
    if (this.notificacoes) {
      try {
        const nome = await this.nomeDaPessoa(pessoaId, tipoPessoa);
        // Título fiel à etapa resolvida: só é "TAC corrigido" quando o que
        // caiu era o próprio TAC; um risco resolvido não vira "TAC".
        const titulo =
          maiorEnviada === 'TAC'
            ? '✅ TAC corrigido'
            : '✅ Risco de TAC resolvido';
        await this.notificacoes.notificarSupervisaoEGerencia({
          titulo,
          mensagem: `A jornada de ${nome} foi corrigida e não está mais em ${rotuloEtapa(maiorEnviada)}.`,
        });
      } catch {
        // Best-effort: avisar a correção nunca deve travar a edição.
      }
    }
  }

  /**
   * Histórico de alertas de TAC de uma pessoa num dia (trilha para a gestão):
   * risco/TAC avisado, jornada corrigida e novo excesso, em ordem cronológica.
   */
  async historicoTac(
    pessoaId: string,
    data: Date,
  ): Promise<HistoricoTacResposta> {
    // Valida a data como no resto do módulo: uma data inválida vira 400 (e não
    // um 500 ao chegar como `Invalid Date` na consulta do Prisma).
    if (Number.isNaN(data.getTime())) {
      throw new DataHoraPontoInvalidaError();
    }
    const dia = inicioDoDia(data);
    const eventos = await this.prisma.eventoAlertaTac.findMany({
      where: { pessoaId, dia },
      // Desempate estável por `id` para uma ordem determinística quando dois
      // eventos compartilham o mesmo instante (`em`, precisão de ms).
      orderBy: [{ em: 'asc' }, { id: 'asc' }],
    });
    return {
      pessoaId,
      data: dia.toISOString(),
      eventos: eventos.map((e) => ({
        tipo: e.tipo,
        etapa: e.etapa,
        motivos: e.motivos,
        em: e.em.toISOString(),
      })),
    };
  }

  private conteudoAlertaTac(
    nome: string,
    etapa: EtapaAlertaTac,
    resposta: JornadaDiaResposta,
  ): { titulo: string; mensagem: string } {
    if (etapa === 'RISCO_1H30') {
      return {
        titulo: '⚠️ Risco de TAC',
        mensagem: `${nome} atingiu 1h30 de horas extras hoje. Faltam 20 minutos para o limite de TAC.`,
      };
    }
    if (etapa === 'RISCO_1H40') {
      return {
        titulo: '⚠️ Risco alto de TAC',
        mensagem: `${nome} atingiu 1h40 de horas extras hoje. Faltam 10 minutos para o limite de TAC.`,
      };
    }
    return {
      titulo: '⚠️ TAC na jornada',
      mensagem: `${nome} está em situação de TAC hoje: ${resposta.jornada.motivosTac.join('; ')}.`,
    };
  }

  /** Primeiro nome da pessoa (fiscal ou colaborador) para os avisos. */
  private async nomeDaPessoa(
    pessoaId: string,
    tipoPessoa: 'FISCAL' | 'OPERADOR',
  ): Promise<string> {
    let nome: string | null = null;
    if (tipoPessoa === 'FISCAL') {
      const f = await this.prisma.fiscal.findUnique({
        where: { id: pessoaId },
        select: { nome: true },
      });
      nome = f?.nome ?? null;
    } else {
      const c = await this.prisma.colaborador.findUnique({
        where: { id: pessoaId },
        select: { nome: true },
      });
      nome = c?.nome ?? null;
    }
    return (nome ?? 'Colaborador').trim().split(/\s+/)[0];
  }

  /**
   * Avisa a supervisão/gerência quando uma batida cai num dia que já tem uma
   * ausência (falta/atestado/permesso) marcada para a mesma pessoa — um
   * conflito a resolver. Best-effort: uma falha nunca trava o registro.
   *
   * A ausência é buscada tanto pela identidade da batida (`pessoaId`, que para
   * fiscal é o Fiscal.id) quanto pela ficha (`colaboradorId`), cobrindo os dois
   * jeitos de a falta ter sido lançada.
   */
  /**
   * Remove a FALTA AUTOMÁTICA do dia quando a pessoa bate ponto (ela veio
   * trabalhar). Apaga somente as ausências marcadas como `automatica` —
   * lançadas pela detecção do Relógio Ponto — do dia atual (Brasília), tanto
   * pela identidade da batida (`pessoaId`, que para fiscal é o Fiscal.id)
   * quanto pela ficha (`colaboradorId`). As faltas MANUAIS do gestor NÃO são
   * tocadas. Best-effort: uma falha nunca trava o registro da batida.
   */
  private async removerFaltaAutomaticaAoFichar(
    pessoaId: string,
    colaboradorId: string,
  ): Promise<void> {
    try {
      const dia = diaCivilBrasilia(new Date());
      await this.prisma.ausencia.deleteMany({
        where: {
          data: dia,
          automatica: true,
          pessoaId: { in: [pessoaId, colaboradorId] },
        },
      });
    } catch {
      // Best-effort: se não conseguir remover, o gestor pode fazê-lo à mão.
    }
  }

  private async avisarConflitoAusenciaSeNecessario(
    pessoaId: string,
    colaboradorId: string,
    tipoPessoa: 'FISCAL' | 'OPERADOR',
    dia: Date,
  ): Promise<void> {
    if (!this.notificacoes) return;
    try {
      const ausencia = await this.prisma.ausencia.findFirst({
        where: { data: dia, pessoaId: { in: [pessoaId, colaboradorId] } },
        select: { id: true },
      });
      if (!ausencia) return;
      const nome = await this.nomeDaPessoa(pessoaId, tipoPessoa);
      const dd = String(dia.getUTCDate()).padStart(2, '0');
      const mm = String(dia.getUTCMonth() + 1).padStart(2, '0');
      await this.notificacoes.notificarSupervisaoEGerencia({
        titulo: '⚠️ Conflito: ponto e falta no mesmo dia',
        mensagem: `${nome} registrou ponto em ${dd}/${mm}, mas também tem uma ausência marcada nesse dia. Verifique qual está correta.`,
      });
    } catch {
      // Best-effort: a detecção do conflito nunca deve travar a batida.
    }
  }

  /** Memoriza "nome lido → pessoa" (best-effort) para o leitor aprender. */
  private async aprenderAlias(
    dto: RegistrarBatidaDto,
    tipoPessoa: 'FISCAL' | 'OPERADOR',
  ): Promise<void> {
    if (!this.ocr || !dto.nomeLido) return;
    try {
      // Resolve o nome oficial da pessoa (o alias guarda o nome de exibição).
      // Fiscais vêm da tabela Fiscal; os demais, do Cadastro de Colaboradores.
      let nome: string | null = null;
      let colaboradorId = dto.colaboradorId ?? null;
      if (tipoPessoa === 'FISCAL') {
        const fiscal = await this.prisma.fiscal.findUnique({
          where: { id: dto.pessoaId },
        });
        nome = fiscal?.nome ?? null;
      } else {
        const id = dto.colaboradorId ?? dto.pessoaId;
        const colaborador = await this.prisma.colaborador.findUnique({
          where: { id },
        });
        nome = colaborador?.nome ?? null;
        colaboradorId = colaborador?.id ?? colaboradorId;
      }
      if (!nome) return;
      await this.ocr.aprenderAlias(dto.nomeLido, {
        pessoaId: dto.pessoaId,
        tipoPessoa,
        colaboradorId,
        nome,
      });
    } catch {
      // Aprendizado é um "extra"; ignorar falhas para não travar a batida.
    }
  }

  /** Corrige uma batida (hora e/ou tipo) e recalcula. */
  async editarBatida(
    id: string,
    dto: EditarBatidaDto,
  ): Promise<JornadaDiaResposta> {
    const batida = await this.buscarOuFalhar(id);
    await this.validacaoData.exigirDataPermitida(batida.data);
    await this.exigirCicloAberto(batida.data);

    const data: Prisma.BatidaPontoUpdateInput = { origem: 'EDITADO' };
    if (dto.hora) {
      const hora = this.dataValida(dto.hora);
      this.validarHoraDoDia(inicioDoDia(batida.data), hora);
      data.hora = hora;
    }
    if (dto.tipo) data.tipo = dto.tipo;
    // Operação atômica: aplica a correção, valida duplicidade, reordena (só se
    // a hora mudou, para não sobrescrever um tipo corrigido à mão) e reescreve
    // o log do fiscal na mesma transação.
    const transicoes = await this.transacaoSerializavel(async (tx) => {
      await tx.batidaPonto.update({ where: { id }, data });
      if (dto.hora) {
        const horaCorrigida = this.dataValida(dto.hora);
        const outras = await tx.batidaPonto.findMany({
          where: {
            pessoaId: batida.pessoaId,
            tipoPessoa: batida.tipoPessoa,
            data: inicioDoDia(batida.data),
            id: { not: id },
          },
          select: { hora: true },
        });
        if (
          batidaDuplicada(
            horaCorrigida.getTime(),
            outras.map((b) => b.hora.getTime()),
          )
        ) {
          throw new BatidaDuplicadaError();
        }
        await this.reclassificarNoCliente(
          tx,
          batida.pessoaId,
          batida.tipoPessoa,
          batida.data,
        );
      }
      return this.sincronizarFiscalNoCliente(
        tx,
        batida.pessoaId,
        batida.tipoPessoa,
        batida.data,
      );
    });
    await this.publicarStatusFiscal(batida.pessoaId, transicoes);
    const resposta = await this.jornadaDoDia(
      batida.pessoaId,
      batida.tipoPessoa,
      batida.data,
    );
    await this.recalcularAlertaTacAposEdicao(
      batida.pessoaId,
      batida.tipoPessoa,
      inicioDoDia(batida.data),
      resposta,
    );
    return resposta;
  }

  /** Remove uma batida e reclassifica o dia. */
  async removerBatida(id: string): Promise<JornadaDiaResposta> {
    const batida = await this.buscarOuFalhar(id);
    await this.validacaoData.exigirDataPermitida(batida.data);
    await this.exigirCicloAberto(batida.data);
    const transicoes = await this.transacaoSerializavel(async (tx) => {
      await tx.batidaPonto.delete({ where: { id } });
      await this.reclassificarNoCliente(
        tx,
        batida.pessoaId,
        batida.tipoPessoa,
        batida.data,
      );
      return this.sincronizarFiscalNoCliente(
        tx,
        batida.pessoaId,
        batida.tipoPessoa,
        batida.data,
      );
    });
    await this.publicarStatusFiscal(batida.pessoaId, transicoes);
    const resposta = await this.jornadaDoDia(
      batida.pessoaId,
      batida.tipoPessoa,
      batida.data,
    );
    await this.recalcularAlertaTacAposEdicao(
      batida.pessoaId,
      batida.tipoPessoa,
      inicioDoDia(batida.data),
      resposta,
    );
    return resposta;
  }

  /**
   * Recalcula os avisos de TAC depois de corrigir/excluir uma batida: primeiro
   * detecta a correção (saiu de uma etapa antes avisada → marca CORRIGIDO e
   * libera para reavisar), depois avisa se a correção agravou a jornada para
   * uma etapa ainda não comunicada. Best-effort: nunca trava a edição.
   */
  private async recalcularAlertaTacAposEdicao(
    pessoaId: string,
    tipoPessoa: 'FISCAL' | 'OPERADOR',
    dia: Date,
    resposta: JornadaDiaResposta,
  ): Promise<void> {
    await this.reavaliarAlertaTacAposCorrecao(
      pessoaId,
      tipoPessoa,
      dia,
      resposta,
    );
    await this.avisarAlertaTacSeNecessario(pessoaId, tipoPessoa, dia, resposta);
  }

  /** Batidas + jornada calculada de um dia. */
  async jornadaDoDia(
    pessoaId: string,
    tipoPessoa: string,
    data: Date,
  ): Promise<JornadaDiaResposta> {
    const dia = inicioDoDia(data);
    const batidas = await this.prisma.batidaPonto.findMany({
      where: {
        pessoaId,
        tipoPessoa: tipoPessoa as 'FISCAL' | 'OPERADOR',
        data: dia,
      },
      orderBy: { hora: 'asc' },
    });
    // Feriado segue a regra do domingo (base 7h20 + 100%). Best-effort: sem o
    // serviço de feriados (ex.: teste unitário), trata como dia normal.
    const ehFeriado = this.feriados
      ? await this.feriados.ehFeriado(dia)
      : false;
    const agora = agoraNaBrasilia();
    // Regras do contrato do colaborador (o colaboradorId vem das batidas do
    // dia). Sem o serviço, `regras` fica indefinido e o cálculo usa o padrão.
    const colaboradorId =
      batidas.find((b) => b.colaboradorId)?.colaboradorId ?? null;
    const regras = this.tiposContrato
      ? await this.tiposContrato.regrasDoColaborador(colaboradorId)
      : undefined;
    const j = calcularJornadaDia(
      batidas.map((b) => ({ id: b.id, hora: b.hora })),
      agora,
      dia.getUTCDay(),
      ehFeriado,
      diaEncerradoEmBrasilia(dia, agora),
      regras,
    );
    return {
      pessoaId,
      tipoPessoa,
      data: dia.toISOString(),
      jornada: {
        trabalhadoMs: j.trabalhadoMs,
        intervaloMs: j.intervaloMs,
        status: j.status,
        baseMs: j.baseMs,
        horasExtrasMs: j.horasExtrasMs,
        horasExtras50Ms: j.horasExtras50Ms,
        horasExtras100Ms: j.horasExtras100Ms,
        alertaIminente: j.alertaIminente,
        tac: j.tac,
        motivosTac: j.motivosTac,
        faltando: j.faltando,
        naoRetornoIntervalo: j.naoRetornoIntervalo,
      },
      batidas: batidas.map((b) => ({
        id: b.id,
        hora: b.hora.toISOString(),
        tipo:
          j.batidas.find((classificada) => classificada.id === b.id)?.tipo ??
          (b.tipo as TipoBatida),
        origem: b.origem,
        registradoPorNome: b.registradoPorNome,
      })),
    };
  }

  /** Reatribui o tipo das batidas pela ordem usando o cliente transacional. */
  /**
   * Regras de jornada do contrato do colaborador dono das batidas do dia (ou
   * `undefined` quando não há serviço de contratos → usa o padrão). Usado para
   * classificar corretamente (encerramento corrido x saída para intervalo).
   */
  private async regrasDaPessoa(
    batidas: readonly { colaboradorId: string | null }[],
  ): Promise<RegrasContrato | undefined> {
    if (!this.tiposContrato) return undefined;
    const colaboradorId =
      batidas.find((b) => b.colaboradorId)?.colaboradorId ?? null;
    return this.tiposContrato.regrasDoColaborador(colaboradorId);
  }

  private async reclassificarNoCliente(
    cliente: Prisma.TransactionClient,
    pessoaId: string,
    tipoPessoa: 'FISCAL' | 'OPERADOR',
    data: Date,
  ): Promise<void> {
    const dia = inicioDoDia(data);
    const batidas = await cliente.batidaPonto.findMany({
      where: { pessoaId, tipoPessoa, data: dia },
      orderBy: { hora: 'asc' },
    });
    // A classificação (2 batidas = encerramento corrido ou saída para intervalo)
    // depende do contrato do colaborador (intervalo obrigatório ou não).
    const regras = await this.regrasDaPessoa(batidas);
    const classificadas = classificarBatidas(
      batidas.map((b) => ({ id: b.id, hora: b.hora })),
      regras?.maxTrabalhoSemIntervaloMs,
      regras?.intervaloObrigatorio ?? false,
    );
    for (const classificada of classificadas) {
      const original = batidas.find((b) => b.id === classificada.id);
      if (original && original.tipo !== classificada.tipo) {
        await cliente.batidaPonto.update({
          where: { id: classificada.id },
          data: { tipo: classificada.tipo },
        });
      }
    }
  }

  /**
   * Ponte batidas → status do fiscal, DENTRO da transação. Só para pessoas do
   * tipo FISCAL: converte as batidas do dia (já reordenadas) em transições de
   * status (DISPONIVEL/INTERVALO/FORA_EXPEDIENTE) e reescreve o log de fiscais
   * desse dia usando o mesmo cliente transacional. Assim o painel, o perfil e
   * os avisos — que leem `RegistroPontoFiscal` — refletem exatamente as
   * batidas, sem estados parciais. Devolve as transições para a publicação em
   * tempo real ser feita só após o commit (ou null quando não há ponte).
   *
   * A hora da batida é horário de Brasília rotulado Z; somamos 3h para gravar o
   * instante em UTC real, alinhado ao `new Date()` usado no cálculo de jornada.
   */
  private async sincronizarFiscalNoCliente(
    cliente: Prisma.TransactionClient,
    pessoaId: string,
    tipoPessoa: 'FISCAL' | 'OPERADOR',
    data: Date,
  ): Promise<TransicaoFiscal[] | null> {
    if (tipoPessoa !== 'FISCAL' || !this.fiscais) return null;

    const dia = inicioDoDia(data);
    const batidas = await cliente.batidaPonto.findMany({
      where: { pessoaId, tipoPessoa: 'FISCAL', data: dia },
      orderBy: { hora: 'asc' },
    });
    // Mesma regra dependente do contrato: para um contrato com intervalo
    // obrigatório, a 2ª batida vira "saída para intervalo" (status INTERVALO),
    // não um encerramento (FORA_EXPEDIENTE).
    const regras = await this.regrasDaPessoa(batidas);
    const classificadas = classificarBatidas(
      batidas.map((b) => ({ id: b.id, hora: b.hora })),
      regras?.maxTrabalhoSemIntervaloMs,
      regras?.intervaloObrigatorio ?? false,
    );

    const transicoes: TransicaoFiscal[] = [];
    for (const c of classificadas) {
      const status = statusFiscalDeTipoBatida(c.tipo);
      if (!status) continue;
      transicoes.push({
        status,
        em: new Date(c.hora.getTime() + OFFSET_BRASILIA_PARA_UTC_MS),
      });
    }

    // A ficha canônica já vem nas próprias batidas (mesmo padrão de
    // `regrasDaPessoa`); passamos adiante para gravar o vínculo `colaboradorId`
    // no log de ponto do fiscal — a ponte que permitirá aposentar o `fiscalId`.
    const colaboradorId =
      batidas.find((b) => b.colaboradorId)?.colaboradorId ?? null;

    await this.fiscais.reescreverRegistrosDoDia(
      cliente,
      pessoaId,
      dia,
      transicoes,
      colaboradorId,
    );
    return transicoes;
  }

  /**
   * Propaga em tempo real o status resultante do fiscal, APÓS o commit. Fora da
   * transação para não anunciar um status que um rollback poderia desfazer.
   * Best-effort: no-op quando não há ponte de fiscal (`transicoes` null).
   */
  private async publicarStatusFiscal(
    pessoaId: string,
    transicoes: TransicaoFiscal[] | null,
  ): Promise<void> {
    if (!transicoes || !this.fiscais) return;
    try {
      await this.fiscais.publicarStatusDoDia(pessoaId, transicoes);
    } catch {
      // Best-effort: a batida já foi persistida no commit; uma falha ao
      // propagar o status em tempo real não deve derrubar a requisição (o
      // painel se atualiza no próximo refresh/evento).
    }
  }

  private async buscarOuFalhar(id: string): Promise<BatidaPonto> {
    const batida = await this.prisma.batidaPonto.findUnique({ where: { id } });
    if (!batida) {
      throw new NotFoundException('Batida de ponto não encontrada.');
    }
    return batida;
  }
}
