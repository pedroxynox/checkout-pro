import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TipoContratoJornada } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { inicioDoDia } from '../common/datas';
import { RegrasContrato, REGRAS_PADRAO } from '../ponto/ponto.domain';
import { regrasContratoDeModelo } from './tipos-contrato.adapter';
import {
  AtualizarTipoContratoDto,
  CriarTipoContratoDto,
} from './dto/tipos-contrato.dto';

/** Campos numéricos das regras (para validar a coerência dos limites). */
interface ParametrosRegra {
  cargaBaseMinPorDia: number[];
  diasComAdicional100: number[];
  intervaloMinimoMin: number;
  intervaloMaximoMin: number;
  riscoTac1h30Min: number;
  riscoTac1h40Min: number;
  limiteExtrasMin: number;
  folgasPorSemana: number;
  folgasFixasPadrao: number[];
  permiteFolgaSabado: boolean;
}

/**
 * Campos que entram no CÁLCULO (horas, TAC, folgas). Num contrato em uso eles
 * ficam travados (spec `jornada-5x2`, R2.8): mudar um deles reescreveria os
 * dias já calculados de quem está no contrato. Nome, descrição e ativo ficam
 * de fora e continuam editáveis.
 */
const CAMPOS_REGRA = [
  'cargaBaseMinPorDia',
  'diasComAdicional100',
  'maxTrabalhoSemIntervaloMin',
  'intervaloMinimoMin',
  'intervaloMaximoMin',
  'limiteExtrasMin',
  'riscoTac1h30Min',
  'riscoTac1h40Min',
  'intervaloMinimoEntreBatidasMin',
  'intervaloObrigatorio',
  'trabalhaDomingo',
  'cargaFeriadoMin',
  'feriadoAdicional100',
  'limiteTrabalhoDiaMin',
  'folgasPorSemana',
  'folgasFixasPadrao',
  'permiteFolgaSabado',
] as const satisfies readonly (keyof AtualizarTipoContratoDto &
  keyof TipoContratoJornada)[];

type CampoRegra = (typeof CAMPOS_REGRA)[number];

/** Rótulos dos campos para a mensagem de contrato travado. */
const ROTULO_CAMPO: Record<CampoRegra, string> = {
  cargaBaseMinPorDia: 'carga base',
  diasComAdicional100: 'dias com adicional de 100%',
  maxTrabalhoSemIntervaloMin: 'máximo sem intervalo',
  intervaloMinimoMin: 'intervalo mínimo',
  intervaloMaximoMin: 'intervalo máximo',
  limiteExtrasMin: 'limite de extras',
  riscoTac1h30Min: '1º aviso',
  riscoTac1h40Min: '2º aviso',
  intervaloMinimoEntreBatidasMin: 'intervalo entre batidas',
  intervaloObrigatorio: 'intervalo obrigatório',
  trabalhaDomingo: 'trabalha domingo',
  cargaFeriadoMin: 'carga do feriado',
  feriadoAdicional100: 'feriado a 100%',
  limiteTrabalhoDiaMin: 'limite de horas no dia',
  folgasPorSemana: 'folgas por semana',
  folgasFixasPadrao: 'folgas padrão',
  permiteFolgaSabado: 'folga no sábado',
};

