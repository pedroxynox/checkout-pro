import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  DEPENDENCIAS_FK,
  ENTIDADES_CONSERVADAS,
  ENTIDADES_MOVIMENTO_ESPERADAS,
  PLANO_REINICIO,
  entidadesApagadas,
  executarPlanoPuro,
  ordemRespeitaDependencias,
  planoEhParticaoValida,
} from './reset-operacional.domain';
import { ConfirmacaoAusenteError } from './reset-operacional.errors';
import { ResetOperacionalDto } from './dto/reset-operacional.dto';

/**
 * Testes unitários (jest) do domínio puro do reinício operacional, do erro de
 * confirmação e do DTO.
 */
describe('reset-operacional.domain', () => {
  it('a ordem do plano respeita as dependências de FK (filho antes do pai)', () => {
    // Req 2.4, 2.7 — movimentos_lote_apae → lotes_apae e
    // registros_operacionais → registros_importacao.
    expect(ordemRespeitaDependencias(PLANO_REINICIO, DEPENDENCIAS_FK)).toBe(
      true,
    );
  });

  it('a partição apagar/conservar é disjunta', () => {
    expect(planoEhParticaoValida(PLANO_REINICIO, ENTIDADES_CONSERVADAS)).toBe(
      true,
    );
  });

  it('apaga exatamente as 18 entidades de movimento esperadas', () => {
    const apagadas = entidadesApagadas(PLANO_REINICIO);
    expect(apagadas.size).toBe(18);
    expect(apagadas.size).toBe(ENTIDADES_MOVIMENTO_ESPERADAS.length);
    for (const e of ENTIDADES_MOVIMENTO_ESPERADAS) {
      expect(apagadas.has(e)).toBe(true);
    }
  });

  it('insumos é conservado (só o saldo é zerado, não entra em entidadesApagadas)', () => {
    expect(entidadesApagadas(PLANO_REINICIO).has('insumos')).toBe(false);
    expect(ENTIDADES_CONSERVADAS).toContain('insumos');
    // Existe um passo de zeramento de saldo para insumos.
    expect(
      PLANO_REINICIO.some(
        (p) => p.entidade === 'insumos' && p.acao === 'ZERAR_SALDO_INSUMOS',
      ),
    ).toBe(true);
  });

  it('executarPlanoPuro zera as entidades apagadas e resume o que existia', () => {
    const estado = {
      vendas_diarias: 3,
      vendas_hora: 10,
      notificacoes: 5,
      insumos: 42, // conservada
      usuarios: 7, // conservada
    };
    const { estadoFinal, resumo } = executarPlanoPuro(estado);
    expect(estadoFinal.vendas_diarias).toBe(0);
    expect(estadoFinal.vendas_hora).toBe(0);
    expect(estadoFinal.notificacoes).toBe(0);
    // Conservadas não são tocadas pelo modelo puro.
    expect(estadoFinal.insumos).toBe(42);
    expect(estadoFinal.usuarios).toBe(7);
    // Resumo reflete o que existia nas entidades apagadas.
    expect(resumo.vendas_diarias).toBe(3);
    expect(resumo.vendas_hora).toBe(10);
    expect(resumo.notificacoes).toBe(5);
    // Conservadas não aparecem no resumo.
    expect(resumo.insumos).toBeUndefined();
    expect(resumo.usuarios).toBeUndefined();
  });
});

describe('ConfirmacaoAusenteError', () => {
  it('tem statusHttp 400 e mensagem pt-BR pedindo confirmacao "ZERAR"', () => {
    const erro = new ConfirmacaoAusenteError();
    expect(erro.statusHttp).toBe(400);
    expect(erro.message).toContain('ZERAR');
  });
});

describe('ResetOperacionalDto', () => {
  it('aceita confirmacao = "ZERAR"', async () => {
    const dto = plainToInstance(ResetOperacionalDto, { confirmacao: 'ZERAR' });
    const erros = await validate(dto);
    expect(erros).toHaveLength(0);
  });

  it('rejeita confirmacao ausente ou inválida', async () => {
    const ausente = plainToInstance(ResetOperacionalDto, {});
    const invalida = plainToInstance(ResetOperacionalDto, {
      confirmacao: 'sim',
    });
    expect((await validate(ausente)).length).toBeGreaterThan(0);
    expect((await validate(invalida)).length).toBeGreaterThan(0);
  });
});
