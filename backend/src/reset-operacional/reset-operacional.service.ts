import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResetOperacionalDto } from './dto/reset-operacional.dto';
import { ConfirmacaoAusenteError } from './reset-operacional.errors';
import { PLANO_REINICIO, ResumoDeReinicio } from './reset-operacional.domain';

/**
 * Função que apaga todos os registros de uma entidade dentro de uma transação,
 * devolvendo a contagem apagada. Mapeia o nome `@@map` da tabela para o
 * *delegate* Prisma correspondente de forma tipada (sem `any`).
 */
type Apagador = (tx: Prisma.TransactionClient) => Promise<{ count: number }>;

/**
 * Mapa nome-de-entidade (`@@map`) → apagador tipado. Precisa cobrir todas as
 * entidades com ação `APAGAR` no `PLANO_REINICIO`.
 */
const APAGADORES: Readonly<Record<string, Apagador>> = {
  movimentos_lote_apae: (tx) => tx.movimentoLoteApae.deleteMany({}),
  lotes_apae: (tx) => tx.loteApae.deleteMany({}),
  movimentos_estoque: (tx) => tx.movimentoEstoque.deleteMany({}),
  requisicoes: (tx) => tx.requisicao.deleteMany({}),
  sugestoes_pedido: (tx) => tx.sugestaoPedido.deleteMany({}),
  registros_operacionais: (tx) => tx.registroOperacional.deleteMany({}),
  registros_importacao: (tx) => tx.registroImportacao.deleteMany({}),
  registros_ponto_fiscal: (tx) => tx.registroPontoFiscal.deleteMany({}),
  ausencias: (tx) => tx.ausencia.deleteMany({}),
  incidencias_escala: (tx) => tx.incidenciaEscala.deleteMany({}),
  vendas_diarias: (tx) => tx.vendaDiaria.deleteMany({}),
  vendas_hora: (tx) => tx.vendaHora.deleteMany({}),
  registros_arrecadacao: (tx) => tx.registroArrecadacao.deleteMany({}),
  arrecadacao_sem_movimento: (tx) => tx.arrecadacaoSemMovimento.deleteMany({}),
  notificacoes: (tx) => tx.notificacao.deleteMany({}),
  mensagens_assistente: (tx) => tx.mensagemAssistente.deleteMany({}),
  fechamentos_concluidos: (tx) => tx.fechamentoConcluido.deleteMany({}),
  checklists: (tx) => tx.checklist.deleteMany({}),
};

/**
 * Serviço do Modulo_ResetOperacional: apaga os `Dados_de_Movimento` e zera o
 * `saldo` dos insumos numa **única transação** (tudo ou nada), conservando os
 * `Dados_de_Cadastro`. É idempotente (rodar de novo sobre um sistema já zerado
 * conclui com contagens 0) e devolve um `Resumo_de_Reinicio` com a contagem por
 * entidade.
 *
 * O QUE apagar e em QUE ordem vive no domínio puro (`PLANO_REINICIO`); aqui só
 * ocorre a execução (efeitos colaterais no banco).
 *
 * Requisitos 2.1–2.7, 3.3, 3.5, 4.1, 4.2, 4.4.
 */
@Injectable()
export class ResetOperacionalService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Executa o reinício operacional. Revalida o marcador de confirmação (defesa
   * em profundidade) e percorre o plano dentro de `prisma.$transaction`,
   * acumulando a contagem apagada por entidade e zerando `insumos.saldo`. Se
   * qualquer passo falhar, a transação reverte por completo (Req 4.2).
   */
  async reiniciar(dto: ResetOperacionalDto): Promise<ResumoDeReinicio> {
    if (dto?.confirmacao !== 'ZERAR') {
      throw new ConfirmacaoAusenteError();
    }

    return this.prisma.$transaction(async (tx) => {
      const resumo: ResumoDeReinicio = {};
      for (const passo of PLANO_REINICIO) {
        if (passo.acao === 'APAGAR') {
          const apagador = APAGADORES[passo.entidade];
          if (!apagador) {
            // Salvaguarda: plano e mapa de apagadores precisam ficar em sincronia.
            throw new Error(
              `Entidade sem apagador mapeado no reinício: ${passo.entidade}`,
            );
          }
          const { count } = await apagador(tx);
          resumo[passo.entidade] = count;
        } else if (passo.acao === 'ZERAR_SALDO_INSUMOS') {
          await tx.insumo.updateMany({ data: { saldo: 0 } }); // Req 2.3
        }
      }
      return resumo; // Req 4.4
    });
  }
}
