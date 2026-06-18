import { Injectable } from '@nestjs/common';
import { RegistroImportacao } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  IntervaloDatas,
  LinhaImportada,
  PessoaCadastrada,
  TIPO_ARQUIVO_PARA_REGISTRO,
  TipoArquivo,
  historico,
  nomesNaoReconhecidos,
  particionarLinhas,
  statusDoDia,
  tiposPendentes,
  validarColunas,
  vincularPorNome,
} from './importacoes.domain';
import { ColunaAusenteError } from './importacoes.errors';

/** Resultado de uma importação bem-sucedida. */
export interface ResultadoImportacao {
  registroImportacaoId: string;
  tipo: TipoArquivo;
  dataReferencia: Date;
  totalVinculados: number;
  nomesNaoReconhecidos: string[];
}

/**
 * Limites (00:00 e 23:59:59.999 UTC) do dia civil de uma data, para consultar
 * importações/registros por dia de referência.
 */
function limitesDoDia(data: Date): { inicio: Date; fim: Date } {
  const inicio = new Date(
    Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()),
  );
  const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { inicio, fim };
}

/**
 * Serviço do Modulo_Importacoes: validação de colunas (1.1.6), vinculação por
 * nome e fila de não reconhecidos (1.1.7, 1.1.8), persistência da importação,
 * status diário por arquivo (1.2), pendentes de fim do dia (1.4.1) e histórico
 * ordenado/filtrado (1.3).
 *
 * A lógica de decisão é delegada a funções puras (`importacoes.domain`); este
 * serviço cuida apenas dos efeitos colaterais (consultas e escritas via
 * Prisma).
 */
@Injectable()
export class ImportacoesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Valida o cabeçalho de um arquivo (Req 1.1.6). Delega à função pura
   * `validarColunas` e lança `ColunaAusenteError` quando faltar coluna
   * obrigatória, com mensagem descritiva indicando a coluna ausente.
   */
  validarColunas(tipo: TipoArquivo, cabecalho: readonly string[]): void {
    const resultado = validarColunas(tipo, cabecalho);
    if (!resultado.valido) {
      throw new ColunaAusenteError(resultado.colunasAusentes);
    }
  }

  /** Carrega as pessoas (operadores + fiscais) candidatas à vinculação. */
  private async pessoasCadastradas(): Promise<PessoaCadastrada[]> {
    const [operadores, fiscais] = await Promise.all([
      this.prisma.operador.findMany({ select: { id: true, nome: true } }),
      this.prisma.fiscal.findMany({ select: { id: true, nome: true } }),
    ]);
    return [
      ...operadores.map(
        (o): PessoaCadastrada => ({
          id: o.id,
          nome: o.nome,
          tipo: 'OPERADOR',
        }),
      ),
      ...fiscais.map(
        (f): PessoaCadastrada => ({ id: f.id, nome: f.nome, tipo: 'FISCAL' }),
      ),
    ];
  }

  /**
   * Tenta vincular um nome a um operador ou fiscal cadastrado (Req 1.1.7,
   * 1.1.8). Retorna a pessoa correspondente ou `null`.
   */
  async vincularPorNome(nome: string): Promise<PessoaCadastrada | null> {
    const pessoas = await this.pessoasCadastradas();
    return vincularPorNome(pessoas, nome);
  }

  /**
   * Importa um conjunto de linhas já parseadas de um tipo de arquivo
   * (Req 1.1.7, 1.1.8, 1.3.1). Particiona as linhas entre vinculadas e não
   * reconhecidas, persiste o `RegistroImportacao` (tipo, data de referência,
   * data/hora, usuário e nomes não reconhecidos) e os `RegistroOperacional`
   * das linhas vinculadas.
   */
  async importar(
    tipo: TipoArquivo,
    linhas: LinhaImportada[],
    usuarioId: string | null,
    dataReferencia: Date,
  ): Promise<ResultadoImportacao> {
    const pessoas = await this.pessoasCadastradas();
    const particao = particionarLinhas(linhas, pessoas);
    const naoReconhecidos = nomesNaoReconhecidos(particao);
    const tipoRegistro = TIPO_ARQUIVO_PARA_REGISTRO[tipo];

    const importacao = await this.prisma.registroImportacao.create({
      data: {
        tipo: tipoRegistro,
        dataReferencia,
        importadoPor: usuarioId ?? undefined,
        nomesNaoReconhecidos: naoReconhecidos,
        registros: {
          create: particao.vinculados.map(({ linha, pessoa }) => ({
            tipo: tipoRegistro,
            data: linha.data,
            pessoaId: pessoa.id,
            valor: linha.valor,
            operadorId: pessoa.tipo === 'OPERADOR' ? pessoa.id : undefined,
            fiscalId: pessoa.tipo === 'FISCAL' ? pessoa.id : undefined,
          })),
        },
      },
    });

    return {
      registroImportacaoId: importacao.id,
      tipo,
      dataReferencia,
      totalVinculados: particao.vinculados.length,
      nomesNaoReconhecidos: naoReconhecidos,
    };
  }

  /** Mapeia o enum de registro persistido de volta para o tipo de arquivo. */
  private registroParaArquivo(tipoRegistro: string): TipoArquivo {
    const par = Object.entries(TIPO_ARQUIVO_PARA_REGISTRO).find(
      ([, registro]) => registro === tipoRegistro,
    );
    return (par?.[0] as TipoArquivo) ?? 'CANCELAMENTO_ITENS';
  }

  /**
   * Calcula o status ("importado"/"pendente") de cada tipo de arquivo do dia
   * informado (Req 1.2.1–1.2.3), com base nas importações registradas naquele
   * dia de referência.
   */
  async statusDoDia(
    data: Date,
  ): Promise<Record<TipoArquivo, 'importado' | 'pendente'>> {
    const { inicio, fim } = limitesDoDia(data);
    const importacoes = await this.prisma.registroImportacao.findMany({
      where: { dataReferencia: { gte: inicio, lte: fim } },
      select: { tipo: true },
    });
    const tiposImportados = importacoes.map((i) =>
      this.registroParaArquivo(i.tipo),
    );
    return statusDoDia(tiposImportados);
  }

  /**
   * Retorna os tipos de arquivo do dia ainda pendentes (Req 1.4.1) — o
   * complemento exato dos tipos importados naquele dia de referência.
   */
  async verificarPendentesFimDoDia(data: Date): Promise<TipoArquivo[]> {
    const { inicio, fim } = limitesDoDia(data);
    const importacoes = await this.prisma.registroImportacao.findMany({
      where: { dataReferencia: { gte: inicio, lte: fim } },
      select: { tipo: true },
    });
    const tiposImportados = importacoes.map((i) =>
      this.registroParaArquivo(i.tipo),
    );
    return tiposPendentes(tiposImportados);
  }

  /**
   * Lista o histórico de importações ordenado da mais recente para a mais
   * antiga (Req 1.3.2); quando um intervalo é informado, filtra pelos registros
   * cuja data de referência está dentro do intervalo (Req 1.3.3).
   */
  async historico(intervalo?: IntervaloDatas): Promise<RegistroImportacao[]> {
    const registros = await this.prisma.registroImportacao.findMany();
    return historico(registros, intervalo);
  }
}
