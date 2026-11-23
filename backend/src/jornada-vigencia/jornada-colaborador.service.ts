import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CicloFolhaService } from '../ciclo-folha/ciclo-folha.service';
import { UM_DIA_MS, diaCivilBrasilia, inicioDoDia } from '../common/datas';
import { ehGrupoValido } from '../escala-domingo/escala-domingo.domain';
import {
  RodizioFolgas,
  rodizioDaLinha,
  rodizioNoDia,
} from '../escala-domingo/rodizio-folgas.domain';
import { RegrasContrato } from '../ponto/ponto.domain';
import { TiposContratoService } from '../tipos-contrato/tipos-contrato.service';
import {
  AvisoJornada,
  DIAS_SEGUNDA_A_DOMINGO,
  LinhaDisponibilidade,
  RegimeJornada,
  VigenciaJornada,
  avisosDaVigencia,
  disponibilidadePreenchida,
  folgasFixasEfetivas,
  validarVigencia,
  vigenciaNoDia,
} from './jornada-vigencia.domain';
import {
  JornadaVigenciaService,
  vigenciaDaLinha,
} from './jornada-vigencia.service';

/** Dias à frente na lista de próximas folgas (design §6). */
export const DIAS_PROXIMAS_FOLGAS = 14;

/** O que a tela manda para gravar uma vigência (`PUT`, e o bloco do `POST`). */
export interface DadosVigenciaJornada {
  /** Primeiro dia da vigência (AAAA-MM-DD). */
  aPartirDe: string;
  /** Ausente = o contrato que já decide o dia (só `ADMIN_DADOS` o troca). */
  tipoContratoJornadaId?: string | null;
  /** 'G1' | 'G2' | 'G3'; null ou vazio = sem grupo. */
  grupo?: string | null;
  folgasFixas?: number[];
  disponibilidade?: LinhaDisponibilidade[];
  motivo?: string | null;
}

/** Quem grava e se pode trocar o contrato (`ADMIN_DADOS`). */
export interface AutorJornada {
  login: string | null;
  podeTrocarContrato: boolean;
}

/** Uma vigência como a API devolve. */
export interface VigenciaJornadaView {
  id: string;
  /** Primeiro dia (AAAA-MM-DD). */
  aPartirDe: string;
  tipoContratoJornadaId: string;
  tipoContratoNome: string | null;
  grupo: string | null;
  /** As da ficha (vazias = as padrão do contrato). */
  folgasFixas: number[];
  /** As que valem: as da ficha ou as padrão do contrato; vazio com grupo. */
  folgasFixasEfetivas: number[];
  /** De segunda a domingo; só os dias com horário. */
  disponibilidade: { diaSemana: number; entrada: string; saida: string }[];
  motivo: string | null;
  criadoPor: string | null;
  criadoEm: string;
  atualizadoPor: string | null;
  atualizadoEm: string;
  /** Avisos de R4.6 (não bloqueiam). */
  avisos: AvisoJornada[];
}

/** Uma folga prevista pela jornada do dia. */
export interface FolgaPrevista {
  data: string;
  diaSemana: number;
}

/** `GET /colaboradores/:id/jornada`. */
export interface JornadaDoColaborador {
  colaboradorId: string;
  /** Regime de hoje (Brasília): sem vigência que já começou, o 6x1 da ficha. */
  regimeHoje: RegimeJornada;
  /** A vigência que decide hoje, ou null no regime legado. */
  vigente: VigenciaJornadaView | null;
  /** Contrato de hoje e desde quando (null no regime legado: vem da ficha). */
  contratoVigente: { id: string; nome: string | null; desde: string | null };
  /** Todas as vigências, da mais nova para a mais antiga (inclui as futuras). */
  historico: VigenciaJornadaView[];
  /** Folgas dos próximos 14 dias, a partir de hoje. */
  proximasFolgas: FolgaPrevista[];
}

