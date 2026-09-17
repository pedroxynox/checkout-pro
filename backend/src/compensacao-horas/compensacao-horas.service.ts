import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  FuncaoColaborador,
  OrigemCompensacao,
  StatusCompensacao,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsuarioAutenticado } from '../common/decorators/usuario-atual.decorator';
import {
  UM_DIA_MS,
  agoraNaBrasilia,
  diaCivilBrasilia,
  inicioDoDia,
  periodoFolhaDeslocado,
  rotuloPeriodoFolha,
} from '../common/datas';
import {
  REGRAS_PADRAO,
  RegrasContrato,
  cargaBaseDoDia,
  diaPagaAdicional100,
} from '../ponto/ponto.domain';
import {
  CentralJornadaService,
  CentralPessoaResumo,
} from '../central-jornada/central-jornada.service';
import { CicloFolhaService } from '../ciclo-folha/ciclo-folha.service';
import { TiposContratoService } from '../tipos-contrato/tipos-contrato.service';
import { FeriasService } from '../ferias/ferias.service';
import { FolgaService } from '../escala-domingo/folga.service';
import { EscalaDomingoService } from '../escala-domingo/escala-domingo.service';
import {
  GrupoDomingo,
  entradaEsperadaNoDia,
  saidaEsperadaNoDia,
} from '../escala-domingo/escala-domingo.domain';
import { carregarMapaDeFeriados } from '../feriados/feriados.consulta';
import { mapearFiscalColaborador } from '../fiscais/colaborador-vinculo';
import {
  heatmapDiaSemanaHora,
  mediaPorDiaSemana,
  vendaMediaNaFaixa,
} from '../vendas/vendas.domain';
import {
  ContextoAlocacao,
  DataCandidata,
  FaltaCobrivel,
  FonteMovimento,
  FuncaoCompensavel,
  PessoaCompensavel,
  ResumoCarteira,
  SugestaoCobertura,
  SugestaoLiberacao,
  alocarLiberacoes,
  coberturasDeFalta,
  dataCurta,
  duracao,
  nomeDiaSemana,
  resumirCarteira,
} from './compensacao-horas.domain';
import {
  AprovarCompensacaoDto,
  RecusarSugestaoDto,
} from './dto/compensacao-horas.dto';

/** Funções que entram em escala (gerência não compensa porque não é escalada). */
const FUNCOES_COMPENSAVEIS: FuncaoCompensavel[] = [
  'OPERADOR',
  'FISCAL',
  'SUPERVISOR',
];

/** Janela histórica das médias de venda — a mesma do painel de vendas. */
const JANELA_VENDA_DIAS = 90;

/** Período do ciclo, serializável. */
export interface PeriodoCompensacao {
  inicio: string;
  fim: string;
  rotulo: string;
  deslocamento: number;
  /** Dias do ciclo que ainda podem receber compensação. */
  diasRestantes: number;
}

/** Uma data do ciclo disponível, com o movimento previsto. */
export interface DataFracaView {
  data: string;
  diaSemana: number;
  nomeDia: string;
  rotulo: string;
  movimentoPrevisto: number;
  fonte: FonteMovimento;
  amostras: number;
  /** Quantos trabalham no dia, por função, antes das compensações. */
  disponiveis: { funcao: FuncaoCompensavel; total: number }[];
}

/** Uma liberação sugerida, pronta para a tela. */
export interface LiberacaoView {
  colaboradorId: string;
  nome: string;
  funcao: FuncaoCompensavel;
  data: string;
  diaSemana: number;
  rotuloDia: string;
  cargaMs: number;
  compensarMs: number;
  trabalharMs: number;
  semIntervalo: boolean;
  horaInicio: string | null;
  horaFim: string | null;
  ponta: 'INICIO' | 'FIM' | null;
  saldoAntesMs: number;
  saldoDepoisMs: number;
  movimentoPrevisto: number;
  fonteMovimento: FonteMovimento;
  amostras: number;
  abaixoDaMedia: number | null;
  coberturaNoDia: number;
  diasTac: number;
  justificativa: string;
}

/** Uma cobertura de falta sugerida (o botão "Débito" que já existe). */
export interface CoberturaView {
  ausenciaId: string;
  colaboradorId: string;
  nome: string;
  funcao: FuncaoCompensavel;
  data: string;
  diaSemana: number;
  rotuloDia: string;
  cargaMs: number;
  saldoAntesMs: number;
  saldoDepoisMs: number;
  status: 'PENDENTE' | 'INJUSTIFICADA';
  justificativa: string;
}

/** Uma compensação já decidida (gravada). */
export interface CompensacaoView {
  id: string;
  colaboradorId: string;
  nome: string;
  data: string;
  diaSemana: number;
  rotuloDia: string;
  minutosCompensados: number;
  minutosTrabalhados: number;
  horaInicio: string | null;
  horaFim: string | null;
  semIntervalo: boolean;
  status: StatusCompensacao;
  origem: OrigemCompensacao;
  motivo: string | null;
  decididoPorNome: string | null;
  decididoEm: string | null;
}

