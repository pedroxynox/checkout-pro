import { dataPermitida, inicioDoDiaUTC } from './data-inicial.domain';
import { ErroDataAnteriorInicial } from './data-inicial.errors';

/**
 * Testes unitários (jest) do domínio puro da Data_Inicial_Sistema e do erro
 * `ErroDataAnteriorInicial`. Exemplos concretos de fronteira complementam o
 * teste de propriedade.
 */
describe('data-inicial.domain — dataPermitida (fronteira)', () => {
  const inicial = new Date('2026-07-01T00:00:00.000Z');

  it('rejeita a véspera (30/06/2026)', () => {
    expect(dataPermitida(new Date('2026-06-30T23:59:59.999Z'), inicial)).toBe(
      false,
    );
  });

  it('aceita o mesmo dia (01/07/2026), independentemente da hora', () => {
    expect(dataPermitida(new Date('2026-07-01T00:00:00.000Z'), inicial)).toBe(
      true,
    );
    expect(dataPermitida(new Date('2026-07-01T23:59:59.999Z'), inicial)).toBe(
      true,
    );
  });

  it('aceita o dia seguinte (02/07/2026)', () => {
    expect(dataPermitida(new Date('2026-07-02T08:00:00.000Z'), inicial)).toBe(
      true,
    );
  });

  it('inicioDoDiaUTC normaliza para o começo do dia (UTC)', () => {
    const meia = inicioDoDiaUTC(new Date('2026-07-01T15:30:00.000Z'));
    expect(meia).toBe(Date.UTC(2026, 6, 1));
  });
});

describe('ErroDataAnteriorInicial', () => {
  it('tem statusHttp 400 e mensagem pt-BR com a data mínima em dd/mm/aaaa', () => {
    const erro = new ErroDataAnteriorInicial(
      new Date('2026-07-01T00:00:00.000Z'),
    );
    expect(erro.statusHttp).toBe(400);
    expect(erro.message).toContain('01/07/2026');
    expect(erro.message.toLowerCase()).toContain('data inicial');
  });
});