/** `PUT /colaboradores/:id/jornada`. */
export interface ResultadoGravacaoJornada {
  vigencia: VigenciaJornadaView;
  avisos: AvisoJornada[];
}

/** Uma vigência já validada, pronta para gravar. */
export interface PlanoVigenciaJornada {
  vigenteDesde: Date;
  tipoContratoJornadaId: string;
  grupo: string | null;
  folgasFixas: number[];
  disponibilidade: { diaSemana: number; entrada: string; saida: string }[];
  motivo: string | null;
}

interface LinhaComContrato {
  id: string;
  colaboradorId: string;
  vigenteDesde: Date;
  tipoContratoJornadaId: string;
  grupo: string | null;
  folgasFixas: number[];
  motivo: string | null;
  criadoPor: string | null;
  criadoEm: Date;
  atualizadoPor: string | null;
  atualizadoEm: Date;
  disponibilidade: { diaSemana: number; entrada: string; saida: string }[];
  tipoContratoJornada: { nome: string } | null;
}

const INCLUDE_VIGENCIA = {
  disponibilidade: { select: { diaSemana: true, entrada: true, saida: true } },
  tipoContratoJornada: { select: { nome: true } },
} as const;

const DIA_ISO = /^\d{4}-\d{2}-\d{2}/;

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "AAAA-MM-DD…" → 00:00 UTC do dia; 400 se não for uma data. */
function diaDaData(texto: string): Date {
  const t = String(texto ?? '');
  const d = DIA_ISO.test(t)
    ? new Date(`${t.slice(0, 10)}T00:00:00.000Z`)
    : new Date(NaN);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(
      'Data "vale a partir de" inválida (use AAAA-MM-DD).',
    );
  }
  return d;
}

const ordemSegADom = (a: { diaSemana: number }, b: { diaSemana: number }) =>
  DIAS_SEGUNDA_A_DOMINGO.indexOf(a.diaSemana) -
  DIAS_SEGUNDA_A_DOMINGO.indexOf(b.diaSemana);

/**
 * A jornada de uma pessoa pela ficha (spec `jornada-5x2`, Fase 4): ler, gravar
 * e remover as vigências (`/colaboradores/:id/jornada`).
 *
 * Quem decide cada dia continua sendo o `JornadaVigenciaService` (consultor);
 * este serviço só escreve na mesma tabela, com as travas da design §3.2 e §6:
 * validação (400), ciclo de folha fechado (409, R1.4), troca de contrato só com
 * `ADMIN_DADOS` (403) e auditoria (R1.6).
 */