/**
 * Motivo pelo qual as sugestões não foram calculadas. `null` = foram.
 *
 * `SEM_DATA_DISPONIVEL` cobre o fim do ciclo (não sobra dia) e
 * `SEM_DADO_DE_VENDA` o caso em que nem a estimativa nem a média existem — nos
 * dois a seção prefere dizer que não sabe a arriscar um palpite.
 */
export type BloqueioSugestao =
  | 'CICLO_PASSADO'
  | 'CICLO_FECHADO'
  | 'SEM_DATA_DISPONIVEL'
  | 'SEM_DADO_DE_VENDA';

/** Tudo o que a card "Compensação de horas" mostra. */
export interface CompensacaoPainel {
  periodo: PeriodoCompensacao;
  carteira: ResumoCarteira;
  datasFracas: DataFracaView[];
  liberacoes: LiberacaoView[];
  coberturas: CoberturaView[];
  /** Compensações já decididas no ciclo (aprovadas, recusadas, canceladas). */
  decididas: CompensacaoView[];
  bloqueio: BloqueioSugestao | null;
}

/** Ficha reduzida ao que a escala precisa. */
interface FichaEscalaCompleta {
  id: string;
  nome: string;
  funcao: FuncaoColaborador;
  tipoContratoJornadaId: string | null;
  folgaDiaSemana: number | null;
  grupoDomingo: string | null;
  entradaSemana: string | null;
  saidaSemana: string | null;
  entradaFds: string | null;
  saidaFds: string | null;
  entradaDom: string | null;
  saidaDom: string | null;
}

/** Ausência no formato mínimo que este módulo consulta. */
interface AusenciaMin {
  id: string;
  pessoaId: string;
  colaboradorId: string | null;
  data: Date;
  debitoHoras: boolean;
  statusJustificativa: string;
  motivoJustificativa: string | null;
}

/**
 * COMPENSAÇÃO DE HORAS (ADR 0021).
 *
 * Sugere **quem** liberar, **em que dia** e **por quanto tempo** para consumir o
 * saldo de horas de 50% antes de o ciclo de folha fechar — e sugere cobrir com
 * essas mesmas horas as faltas passadas que ainda estão em aberto.
 *
 * ## A conta, que é uma só
 *
 * Não existem modalidades. `horas a compensar = saldo` (limitado à carga do dia)
 * e `horas a trabalhar = carga − saldo`. Carga de 7h e saldo de 5h: trabalha 2h,
 * vai para casa sem intervalo, o dia fecha em 7h. O "dia inteiro" é apenas o caso
 * em que a conta dá zero.
 *
 * ## O que este serviço NÃO faz
 *
 * - **Não recalcula horas.** O saldo de cada pessoa vem inteiro da
 *   `CentralJornadaService` (`extras50AtualMs`). Uma segunda implementação da
 *   apuração divergiria da primeira no primeiro caso de borda.
 * - **Não decide quem folga.** A pergunta "esta pessoa descansa neste dia?" é
 *   respondida **só** pelo `FolgaService`, a regra única.
 * - **Não aplica nada sozinho.** Toda compensação exige aprovação explícita:
 *   mexe em folha e no descanso de pessoas.
 * - **Não altera a folga fixa da ficha.** Compensação é evento de uma data;
 *   folga fixa é regra semanal. Confundir as duas corromperia a escala.
 */
