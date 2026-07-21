import * as fc from 'fast-check';
import {
  MOTIVOS_JUSTIFICATIVA,
  MotivoJustificativa,
  PESO_ATESTADO,
  PESO_OUTROS_JUSTIFICADOS,
  STATUS_JUSTIFICATIVA,
  StatusJustificativa,
  montarDadosJustificativa,
  motivoObrigatorio,
  pesoOcorrencia,
  somaPonderada,
} from './justificativas';

/**
 * Testes de propriedade (fast-check, ≥100 runs) do peso de justificativa.
 * Regras de negócio: PENDENTE/INJUSTIFICADA pesam integral (1); JUSTIFICADA por
 * atestado pesa 2%; JUSTIFICADA por outro motivo pesa 10% (ver ADR 0009).
 */
const NUM_RUNS = 100;

const statusArb = fc.constantFrom<StatusJustificativa>(...STATUS_JUSTIFICATIVA);
const motivoArb = fc.constantFrom<MotivoJustificativa>(
  ...MOTIVOS_JUSTIFICATIVA,
);

describe('Justificativas — peso', () => {
  it('Property 1: peso ∈ {1, 0.02, 0.10} e nunca aumenta o impacto', () => {
    fc.assert(
      fc.property(
        statusArb,
        fc.option(motivoArb, { nil: null }),
        (status, motivo) => {
          const p = pesoOcorrencia(status, motivo);
          if (status !== 'JUSTIFICADA') return p === 1;
          if (!motivo) return p === 1; // justificada sem motivo → conservador
          return motivo === 'ATESTADO_MEDICO'
            ? p === PESO_ATESTADO
            : p === PESO_OUTROS_JUSTIFICADOS;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('Property 2: justificar nunca aumenta o peso vs. pendente (≤ 1)', () => {
    fc.assert(
      fc.property(
        statusArb,
        fc.option(motivoArb, { nil: null }),
        (status, motivo) => {
          return pesoOcorrencia(status, motivo) <= 1;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('Property 3: somaPonderada = soma dos pesos individuais (≤ contagem crua)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            statusJustificativa: fc.option(statusArb, { nil: undefined }),
            motivoJustificativa: fc.option(motivoArb, { nil: null }),
          }),
          { maxLength: 30 },
        ),
        (ocorrencias) => {
          const soma = somaPonderada(ocorrencias);
          const esperado = ocorrencias.reduce(
            (acc, o) =>
              acc +
              pesoOcorrencia(
                o.statusJustificativa ?? 'PENDENTE',
                o.motivoJustificativa,
              ),
            0,
          );
          return (
            Math.abs(soma - esperado) < 1e-9 &&
            soma <= ocorrencias.length + 1e-9
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('motivoObrigatorio só para JUSTIFICADA', () => {
    expect(motivoObrigatorio('JUSTIFICADA')).toBe(true);
    expect(motivoObrigatorio('PENDENTE')).toBe(false);
    expect(motivoObrigatorio('INJUSTIFICADA')).toBe(false);
  });
});

/**
 * Primitiva partilhada de montagem dos campos de justificativa (fonte única de
 * faltas e não-retornos). `agora` é injetado para tornar os testes determinísticos.
 */
describe('montarDadosJustificativa', () => {
  const autor = { id: 'u1', nome: 'Ana' };
  const agora = new Date('2026-07-20T12:00:00.000Z');

  it('PENDENTE (reabrir) limpa motivo, observação e toda a auditoria', () => {
    const dados = montarDadosJustificativa(
      { status: 'PENDENTE', motivo: 'ATESTADO_MEDICO', observacao: 'x' },
      autor,
      agora,
    );
    expect(dados).toEqual({
      statusJustificativa: 'PENDENTE',
      motivoJustificativa: null,
      observacaoJustificativa: null,
      justificadaPorId: null,
      justificadaPorNome: null,
      justificadaEm: null,
    });
  });

  it('JUSTIFICADA grava motivo, observação e auditoria (com agora injetado)', () => {
    const dados = montarDadosJustificativa(
      { status: 'JUSTIFICADA', motivo: 'ABONADA', observacao: 'ok' },
      autor,
      agora,
    );
    expect(dados).toEqual({
      statusJustificativa: 'JUSTIFICADA',
      motivoJustificativa: 'ABONADA',
      observacaoJustificativa: 'ok',
      justificadaPorId: 'u1',
      justificadaPorNome: 'Ana',
      justificadaEm: agora,
    });
  });

  it('INJUSTIFICADA descarta o motivo mas mantém observação e auditoria', () => {
    const dados = montarDadosJustificativa(
      { status: 'INJUSTIFICADA', motivo: 'ATESTADO_MEDICO', observacao: 'nao' },
      autor,
      agora,
    );
    expect(dados.statusJustificativa).toBe('INJUSTIFICADA');
    expect(dados.motivoJustificativa).toBeNull();
    expect(dados.observacaoJustificativa).toBe('nao');
    expect(dados.justificadaPorId).toBe('u1');
    expect(dados.justificadaEm).toEqual(agora);
  });

  it('autor sem id/nome vira null (auditoria opcional)', () => {
    const dados = montarDadosJustificativa(
      { status: 'JUSTIFICADA', motivo: 'OUTRO' },
      {},
      agora,
    );
    expect(dados.justificadaPorId).toBeNull();
    expect(dados.justificadaPorNome).toBeNull();
    expect(dados.observacaoJustificativa).toBeNull();
  });

  it('Property: para status ≠ PENDENTE preserva statusJustificativa e usa `agora`', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<StatusJustificativa>('JUSTIFICADA', 'INJUSTIFICADA'),
        fc.option(motivoArb, { nil: null }),
        (status, motivo) => {
          const dados = montarDadosJustificativa(
            { status, motivo },
            autor,
            agora,
          );
          const motivoOk =
            status === 'JUSTIFICADA'
              ? dados.motivoJustificativa === (motivo ?? null)
              : dados.motivoJustificativa === null;
          return (
            dados.statusJustificativa === status &&
            dados.justificadaEm === agora &&
            motivoOk
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