/** Igualdade de valor de um campo de regra (arranjos comparados por item). */
function mesmoValor(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

/** Um contrato como a lista o devolve: com o indicador de uso. */
export type TipoContratoComUso = TipoContratoJornada & {
  /**
   * Alguma ficha ou vigência usa o contrato, ou ele é o padrão (que decide os
   * dias das batidas sem ficha). Com `emUso`, as regras ficam travadas.
   */
  emUso: boolean;
};

/** Tamanho máximo do nome (o mesmo do DTO). */
const NOME_MAX = 60;

/**
 * Catálogo de TIPOS DE CONTRATO de jornada (data-driven). A gestão cria, edita,
 * ativa/desativa e remove contratos pela UI — sem tocar no código. Cada linha
 * guarda os parâmetros de `RegrasContrato` (em minutos); `regrasDoContrato`
 * converte para as regras que o cálculo da jornada consome.
 */
@Injectable()
export class TiposContratoService {
  // Cache das regras por contrato (mudam pouco; limpo em qualquer mutação).
  private readonly cacheRegras = new Map<string, RegrasContrato>();
  private cacheRegrasPadrao: RegrasContrato | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private invalidarCache(): void {
    this.cacheRegras.clear();
    this.cacheRegrasPadrao = null;
  }

  /**
   * Lista os contratos (só ativos por padrão; o padrão vem primeiro), cada um
   * com `emUso` — a tela usa o indicador para travar as regras.
   */
  async listar(incluirInativos = false): Promise<TipoContratoComUso[]> {
    const linhas = await this.prisma.tipoContratoJornada.findMany({
      where: incluirInativos ? {} : { ativo: true },
      orderBy: [{ padrao: 'desc' }, { nome: 'asc' }],
      include: {
        _count: { select: { colaboradores: true, jornadaVigencias: true } },
      },
    });
    return linhas.map(({ _count, ...contrato }) => ({
      ...contrato,
      emUso:
        contrato.padrao ||
        (_count?.colaboradores ?? 0) + (_count?.jornadaVigencias ?? 0) > 0,
    }));
  }

  /** Cria um novo tipo de contrato. */
  async criar(dto: CriarTipoContratoDto): Promise<TipoContratoJornada> {
    // Contrato novo nasce 5x2 (2 folgas por semana) quando a tela não informa.
    const folgasPorSemana = dto.folgasPorSemana ?? 2;
    const folgasFixasPadrao = dto.folgasFixasPadrao ?? [];
    const permiteFolgaSabado = dto.permiteFolgaSabado ?? false;
    this.validarCoerencia({
      ...dto,
      folgasPorSemana,
      folgasFixasPadrao,
      permiteFolgaSabado,
    });
    await this.exigirNomeLivre(dto.nome.trim());
    const criado = await this.prisma.tipoContratoJornada.create({
      data: {
        nome: dto.nome.trim(),
        descricao: dto.descricao?.trim() || null,
        ativo: dto.ativo ?? true,
        // Um contrato criado pela UI nunca vira "padrão" automaticamente: o
        // padrão muda só por `definirPadrao`.
        padrao: false,
        cargaBaseMinPorDia: dto.cargaBaseMinPorDia,
        diasComAdicional100: dto.diasComAdicional100,
        maxTrabalhoSemIntervaloMin: dto.maxTrabalhoSemIntervaloMin,
        intervaloMinimoMin: dto.intervaloMinimoMin,
        intervaloMaximoMin: dto.intervaloMaximoMin,
        limiteExtrasMin: dto.limiteExtrasMin,
        riscoTac1h30Min: dto.riscoTac1h30Min,
        riscoTac1h40Min: dto.riscoTac1h40Min,
        intervaloMinimoEntreBatidasMin: dto.intervaloMinimoEntreBatidasMin ?? 2,
        intervaloObrigatorio: dto.intervaloObrigatorio ?? false,
        trabalhaDomingo: dto.trabalhaDomingo ?? true,
        cargaFeriadoMin: dto.cargaFeriadoMin ?? 440,
        feriadoAdicional100: dto.feriadoAdicional100 ?? true,
        limiteTrabalhoDiaMin: dto.limiteTrabalhoDiaMin ?? null,
        folgasPorSemana,
        folgasFixasPadrao,
        permiteFolgaSabado,
      },
    });
    this.invalidarCache();
    return criado;
  }

  /** Edita um tipo de contrato existente. */
  async atualizar(
    id: string,
    dto: AtualizarTipoContratoDto,
  ): Promise<TipoContratoJornada> {
    const atual = await this.obterOuFalhar(id);
    // Só conta como alteração o valor que MUDA: a tela antiga reenvia todos os
    // campos ao salvar, e renomear um contrato em uso deve continuar possível.
    const alteradas = CAMPOS_REGRA.filter(
      (campo) =>
        dto[campo] !== undefined && !mesmoValor(dto[campo], atual[campo]),
    );
    if (alteradas.length > 0) await this.exigirRegrasLivres(atual, alteradas);
    // Valida a coerência sobre o estado RESULTANTE (atual + alterações).
    this.validarCoerencia({
      cargaBaseMinPorDia: dto.cargaBaseMinPorDia ?? atual.cargaBaseMinPorDia,
      diasComAdicional100: dto.diasComAdicional100 ?? atual.diasComAdicional100,
      intervaloMinimoMin: dto.intervaloMinimoMin ?? atual.intervaloMinimoMin,
      intervaloMaximoMin: dto.intervaloMaximoMin ?? atual.intervaloMaximoMin,
      riscoTac1h30Min: dto.riscoTac1h30Min ?? atual.riscoTac1h30Min,
      riscoTac1h40Min: dto.riscoTac1h40Min ?? atual.riscoTac1h40Min,
      limiteExtrasMin: dto.limiteExtrasMin ?? atual.limiteExtrasMin,
      folgasPorSemana: dto.folgasPorSemana ?? atual.folgasPorSemana,
      folgasFixasPadrao: dto.folgasFixasPadrao ?? atual.folgasFixasPadrao,
      permiteFolgaSabado: dto.permiteFolgaSabado ?? atual.permiteFolgaSabado,
    });
    const nome = dto.nome?.trim();
    if (nome && nome !== atual.nome) await this.exigirNomeLivre(nome);

    const data: Prisma.TipoContratoJornadaUpdateInput = {
      ...(nome ? { nome } : {}),
      ...(dto.descricao !== undefined
        ? { descricao: dto.descricao?.trim() || null }
        : {}),
      ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
    };
    // Campos de regra: só os que mudaram (os iguais não precisam ir ao banco).
    for (const campo of alteradas) {
      (data as Record<string, unknown>)[campo] = dto[campo];
    }
    // Desativar o padrão é proibido (é o fallback do cálculo).
    if (dto.ativo === false && atual.padrao) {
      throw new BadRequestException(
        'Não é possível desativar o contrato padrão.',
      );
    }
    const atualizado = await this.prisma.tipoContratoJornada.update({
      where: { id },
      data,
    });
    this.invalidarCache();
    return atualizado;
  }

  /**
   * Torna `id` o contrato PADRÃO (spec `jornada-5x2`, R2.9): o que uma ficha
   * nova recebe quando ninguém escolhe e o que vale para as batidas sem ficha.
   *
   * Por isso a troca é recusada enquanto houver batida sem ficha: o padrão
   * decide TODOS os dias dela, e trocá-lo mudaria horas já calculadas.
   */
  async definirPadrao(id: string): Promise<TipoContratoJornada> {
    const alvo = await this.obterOuFalhar(id);
    if (alvo.padrao) return alvo;
    if (!alvo.ativo) {
      throw new BadRequestException(
        'Ative o contrato antes de torná-lo padrão.',
      );
    }
    const semFicha = await this.prisma.batidaPonto.count({
      where: { colaboradorId: null },
    });
    if (semFicha > 0) {
      throw new ConflictException(
        `Há ${semFicha} batida(s) de ponto sem ficha de colaborador. Elas usam o contrato padrão em todos os dias, e trocar o padrão mudaria as horas desses dias.`,
      );
    }
    const [, salvo] = await this.prisma.$transaction([
      this.prisma.tipoContratoJornada.updateMany({
        where: { padrao: true },
        data: { padrao: false },
      }),
      this.prisma.tipoContratoJornada.update({
        where: { id },
        data: { padrao: true },
      }),
    ]);
    this.invalidarCache();
    return salvo;
  }

  /**
   * Cria uma CÓPIA inativa e editável do contrato (spec `jornada-5x2`, R2.8):
   * é o caminho para mudar regras de um contrato em uso. A cópia nunca é o
   * padrão; o nome ganha "(cópia)" (ou "(cópia 2)", … se já existir).
   */
  async duplicar(id: string): Promise<TipoContratoJornada> {
    const origem = await this.obterOuFalhar(id);
    const nome = await this.nomeDaCopia(origem.nome);
    const regras = Object.fromEntries(
      CAMPOS_REGRA.map((campo) => [campo, origem[campo]]),
    ) as Pick<TipoContratoJornada, CampoRegra>;
    const copia = await this.prisma.tipoContratoJornada.create({
      data: {
        ...regras,
        nome,
        descricao: origem.descricao,
        ativo: false,
        padrao: false,
      },
    });
    this.invalidarCache();
    return copia;
  }

  /** Ativa ou desativa um contrato. O padrão não pode ser desativado. */
  async definirAtivo(id: string, ativo: boolean): Promise<TipoContratoJornada> {
    const atual = await this.obterOuFalhar(id);
    if (!ativo && atual.padrao) {
      throw new BadRequestException(
        'Não é possível desativar o contrato padrão.',
      );
    }
    const salvo = await this.prisma.tipoContratoJornada.update({
      where: { id },
      data: { ativo },
    });
    this.invalidarCache();
    return salvo;
  }

  /** Remove um contrato. O padrão e os que estão EM USO não podem ser removidos. */
  async remover(id: string): Promise<void> {
    const atual = await this.obterOuFalhar(id);
    if (atual.padrao) {
      throw new BadRequestException(
        'Não é possível excluir o contrato padrão.',
      );
    }
    const emUso = await this.prisma.colaborador.count({
      where: { tipoContratoJornadaId: id },
    });
    if (emUso > 0) {
      throw new BadRequestException(
        `Este contrato está em uso por ${emUso} colaborador(es). Reatribua-os antes de remover (ou apenas desative o contrato).`,
      );
    }
    // Uma vigência da jornada (spec jornada-5x2) também é uso: o contrato decide
    // os dias daquele período, mesmo que hoje a pessoa esteja em outro.
    const emVigencias = await this.prisma.jornadaVigencia.count({
      where: { tipoContratoJornadaId: id },
    });
    if (emVigencias > 0) {
      throw new BadRequestException(
        `Este contrato está no histórico de jornada de ${emVigencias} vigência(s) e decide os dias desse período. Apenas desative o contrato.`,
      );
    }
    await this.prisma.tipoContratoJornada.delete({ where: { id } });
    this.invalidarCache();
  }

  /**
   * Regras de jornada de um contrato pelo id (ou o padrão quando ausente/
   * desconhecido). Ponte para o cálculo da jornada (usada no cabeamento por
   * colaborador). Cai no `REGRAS_PADRAO` do código se nem o padrão existir.
   */
  async regrasDoContrato(id?: string | null): Promise<RegrasContrato> {
    if (id) {
      const emCache = this.cacheRegras.get(id);
      if (emCache) return emCache;
      const modelo = await this.prisma.tipoContratoJornada.findUnique({
        where: { id },
      });
      if (modelo) {
        const regras = regrasContratoDeModelo(modelo);
        this.cacheRegras.set(id, regras);
        return regras;
      }
      // Id desconhecido (ex.: contrato removido): cai no padrão.
    }
    if (!this.cacheRegrasPadrao) {
      const padrao = await this.contratoPadrao();
      this.cacheRegrasPadrao = padrao
        ? regrasContratoDeModelo(padrao)
        : REGRAS_PADRAO;
    }
    return this.cacheRegrasPadrao;
  }

  /**
   * Regras de jornada do colaborador **num dia**: o contrato da vigência da
   * jornada daquele dia (spec `jornada-5x2`, ADR 0027) ou, antes da primeira
   * vigência, o da ficha. Sem colaborador, o padrão.
   *
   * O dia é obrigatório de propósito: sem ele a pergunta era "qual o contrato
   * agora?", e trocar o contrato de alguém reescrevia todos os dias passados.
   */
  async regrasDoColaborador(
    colaboradorId: string | null | undefined,
    dia: Date,
  ): Promise<RegrasContrato> {
    if (!colaboradorId) return this.regrasDoContrato(null);
    const [vigencia, colab] = await Promise.all([
      this.prisma.jornadaVigencia.findFirst({
        where: { colaboradorId, vigenteDesde: { lte: inicioDoDia(dia) } },
        orderBy: { vigenteDesde: 'desc' },
        select: { tipoContratoJornadaId: true },
      }),
      this.prisma.colaborador.findUnique({
        where: { id: colaboradorId },
        select: { tipoContratoJornadaId: true },
      }),
    ]);
    return this.regrasDoContrato(
      vigencia?.tipoContratoJornadaId ?? colab?.tipoContratoJornadaId ?? null,
    );
  }

  /**
   * Como `regrasDoColaborador`, mas para MUITOS dias da mesma pessoa: carrega a
   * ficha e as vigências uma vez e devolve uma função síncrona `dia → regras`.
   * Serve aos relatórios do mês, que antes resolviam o contrato uma vez e o
   * aplicavam a todos os dias — exatamente o atalho que reescrevia o passado.
   */
  async resolvedorDeRegras(
    colaboradorId: string | null | undefined,
  ): Promise<(dia: Date) => RegrasContrato> {
    if (!colaboradorId) {
      const padrao = await this.regrasDoContrato(null);
      return () => padrao;
    }
    const [vigencias, colab] = await Promise.all([
      this.prisma.jornadaVigencia.findMany({
        where: { colaboradorId },
        select: { vigenteDesde: true, tipoContratoJornadaId: true },
      }),
      this.prisma.colaborador.findUnique({
        where: { id: colaboradorId },
        select: { tipoContratoJornadaId: true },
      }),
    ]);
    const daFicha = await this.regrasDoContrato(
      colab?.tipoContratoJornadaId ?? null,
    );
    const ordenadas = vigencias
      .map((v) => ({
        inicio: inicioDoDia(v.vigenteDesde).getTime(),
        id: v.tipoContratoJornadaId,
      }))
      .sort((a, b) => b.inicio - a.inicio);
    const porContrato = new Map<string, RegrasContrato>();
    for (const v of ordenadas) {
      if (!porContrato.has(v.id)) {
        porContrato.set(v.id, await this.regrasDoContrato(v.id));
      }
    }
    return (dia) => {
      const alvo = inicioDoDia(dia).getTime();
      const vigente = ordenadas.find((v) => v.inicio <= alvo);
      return vigente ? porContrato.get(vigente.id)! : daFicha;
    };
  }

  private async contratoPadrao(): Promise<TipoContratoJornada | null> {
    return this.prisma.tipoContratoJornada.findFirst({
      where: { padrao: true },
    });
  }

  private async obterOuFalhar(id: string): Promise<TipoContratoJornada> {
    const t = await this.prisma.tipoContratoJornada.findUnique({
      where: { id },
    });
    if (!t) throw new NotFoundException('Tipo de contrato não encontrado.');
    return t;
  }

  private async exigirNomeLivre(nome: string): Promise<void> {
    const existe = await this.prisma.tipoContratoJornada.findUnique({
      where: { nome },
    });
    if (existe) {
      throw new ConflictException('Já existe um contrato com esse nome.');
    }
  }

  /**
   * Recusa mudar regras de um contrato em uso (R2.8): as fichas e vigências
   * que o usam teriam os dias já calculados reescritos. O padrão conta como em
   * uso sempre (decide as batidas sem ficha).
   */
  private async exigirRegrasLivres(
    atual: TipoContratoJornada,
    alteradas: readonly CampoRegra[],
  ): Promise<void> {
    const [fichas, vigencias] = await Promise.all([
      this.prisma.colaborador.count({
        where: { tipoContratoJornadaId: atual.id },
      }),
      this.prisma.jornadaVigencia.count({
        where: { tipoContratoJornadaId: atual.id },
      }),
    ]);
    if (!atual.padrao && fichas + vigencias === 0) return;
    const campos = alteradas.map((c) => ROTULO_CAMPO[c]).join(', ');
    throw new ConflictException(
      `Este contrato está em uso e as regras de cálculo não podem mudar (${campos}): mudariam os dias já calculados. Duplique o contrato e aplique a cópia com vigência. Nome, descrição e ativo continuam editáveis.`,
    );
  }

  /** "Nome (cópia)", ou "Nome (cópia 2)", … o primeiro livre, até 60 letras. */
  private async nomeDaCopia(nomeOrigem: string): Promise<string> {
    for (let n = 1; n < 100; n++) {
      const sufixo = n === 1 ? ' (cópia)' : ` (cópia ${n})`;
      const base = nomeOrigem.slice(0, NOME_MAX - sufixo.length).trimEnd();
      const nome = `${base}${sufixo}`;
      const existe = await this.prisma.tipoContratoJornada.findUnique({
        where: { nome },
      });
      if (!existe) return nome;
    }
    throw new ConflictException(
      'Não foi possível gerar um nome livre para a cópia.',
    );
  }

  /** Valida a coerência dos limites (as faixas do class-validator já cobrem o resto). */
  private validarCoerencia(r: ParametrosRegra): void {
    if (r.cargaBaseMinPorDia.length !== 7) {
      throw new BadRequestException(
        'A carga base deve ter 7 valores (domingo a sábado).',
      );
    }
    if (r.diasComAdicional100.some((d) => d < 0 || d > 6)) {
      throw new BadRequestException(
        'Os dias com adicional de 100% devem estar entre 0 (domingo) e 6 (sábado).',
      );
    }
    if (r.intervaloMinimoMin >= r.intervaloMaximoMin) {
      throw new BadRequestException(
        'O intervalo mínimo deve ser menor que o máximo.',
      );
    }
    if (!(
      r.riscoTac1h30Min <= r.riscoTac1h40Min &&
      r.riscoTac1h40Min <= r.limiteExtrasMin
    )) {
      throw new BadRequestException(
        'Os limites devem crescer: 1º aviso ≤ 2º aviso ≤ limite de extras.',
      );
    }
    const folgas = r.folgasFixasPadrao;
    if (folgas.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      throw new BadRequestException(
        'As folgas padrão devem estar entre 0 (domingo) e 6 (sábado).',
      );
    }
    if (new Set(folgas).size !== folgas.length) {
      throw new BadRequestException('As folgas padrão não podem se repetir.');
    }
    if (folgas.length > r.folgasPorSemana) {
      throw new BadRequestException(
        `O contrato tem ${r.folgasPorSemana} folga(s) por semana; as folgas padrão não podem passar disso.`,
      );
    }
    if (folgas.includes(6) && !r.permiteFolgaSabado) {
      throw new BadRequestException(
        'O sábado só pode ser folga padrão se o contrato permitir folga no sábado.',
      );
    }
  }
}