@Injectable()
export class CompensacaoHorasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly central: CentralJornadaService,
    private readonly folga: FolgaService,
    @Optional() private readonly escalaDomingo?: EscalaDomingoService,
    @Optional() private readonly ferias?: FeriasService,
    @Optional() private readonly cicloFolha?: CicloFolhaService,
    @Optional() private readonly tiposContrato?: TiposContratoService,
  ) {}

  /** Regras do contrato (data-driven) ou o padrão. */
  private async regrasDe(
    tipoContratoJornadaId?: string | null,
  ): Promise<RegrasContrato> {
    return this.tiposContrato
      ? this.tiposContrato.regrasDoContrato(tipoContratoJornadaId ?? null)
      : REGRAS_PADRAO;
  }

  /** "terça 22/09" — o rótulo do dia como o gestor o diria. */
  private rotuloDia(data: Date): string {
    return `${nomeDiaSemana(data.getUTCDay())} ${dataCurta(data)}`;
  }

  // ------------------------------ Leitura ---------------------------------

  /**
   * Painel da card. `deslocamento` 0 = ciclo atual (o único que recebe
   * sugestões — compensar no ciclo seguinte é proibido e o passado já aconteceu).
   */
  async painel(deslocamento = 0): Promise<CompensacaoPainel> {
    const periodo = periodoFolhaDeslocado(agoraNaBrasilia(), deslocamento);
    const { inicio, fimExclusivo } = periodo;

    const [decididasRaw, estadoCiclo, fichas] = await Promise.all([
      this.prisma.compensacaoHoras.findMany({
        where: { data: { gte: inicio, lt: fimExclusivo } },
        orderBy: [{ data: 'asc' }],
      }),
      this.cicloFolha?.status(deslocamento) ?? Promise.resolve(null),
      this.carregarFichas(),
    ]);

    const nomePorId = new Map(fichas.map((f) => [f.id, f.nome]));
    const decididas: CompensacaoView[] = decididasRaw.map((c) =>
      this.montarView(c, nomePorId.get(c.colaboradorId) ?? '—'),
    );

    // Datas candidatas: os dias que RESTAM do ciclo, a partir de amanhã. Uma
    // compensação é combinada antes; o passado já foi trabalhado (ou faltado, e
    // aí o caminho é a cobertura de falta).
    const primeiroCandidato = new Date(
      diaCivilBrasilia().getTime() + UM_DIA_MS,
    );
    const candidatas: Date[] = [];
    for (
      let t = Math.max(primeiroCandidato.getTime(), inicio.getTime());
      t < fimExclusivo.getTime();
      t += UM_DIA_MS
    ) {
      candidatas.push(new Date(t));
    }

    const vazio = (bloqueio: BloqueioSugestao): CompensacaoPainel => ({
      periodo: this.montarPeriodo(periodo, deslocamento, candidatas.length),
      carteira: resumirCarteira([], [], [], 0),
      datasFracas: [],
      liberacoes: [],
      coberturas: [],
      decididas,
      bloqueio,
    });

    if (deslocamento < 0) return vazio('CICLO_PASSADO');
    if (estadoCiclo?.status === 'FECHADO') return vazio('CICLO_FECHADO');
    if (candidatas.length === 0) return vazio('SEM_DATA_DISPONIVEL');

    // ---------------------------- Ingredientes ----------------------------
    const resumo = await this.central.resumoCiclo(deslocamento);
    const [
      feriadoMap,
      consultorFolga,
      ancora,
      feriasPorDia,
      ausencias,
      movimento,
    ] = await Promise.all([
      carregarMapaDeFeriados(this.prisma, inicio, fimExclusivo),
      this.folga.consultor(candidatas),
      this.escalaDomingo?.obterAncora() ?? Promise.resolve(null),
      Promise.all(
        candidatas.map(
          (d) =>
            this.ferias?.colaboradoresDeFeriasNoDia(d) ??
            Promise.resolve(new Set<string>()),
        ),
      ),
      this.prisma.ausencia.findMany({
        where: { data: { gte: inicio, lt: fimExclusivo } },
        select: {
          id: true,
          pessoaId: true,
          colaboradorId: true,
          data: true,
          debitoHoras: true,
          statusJustificativa: true,
          motivoJustificativa: true,
        },
      }),
      this.carregarMovimento(candidatas),
    ]);

    const ancoraDomingo: { data: Date; ordem: readonly GrupoDomingo[] } | null =
      ancora ? { data: ancora.data, ordem: ancora.ordem } : null;

    const fichaPorId = new Map(fichas.map((f) => [f.id, f]));
    const regrasPorId = new Map<string, RegrasContrato>();
    await Promise.all(
      fichas.map(async (f) => {
        regrasPorId.set(f.id, await this.regrasDe(f.tipoContratoJornadaId));
      }),
    );
    const regrasDoId = (id: string): RegrasContrato =>
      regrasPorId.get(id) ?? REGRAS_PADRAO;

    const idsPorFicha = await this.carregarIdentidades(fichas);
    const feriasNoDia = new Map<number, Set<string>>(
      candidatas.map((d, i) => [d.getTime(), feriasPorDia[i]]),
    );

    // ------------------- Datas candidatas com movimento -------------------
    const datasComMovimento: DataCandidata[] = [];
    for (const dia of candidatas) {
      const diaSemana = dia.getUTCDay();
      // Domingo e feriado ficam fora por ARITMÉTICA, não só por política: ali o
      // excedente é 100%, e 100% nunca é debitada — liberar não reduziria o
      // saldo de 50% em nada. Seria uma compensação que não compensa.
      if (diaSemana === 0) continue;
      if (feriadoMap.has(dia.getTime())) continue;
      const previsto = movimento.previsaoDe(dia);
      if (previsto == null) continue;
      datasComMovimento.push({
        data: dia,
        diaSemana,
        movimentoPrevisto: previsto.valor,
        fonte: previsto.fonte,
        amostras: previsto.amostras,
      });
    }

    if (datasComMovimento.length === 0) return vazio('SEM_DADO_DE_VENDA');

    // ------------------ Quem trabalha em cada dia (cobertura) -------------
    const trabalhaNoDia = (ficha: FichaEscalaCompleta, dia: Date): boolean => {
      if (
        consultorFolga.ehFolga(dia, idsPorFicha.get(ficha.id) ?? [ficha.id])
      ) {
        return false;
      }
      if (feriasNoDia.get(dia.getTime())?.has(ficha.id)) return false;
      return this.entradaDoDia(ficha, dia, ancoraDomingo) != null;
    };

    const ausenciaNoDia = new Set<string>();
    for (const a of ausencias) {
      for (const id of [a.colaboradorId, a.pessoaId]) {
        if (id) ausenciaNoDia.add(`${id}|${a.data.getTime()}`);
      }
    }

    const disponiveis = new Map<string, number>();
    for (const dia of candidatas) {
      for (const funcao of FUNCOES_COMPENSAVEIS) {
        const total = fichas.filter(
          (f) =>
            f.funcao === funcao &&
            trabalhaNoDia(f, dia) &&
            !ausenciaNoDia.has(`${f.id}|${dia.getTime()}`),
        ).length;
        disponiveis.set(`${funcao}|${dia.getTime()}`, total);
      }
    }

    // --------- Coberturas de falta (gastam a carteira PRIMEIRO) -----------
    //
    // Cobrir uma falta já ocorrida é a operação mais barata que existe: não
    // mexe na escala, não tira ninguém do caixa, elimina um desconto em folha
    // para a pessoa e apaga um passivo de 50% para a loja. Gastar a carteira
    // numa liberação futura, que custa cobertura, só faz sentido depois.
    const compensaveis: (CentralPessoaResumo & {
      funcao: FuncaoCompensavel;
    })[] = [];
    for (const p of resumo.pessoas) {
      if (!FUNCOES_COMPENSAVEIS.includes(p.funcao as FuncaoCompensavel))
        continue;
      if (p.extras50AtualMs <= 0) continue;
      compensaveis.push({ ...p, funcao: p.funcao as FuncaoCompensavel });
    }

    const faltasPorPessoa = this.agruparFaltasCobriveis(
      ausencias,
      compensaveis,
      fichaPorId,
      idsPorFicha,
      feriadoMap,
      regrasDoId,
    );

    const coberturasDominio: SugestaoCobertura[] = [];
    const pessoas: PessoaCompensavel[] = [];
    for (const p of compensaveis) {
      const resultado = coberturasDeFalta(
        p.extras50AtualMs,
        faltasPorPessoa.get(p.colaboradorId) ?? [],
      );
      coberturasDominio.push(...resultado.sugestoes);
      pessoas.push({
        colaboradorId: p.colaboradorId,
        nome: p.nome,
        funcao: p.funcao,
        // O saldo que sobra DEPOIS das coberturas: a mesma carteira alimenta as
        // duas, e prometê-la duas vezes seria o erro mais fácil de cometer aqui
        // e o mais difícil de perceber depois.
        saldo50Ms: resultado.saldoRestanteMs,
        diasTac: p.diasTac,
      });
    }

    // ----------- Datas já decididas (não sugerir a mesma coisa) -----------
    const jaDecidido = new Set<string>();
    for (const d of decididasRaw) {
      if (d.status === 'CANCELADA') continue;
      jaDecidido.add(`${d.colaboradorId}|${d.data.getTime()}`);
    }

    // ---------------------- Alocação das liberações -----------------------
    const ctx: ContextoAlocacao = {
      permitido: (colaboradorId, data) => {
        if (jaDecidido.has(`${colaboradorId}|${data.getTime()}`)) return false;
        if (ausenciaNoDia.has(`${colaboradorId}|${data.getTime()}`)) {
          return false;
        }
        const ficha = fichaPorId.get(colaboradorId);
        if (!ficha) return false;
        return trabalhaNoDia(ficha, data);
      },
      cargaDoDia: (colaboradorId, data) =>
        fichaPorId.has(colaboradorId)
          ? cargaBaseDoDia(data.getUTCDay(), false, regrasDoId(colaboradorId))
          : 0,
      turno: (colaboradorId, data) => {
        const ficha = fichaPorId.get(colaboradorId);
        if (!ficha) return { entrada: null, saida: null };
        return {
          entrada: this.entradaDoDia(ficha, data, ancoraDomingo),
          saida: this.saidaDoDia(ficha, data, ancoraDomingo),
        };
      },
      vendaNaFaixa: (diaSemana, inicioMin, fimMin) =>
        vendaMediaNaFaixa(
          movimento.heatmap[diaSemana] ?? [],
          inicioMin,
          fimMin,
        ),
      disponiveisNoDia: (funcao, data) =>
        disponiveis.get(`${funcao}|${data.getTime()}`) ?? 0,
      regras: (colaboradorId) => regrasDoId(colaboradorId),
    };

    const liberacoesDominio = alocarLiberacoes(pessoas, datasComMovimento, ctx);

    const datasFracas: DataFracaView[] = [...datasComMovimento]
      .sort((a, b) => a.movimentoPrevisto - b.movimentoPrevisto)
      .map((d) => ({
        data: d.data.toISOString(),
        diaSemana: d.diaSemana,
        nomeDia: nomeDiaSemana(d.diaSemana),
        rotulo: this.rotuloDia(d.data),
        movimentoPrevisto: d.movimentoPrevisto,
        fonte: d.fonte,
        amostras: d.amostras,
        disponiveis: FUNCOES_COMPENSAVEIS.map((funcao) => ({
          funcao,
          total: disponiveis.get(`${funcao}|${d.data.getTime()}`) ?? 0,
        })),
      }));

    return {
      periodo: this.montarPeriodo(periodo, deslocamento, candidatas.length),
      carteira: resumirCarteira(
        compensaveis.map((p) => ({
          colaboradorId: p.colaboradorId,
          nome: p.nome,
          funcao: p.funcao,
          saldo50Ms: p.extras50AtualMs,
          diasTac: p.diasTac,
        })),
        coberturasDominio,
        liberacoesDominio,
        datasComMovimento.length,
      ),
      datasFracas,
      liberacoes: liberacoesDominio.map((l) => this.montarLiberacao(l)),
      coberturas: coberturasDominio.map((c) => this.montarCobertura(c)),
      decididas,
      bloqueio: null,
    };
  }

  // ------------------------------ Escrita ---------------------------------

  /**
   * Aprova uma compensação.
   *
   * Revalida **tudo** o que a sugestão prometeu, em vez de confiar no que a tela
   * mandou: entre calcular a sugestão e o gestor tocar no botão, o dia pode ter
   * virado feriado, folga ou ausência, o ciclo pode ter fechado e o saldo da
   * pessoa pode ter mudado (uma batida nova já altera a apuração).
   */
  async aprovar(
    dto: AprovarCompensacaoDto,
    usuario?: UsuarioAutenticado,
  ): Promise<CompensacaoView> {
    const bruta = new Date(dto.data);
    if (Number.isNaN(bruta.getTime())) {
      throw new BadRequestException('Data inválida.');
    }
    const data = inicioDoDia(bruta);

    const ficha = await this.prisma.colaborador.findUnique({
      where: { id: dto.colaboradorId },
      select: {
        id: true,
        nome: true,
        funcao: true,
        ativo: true,
        tipoContratoJornadaId: true,
      },
    });
    if (!ficha) throw new NotFoundException('Colaborador não encontrado.');
    if (!ficha.ativo) {
      throw new BadRequestException('Colaborador inativo não compensa horas.');
    }
    if (!FUNCOES_COMPENSAVEIS.includes(ficha.funcao as FuncaoCompensavel)) {
      throw new BadRequestException(
        'Só operadores, fiscais e supervisores entram em escala.',
      );
    }

    // Um dia de ciclo fechado já foi para a folha.
    await this.cicloFolha?.exigirCicloAberto(data);

    // Compensar fora do ciclo aberto é proibido — cada ciclo é independente em
    // horas. Sem esta guarda, liberar no dia 28 não zeraria as 50% do ciclo que
    // fechou no 25: a loja pagaria o adicional E a pessoa começaria devendo.
    const cicloAberto = periodoFolhaDeslocado(agoraNaBrasilia(), 0);
    if (data < cicloAberto.inicio || data >= cicloAberto.fimExclusivo) {
      throw new BadRequestException(
        `A compensação tem de cair no ciclo aberto (${rotuloPeriodoFolha(
          cicloAberto,
        )}). Cada ciclo é independente em horas.`,
      );
    }

    const regras = await this.regrasDe(ficha.tipoContratoJornadaId);
    const mapaFeriado = await carregarMapaDeFeriados(
      this.prisma,
      data,
      new Date(data.getTime() + UM_DIA_MS),
    );
    const ehFeriado = mapaFeriado.has(data.getTime());

    if (diaPagaAdicional100(data.getUTCDay(), ehFeriado, regras)) {
      throw new BadRequestException(
        'Domingo e feriado pagam 100%, que nunca é debitada: não há o que compensar nesse dia.',
      );
    }

    if (await this.folga.ehFolga(data, [ficha.id])) {
      throw new BadRequestException(
        `${this.rotuloDia(data)} já é folga dessa pessoa: não há horas a compensar.`,
      );
    }

    const cargaMs = cargaBaseDoDia(data.getUTCDay(), ehFeriado, regras);
    const cargaMin = Math.round(cargaMs / 60_000);
    const compensarMin = Math.round(dto.minutosCompensados);
    if (compensarMin <= 0 || compensarMin > cargaMin) {
      throw new BadRequestException(
        `As horas a compensar têm de ficar entre 1min e a carga do dia (${duracao(
          cargaMs,
        )}).`,
      );
    }

    // Nunca compensar mais do que a pessoa tem: compensação não cria saldo
    // negativo. O saldo vem da Central (fonte única da apuração).
    const resumo = await this.central.resumoCiclo(0);
    const pessoa = resumo.pessoas.find((p) => p.colaboradorId === ficha.id);
    const saldoMs = pessoa?.extras50AtualMs ?? 0;
    const saldoMin = Math.floor(saldoMs / 60_000);
    if (compensarMin > saldoMin) {
      throw new BadRequestException(
        `${ficha.nome} tem ${duracao(saldoMs)} de 50% neste ciclo — ` +
          'não dá para compensar mais do que isso.',
      );
    }

    const trabalharMin = cargaMin - compensarMin;
    const semIntervalo =
      trabalharMin * 60_000 <= regras.maxTrabalhoSemIntervaloMs;
    const agora = new Date();
    const comum = {
      minutosCompensados: compensarMin,
      minutosTrabalhados: trabalharMin,
      horaInicio: dto.horaInicio ?? null,
      horaFim: dto.horaFim ?? null,
      semIntervalo,
      status: 'APROVADA' as const,
      origem: (dto.origem ?? 'SUGESTAO') as OrigemCompensacao,
      motivo: dto.motivo ?? null,
      vendaPrevista: dto.vendaPrevista ?? null,
      fonteVendaPrevista: dto.fonteVendaPrevista ?? null,
      saldo50MinNaEpoca: saldoMin,
      coberturaNoDia: dto.coberturaNoDia ?? null,
      decididoPor: usuario?.sub ?? null,
      decididoPorNome: usuario?.nome ?? null,
      decididoEm: agora,
    };

    const linha = await this.prisma.compensacaoHoras.upsert({
      where: { colaboradorId_data: { colaboradorId: ficha.id, data } },
      create: {
        colaboradorId: ficha.id,
        data,
        criadoPor: usuario?.sub ?? null,
        criadoPorNome: usuario?.nome ?? null,
        ...comum,
      },
      update: comum,
    });
    return this.montarView(linha, ficha.nome);
  }

  /**
   * Descarta uma sugestão (pessoa + dia), para ela não voltar amanhã.
   *
   * Grava-se a recusa, em vez de apenas esconder na tela: as sugestões são
   * recalculadas a cada consulta, então sem o registro a mesma linha reaparece
   * todos os dias até o gestor deixar de ler a seção.
   */
  async recusar(
    dto: RecusarSugestaoDto,
    usuario?: UsuarioAutenticado,
  ): Promise<CompensacaoView> {
    const bruta = new Date(dto.data);
    if (Number.isNaN(bruta.getTime())) {
      throw new BadRequestException('Data inválida.');
    }
    const data = inicioDoDia(bruta);
    const ficha = await this.prisma.colaborador.findUnique({
      where: { id: dto.colaboradorId },
      select: { id: true, nome: true },
    });
    if (!ficha) throw new NotFoundException('Colaborador não encontrado.');

    const agora = new Date();
    const linha = await this.prisma.compensacaoHoras.upsert({
      where: { colaboradorId_data: { colaboradorId: ficha.id, data } },
      create: {
        colaboradorId: ficha.id,
        data,
        minutosCompensados: 0,
        minutosTrabalhados: 0,
        semIntervalo: true,
        status: 'RECUSADA',
        origem: 'SUGESTAO',
        motivo: dto.motivo ?? null,
        criadoPor: usuario?.sub ?? null,
        criadoPorNome: usuario?.nome ?? null,
        decididoPor: usuario?.sub ?? null,
        decididoPorNome: usuario?.nome ?? null,
        decididoEm: agora,
      },
      update: {
        status: 'RECUSADA',
        minutosCompensados: 0,
        minutosTrabalhados: 0,
        motivo: dto.motivo ?? null,
        decididoPor: usuario?.sub ?? null,
        decididoPorNome: usuario?.nome ?? null,
        decididoEm: agora,
      },
    });
    return this.montarView(linha, ficha.nome);
  }

  /**
   * Cancela uma compensação aprovada. A linha fica com status `CANCELADA` em vez
   * de ser apagada: "foi concedida e desfeita" é exatamente o que alguém vai
   * querer consultar depois.
   */
  async cancelar(
    id: string,
    usuario?: UsuarioAutenticado,
  ): Promise<CompensacaoView> {
    const atual = await this.prisma.compensacaoHoras.findUnique({
      where: { id },
    });
    if (!atual) throw new NotFoundException('Compensação não encontrada.');
    await this.cicloFolha?.exigirCicloAberto(atual.data);

    const linha = await this.prisma.compensacaoHoras.update({
      where: { id },
      data: {
        status: 'CANCELADA',
        decididoPor: usuario?.sub ?? null,
        decididoPorNome: usuario?.nome ?? null,
        decididoEm: new Date(),
      },
    });
    const ficha = await this.prisma.colaborador.findUnique({
      where: { id: linha.colaboradorId },
      select: { nome: true },
    });
    return this.montarView(linha, ficha?.nome ?? '—');
  }

  // ----------------------------- Ingredientes ------------------------------

  private montarPeriodo(
    periodo: { inicio: Date; fimExclusivo: Date },
    deslocamento: number,
    diasRestantes: number,
  ): PeriodoCompensacao {
    const fim = new Date(periodo.fimExclusivo.getTime() - UM_DIA_MS);
    return {
      inicio: periodo.inicio.toISOString(),
      fim: fim.toISOString(),
      rotulo: rotuloPeriodoFolha(periodo),
      deslocamento,
      diasRestantes,
    };
  }

  private montarLiberacao(l: SugestaoLiberacao): LiberacaoView {
    return {
      colaboradorId: l.colaboradorId,
      nome: l.nome,
      funcao: l.funcao,
      data: l.data.toISOString(),
      diaSemana: l.diaSemana,
      rotuloDia: this.rotuloDia(l.data),
      cargaMs: l.cargaMs,
      compensarMs: l.compensarMs,
      trabalharMs: l.trabalharMs,
      semIntervalo: l.semIntervalo,
      horaInicio: l.horaInicio,
      horaFim: l.horaFim,
      ponta: l.ponta,
      saldoAntesMs: l.saldoAntesMs,
      saldoDepoisMs: l.saldoDepoisMs,
      movimentoPrevisto: l.movimentoPrevisto,
      fonteMovimento: l.fonteMovimento,
      amostras: l.amostras,
      abaixoDaMedia: l.abaixoDaMedia,
      coberturaNoDia: l.coberturaNoDia,
      diasTac: l.diasTac,
      justificativa: l.justificativa,
    };
  }

  private montarCobertura(c: SugestaoCobertura): CoberturaView {
    return {
      ausenciaId: c.ausenciaId,
      colaboradorId: c.colaboradorId,
      nome: c.nome,
      funcao: c.funcao,
      data: c.data.toISOString(),
      diaSemana: c.diaSemana,
      rotuloDia: this.rotuloDia(c.data),
      cargaMs: c.cargaMs,
      saldoAntesMs: c.saldoAntesMs,
      saldoDepoisMs: c.saldoDepoisMs,
      status: c.status,
      justificativa: c.justificativa,
    };
  }

  private montarView(
    linha: {
      id: string;
      colaboradorId: string;
      data: Date;
      minutosCompensados: number;
      minutosTrabalhados: number;
      horaInicio: string | null;
      horaFim: string | null;
      semIntervalo: boolean;
      status: StatusCompensacao;
      origem: OrigemCompensacao;
      motivo: string | null;
      decididoPorNome: string | null;
      decididoEm: Date | null;
    },
    nome: string,
  ): CompensacaoView {
    return {
      id: linha.id,
      colaboradorId: linha.colaboradorId,
      nome,
      data: linha.data.toISOString(),
      diaSemana: linha.data.getUTCDay(),
      rotuloDia: this.rotuloDia(linha.data),
      minutosCompensados: linha.minutosCompensados,
      minutosTrabalhados: linha.minutosTrabalhados,
      horaInicio: linha.horaInicio,
      horaFim: linha.horaFim,
      semIntervalo: linha.semIntervalo,
      status: linha.status,
      origem: linha.origem,
      motivo: linha.motivo,
      decididoPorNome: linha.decididoPorNome,
      decididoEm: linha.decididoEm?.toISOString() ?? null,
    };
  }

  private async carregarFichas(): Promise<FichaEscalaCompleta[]> {
    return this.prisma.colaborador.findMany({
      where: { ativo: true, funcao: { in: FUNCOES_COMPENSAVEIS } },
      select: {
        id: true,
        nome: true,
        funcao: true,
        tipoContratoJornadaId: true,
        folgaDiaSemana: true,
        grupoDomingo: true,
        entradaSemana: true,
        saidaSemana: true,
        entradaFds: true,
        saidaFds: true,
        entradaDom: true,
        saidaDom: true,
      },
      orderBy: { nome: 'asc' },
    });
  }

  /**
   * Todas as identidades de cada ficha. Um fiscal bate ponto e tem escala com o
   * `Fiscal.id`, mas a ficha é `Colaborador.id`: consultar só uma delas é a
   * origem de metade dos casos em que a regra de folga não pegava.
   */
  private async carregarIdentidades(
    fichas: readonly FichaEscalaCompleta[],
  ): Promise<Map<string, string[]>> {
    const mapa = new Map<string, string[]>(fichas.map((f) => [f.id, [f.id]]));
    if (!fichas.some((f) => f.funcao === 'FISCAL')) return mapa;

    const [fiscais, usuarios, colaboradores] = await Promise.all([
      this.prisma.fiscal.findMany({
        select: { id: true, nome: true, usuarioId: true },
      }),
      this.prisma.usuario.findMany({ select: { id: true, login: true } }),
      this.prisma.colaborador.findMany({
        where: { funcao: 'FISCAL' },
        select: { id: true, nome: true, matricula: true, usuarioId: true },
      }),
    ]);
    for (const [fiscalId, dados] of mapearFiscalColaborador(
      fiscais,
      usuarios,
      colaboradores,
    ).entries()) {
      mapa.get(dados.colaboradorId)?.push(fiscalId);
    }
    return mapa;
  }

  /**
   * Entrada esperada no dia — **sempre** a da ficha (ADR 0026).
   *
   * Antes uma exceção de horário da escala semanal podia sobrepor este valor.
   * Ela deixou de existir: se sobrepusesse aqui e não na escala publicada, a
   * sugestão de compensação contaria uma jornada que a equipe não vê.
   */
  private entradaDoDia(
    ficha: FichaEscalaCompleta,
    dia: Date,
    ancora: { data: Date; ordem: readonly GrupoDomingo[] } | null,
  ): string | null {
    return entradaEsperadaNoDia(ficha, dia, ancora, false);
  }

  /** Saída esperada no dia — **sempre** a da ficha (ADR 0026). */
  private saidaDoDia(
    ficha: FichaEscalaCompleta,
    dia: Date,
    ancora: { data: Date; ordem: readonly GrupoDomingo[] } | null,
  ): string | null {
    return saidaEsperadaNoDia(ficha, dia, ancora, false);
  }

  /**
   * Faltas que podem ser cobertas pelas horas de 50%, agrupadas por pessoa.
   *
   * Entram só as que o gestor poderia debitar hoje, à mão: sem atestado (que já
   * é ausência abonada), sem débito já marcado, e ainda em aberto (`PENDENTE`)
   * ou confirmada como falta (`INJUSTIFICADA`) — nunca uma já `JUSTIFICADA`, que
   * foi perdoada e não deve consumir horas de ninguém. Domingo e feriado ficam
   * fora porque não geram hora devida por nenhum caminho.
   */
  private agruparFaltasCobriveis(
    ausencias: readonly AusenciaMin[],
    pessoas: readonly (CentralPessoaResumo & { funcao: FuncaoCompensavel })[],
    fichaPorId: Map<string, FichaEscalaCompleta>,
    idsPorFicha: Map<string, string[]>,
    feriadoMap: Map<number, string>,
    regrasDoId: (id: string) => RegrasContrato,
  ): Map<string, FaltaCobrivel[]> {
    const porPessoa = new Map<string, FaltaCobrivel[]>();
    const fichaPorIdentidade = new Map<string, string>();
    for (const [colaboradorId, ids] of idsPorFicha.entries()) {
      for (const id of ids) fichaPorIdentidade.set(id, colaboradorId);
    }
    const pessoaPorId = new Map(pessoas.map((p) => [p.colaboradorId, p]));

    for (const a of ausencias) {
      if (a.debitoHoras) continue;
      if (a.motivoJustificativa === 'ATESTADO_MEDICO') continue;
      if (a.statusJustificativa === 'JUSTIFICADA') continue;

      const colaboradorId =
        a.colaboradorId && fichaPorId.has(a.colaboradorId)
          ? a.colaboradorId
          : fichaPorIdentidade.get(a.pessoaId);
      if (!colaboradorId) continue;
      const pessoa = pessoaPorId.get(colaboradorId);
      if (!pessoa || !fichaPorId.has(colaboradorId)) continue;

      const dia = inicioDoDia(a.data);
      const ehFeriado = feriadoMap.has(dia.getTime());
      const regras = regrasDoId(colaboradorId);
      if (diaPagaAdicional100(dia.getUTCDay(), ehFeriado, regras)) continue;

      const lista = porPessoa.get(colaboradorId) ?? [];
      lista.push({
        ausenciaId: a.id,
        colaboradorId,
        nome: pessoa.nome,
        funcao: pessoa.funcao,
        data: dia,
        diaSemana: dia.getUTCDay(),
        cargaMs: cargaBaseDoDia(dia.getUTCDay(), ehFeriado, regras),
        status:
          a.statusJustificativa === 'INJUSTIFICADA'
            ? 'INJUSTIFICADA'
            : 'PENDENTE',
      });
      porPessoa.set(colaboradorId, lista);
    }
    return porPessoa;
  }

  /**
   * Previsão de movimento das datas candidatas + heatmap por hora.
   *
   * Ordem de confiança (ADR 0021, item 3): a **estimativa da própria gestão**
   * para aquela data vem primeiro — é por data e já embute o efeito do calendário
   * de pagamento, que numa loja pesa mais do que o dia da semana. Só na falta
   * dela entra a média histórica do dia da semana, com feriados fora e mínimo de
   * 3 observações. Sem nenhuma das duas, a data não é sugerida: ranquear dia
   * fraco por ruído seria pior do que não ranquear.
   */
  private async carregarMovimento(candidatas: readonly Date[]): Promise<{
    previsaoDe(
      dia: Date,
    ): { valor: number; fonte: FonteMovimento; amostras: number } | null;
    heatmap: number[][];
  }> {
    const hoje = diaCivilBrasilia();
    const fimJanela = new Date(hoje.getTime() + UM_DIA_MS);
    const inicioJanela = new Date(
      hoje.getTime() - (JANELA_VENDA_DIAS - 1) * UM_DIA_MS,
    );
    const primeira = candidatas[0] ?? hoje;
    const ultima = candidatas[candidatas.length - 1] ?? hoje;

    const [estimativas, diarios, horas, feriadosJanela] = await Promise.all([
      this.prisma.estimativaVendaDia.findMany({
        where: { data: { gte: primeira, lte: ultima }, valor: { gt: 0 } },
        select: { data: true, valor: true },
      }),
      this.prisma.vendaDiaria.findMany({
        where: { data: { gte: inicioJanela, lte: hoje }, valor: { gt: 0 } },
        select: { data: true, valor: true },
      }),
      this.prisma.vendaHora.findMany({
        where: { data: { gte: inicioJanela, lte: hoje } },
        select: { data: true, hora: true, valor: true },
      }),
      // Os feriados da JANELA HISTÓRICA (não os do ciclo): são períodos
      // diferentes, e é esta janela que alimenta as médias.
      carregarMapaDeFeriados(this.prisma, inicioJanela, fimJanela),
    ]);

    const estimativaPorDia = new Map(
      estimativas.map((e) => [e.data.getTime(), Number(e.valor)]),
    );
    const medias = mediaPorDiaSemana(diarios, {
      ehFeriado: (data) => feriadosJanela.has(inicioDoDia(data).getTime()),
    });

    return {
      previsaoDe: (dia) => {
        const estimada = estimativaPorDia.get(dia.getTime());
        if (estimada != null && estimada > 0) {
          return { valor: estimada, fonte: 'ESTIMATIVA', amostras: 0 };
        }
        const media = medias[dia.getUTCDay()];
        if (media?.media != null) {
          return {
            valor: media.media,
            fonte: 'HISTORICO',
            amostras: media.amostras,
          };
        }
        return null;
      },
      heatmap: heatmapDiaSemanaHora(horas),
    };
  }
}