@Injectable()
export class JornadaColaboradorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tiposContrato: TiposContratoService,
    private readonly jornada: JornadaVigenciaService,
    private readonly cicloFolha: CicloFolhaService,
  ) {}

  /** Vigente, histórico e próximas folgas. `hoje` = dia civil de Brasília. */
  async obter(
    colaboradorId: string,
    hoje: Date = diaCivilBrasilia(),
  ): Promise<JornadaDoColaborador> {
    const ficha = await this.ficha(colaboradorId);
    const linhas: LinhaComContrato[] =
      await this.prisma.jornadaVigencia.findMany({
        where: { colaboradorId },
        include: INCLUDE_VIGENCIA,
        orderBy: { vigenteDesde: 'desc' },
      });
    const historico = await Promise.all(linhas.map((l) => this.view(l)));
    const doDominio = linhas.map(vigenciaDaLinha);
    const vigente = vigenciaNoDia(doDominio, hoje);
    const viewVigente = vigente
      ? (historico.find((h) => h.id === vigente.id) ?? null)
      : null;

    return {
      colaboradorId,
      regimeHoje: vigente ? 'SEMANAL' : 'LEGADO_6X1',
      vigente: viewVigente,
      contratoVigente: vigente
        ? {
            id: vigente.tipoContratoJornadaId,
            nome: viewVigente?.tipoContratoNome ?? null,
            desde: this.desdeDoContrato(historico, vigente.id),
          }
        : {
            id: ficha.tipoContratoJornadaId,
            nome: ficha.tipoContratoJornada?.nome ?? null,
            desde: null,
          },
      historico,
      proximasFolgas: await this.proximasFolgas(colaboradorId, hoje),
    };
  }

  /**
   * Grava (cria ou substitui) a vigência que começa em `aPartirDe`. Devolve a
   * vigência e os avisos de R4.6.
   */
  async gravar(
    colaboradorId: string,
    dados: DadosVigenciaJornada,
    autor: AutorJornada,
  ): Promise<ResultadoGravacaoJornada> {
    const ficha = await this.ficha(colaboradorId);
    const vigenteDesde = diaDaData(dados.aPartirDe);
    const contratoDoDia = await this.contratoNoDia(
      colaboradorId,
      ficha.tipoContratoJornadaId,
      vigenteDesde,
    );
    const plano = await this.planejar(dados, {
      contratoSeOmitido: contratoDoDia,
      contratoReferencia: contratoDoDia,
      autor,
    });
    return this.gravarPlano(colaboradorId, plano, autor.login);
  }

  /**
   * Valida o bloco `jornada` do cadastro ANTES de criar a pessoa, para o
   * cadastro não ficar pela metade. Trocar o contrato aqui é escolher um
   * diferente do padrão (o que a pessoa teria sem escolha).
   */
  async validarNoCadastro(
    dados: DadosVigenciaJornada,
    contratoDaFicha: string,
    contratoPadrao: string,
    autor: AutorJornada,
  ): Promise<PlanoVigenciaJornada> {
    return this.planejar(dados, {
      contratoSeOmitido: contratoDaFicha,
      contratoReferencia: contratoPadrao,
      autor,
    });
  }

  /** Grava uma vigência já validada (upsert por pessoa e data). */
  async gravarPlano(
    colaboradorId: string,
    plano: PlanoVigenciaJornada,
    login: string | null,
  ): Promise<ResultadoGravacaoJornada> {
    const id = await this.prisma.$transaction(async (tx) => {
      const campos = {
        tipoContratoJornadaId: plano.tipoContratoJornadaId,
        grupo: plano.grupo,
        folgasFixas: plano.folgasFixas,
      };
      const v = await tx.jornadaVigencia.upsert({
        where: {
          colaboradorId_vigenteDesde: {
            colaboradorId,
            vigenteDesde: plano.vigenteDesde,
          },
        },
        create: {
          colaboradorId,
          vigenteDesde: plano.vigenteDesde,
          ...campos,
          motivo: plano.motivo,
          criadoPor: login,
        },
        update: {
          ...campos,
          // Sem motivo novo, fica o da criação.
          ...(plano.motivo != null ? { motivo: plano.motivo } : {}),
          atualizadoPor: login,
        },
        select: { id: true },
      });
      await tx.disponibilidadeDia.deleteMany({ where: { vigenciaId: v.id } });
      if (plano.disponibilidade.length > 0) {
        await tx.disponibilidadeDia.createMany({
          data: plano.disponibilidade.map((d) => ({ ...d, vigenciaId: v.id })),
        });
      }
      return v.id;
    });
    const linha: LinhaComContrato =
      await this.prisma.jornadaVigencia.findUniqueOrThrow({
        where: { id },
        include: INCLUDE_VIGENCIA,
      });
    const vigencia = await this.view(linha);
    return { vigencia, avisos: vigencia.avisos };
  }

  /**
   * Remove uma vigência (nunca num ciclo fechado, R1.4). Sem nenhuma, a pessoa
   * volta ao 6x1 da ficha em todos os dias (R1.7). Se a remoção mudar o
   * contrato desses dias, exige `ADMIN_DADOS` como a troca na gravação.
   */
  async remover(
    colaboradorId: string,
    vigenciaId: string,
    autor: AutorJornada,
  ): Promise<JornadaDoColaborador> {
    const ficha = await this.ficha(colaboradorId);
    const alvo = await this.prisma.jornadaVigencia.findFirst({
      where: { id: vigenciaId, colaboradorId },
      select: { id: true, vigenteDesde: true, tipoContratoJornadaId: true },
    });
    if (!alvo) throw new NotFoundException('Vigência não encontrada.');
    await this.cicloFolha.exigirCicloAberto(alvo.vigenteDesde);
    const anterior = await this.prisma.jornadaVigencia.findFirst({
      where: { colaboradorId, vigenteDesde: { lt: alvo.vigenteDesde } },
      orderBy: { vigenteDesde: 'desc' },
      select: { tipoContratoJornadaId: true },
    });
    const contratoDepois =
      anterior?.tipoContratoJornadaId ?? ficha.tipoContratoJornadaId;
    if (
      contratoDepois !== alvo.tipoContratoJornadaId &&
      !autor.podeTrocarContrato
    ) {
      throw new ForbiddenException(
        'Remover esta vigência muda o contrato desses dias; só o administrador pode trocar o contrato.',
      );
    }
    await this.prisma.jornadaVigencia.delete({ where: { id: alvo.id } });
    return this.obter(colaboradorId);
  }

  /** Valida os dados e resolve o contrato (400/403/409). */
  private async planejar(
    dados: DadosVigenciaJornada,
    contexto: {
      contratoSeOmitido: string;
      contratoReferencia: string;
      autor: AutorJornada;
    },
  ): Promise<PlanoVigenciaJornada> {
    const vigenteDesde = diaDaData(dados.aPartirDe);
    // Retroativa só dentro do ciclo aberto (R1.4, R1.5). Vem antes do resto:
    // num ciclo fechado nenhuma correção dos dados resolve.
    await this.cicloFolha.exigirCicloAberto(vigenteDesde);

    const tipoContratoJornadaId =
      dados.tipoContratoJornadaId || contexto.contratoSeOmitido;
    const trocaContrato = tipoContratoJornadaId !== contexto.contratoReferencia;
    if (trocaContrato && !contexto.autor.podeTrocarContrato) {
      throw new ForbiddenException(
        'Só o administrador escolhe ou troca o tipo de contrato.',
      );
    }
    const contrato = await this.prisma.tipoContratoJornada.findUnique({
      where: { id: tipoContratoJornadaId },
      select: { id: true, ativo: true },
    });
    if (!contrato) {
      throw new BadRequestException('Tipo de contrato não encontrado.');
    }
    if (trocaContrato && !contrato.ativo) {
      throw new BadRequestException(
        'Este tipo de contrato está inativo; ative-o antes de usá-lo.',
      );
    }
    const regras = await this.tiposContrato.regrasDoContrato(contrato.id);

    const grupo = dados.grupo ? dados.grupo : null;
    const folgasFixas = [...(dados.folgasFixas ?? [])];
    const linhas = dados.disponibilidade ?? [];
    const erros = validarVigencia(
      { grupo, folgasFixas, disponibilidade: linhas },
      {
        maxFolgasFixas: regras.folgasPorSemana,
        permiteFolgaSabado: regras.permiteFolgaSabado,
      },
    );
    if (
      grupo &&
      ehGrupoValido(grupo) &&
      !(await this.temRodizio(vigenteDesde))
    ) {
      erros.push(
        `Não há rodízio de folgas valendo em ${iso(vigenteDesde)}; cadastre o rodízio antes de pôr a pessoa num grupo.`,
      );
    }
    if (erros.length > 0) throw new BadRequestException(erros.join(' '));

    const motivo = dados.motivo?.trim() ? dados.motivo.trim() : null;
    return {
      vigenteDesde,
      tipoContratoJornadaId: contrato.id,
      grupo,
      folgasFixas,
      disponibilidade: disponibilidadePreenchida(linhas).sort(ordemSegADom),
      motivo,
    };
  }

  /** Contrato que decide o dia: a vigência do dia ou, antes dela, a ficha. */
  private async contratoNoDia(
    colaboradorId: string,
    contratoDaFicha: string,
    dia: Date,
  ): Promise<string> {
    const v = await this.prisma.jornadaVigencia.findFirst({
      where: { colaboradorId, vigenteDesde: { lte: inicioDoDia(dia) } },
      orderBy: { vigenteDesde: 'desc' },
      select: { tipoContratoJornadaId: true },
    });
    return v?.tipoContratoJornadaId ?? contratoDaFicha;
  }

  private async temRodizio(dia: Date): Promise<boolean> {
    const linhas = await this.prisma.rodizioFolgasVigencia.findMany({
      where: { vigenteDesde: { lte: dia } },
    });
    const rodizios = linhas
      .map(rodizioDaLinha)
      .filter((r): r is RodizioFolgas => r !== null);
    return rodizioNoDia(rodizios, dia) !== null;
  }

  private async ficha(colaboradorId: string) {
    const ficha = await this.prisma.colaborador.findUnique({
      where: { id: colaboradorId },
      select: {
        id: true,
        tipoContratoJornadaId: true,
        tipoContratoJornada: { select: { nome: true } },
      },
    });
    if (!ficha) throw new NotFoundException('Colaborador não encontrado.');
    return ficha;
  }

  private async proximasFolgas(
    colaboradorId: string,
    hoje: Date,
  ): Promise<FolgaPrevista[]> {
    const inicio = inicioDoDia(hoje).getTime();
    const dias = Array.from(
      { length: DIAS_PROXIMAS_FOLGAS },
      (_, i) => new Date(inicio + i * UM_DIA_MS),
    );
    const consultor = await this.jornada.consultor(dias);
    return dias
      .filter((d) => consultor.previsto([colaboradorId], d)?.folga === true)
      .map((d) => ({ data: iso(d), diaSemana: d.getUTCDay() }));
  }

  /**
   * Início da sequência de vigências com o mesmo contrato que termina na
   * vigente (o "desde quando" do contrato). `historico` vem da mais nova.
   */
  private desdeDoContrato(
    historico: readonly VigenciaJornadaView[],
    vigenteId: string,
  ): string {
    let i = historico.findIndex((h) => h.id === vigenteId);
    const contrato = historico[i].tipoContratoJornadaId;
    while (
      i + 1 < historico.length &&
      historico[i + 1].tipoContratoJornadaId === contrato
    ) {
      i++;
    }
    return historico[i].aPartirDe;
  }

  private async view(linha: LinhaComContrato): Promise<VigenciaJornadaView> {
    const regras: RegrasContrato = await this.tiposContrato.regrasDoContrato(
      linha.tipoContratoJornadaId,
    );
    const v: VigenciaJornada = vigenciaDaLinha(linha);
    return {
      id: linha.id,
      aPartirDe: iso(linha.vigenteDesde),
      tipoContratoJornadaId: linha.tipoContratoJornadaId,
      tipoContratoNome: linha.tipoContratoJornada?.nome ?? null,
      grupo: v.grupo,
      folgasFixas: [...linha.folgasFixas],
      folgasFixasEfetivas: v.grupo
        ? []
        : [...folgasFixasEfetivas(v, regras.folgasFixasPadrao)],
      disponibilidade: linha.disponibilidade
        .map((d) => ({
          diaSemana: d.diaSemana,
          entrada: d.entrada,
          saida: d.saida,
        }))
        .sort(ordemSegADom),
      motivo: linha.motivo,
      criadoPor: linha.criadoPor,
      criadoEm: linha.criadoEm.toISOString(),
      atualizadoPor: linha.atualizadoPor,
      atualizadoEm: linha.atualizadoEm.toISOString(),
      avisos: avisosDaVigencia(v, regras),
    };
  }
}
