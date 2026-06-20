import { resumoEstoque } from './insumos.domain';

/**
 * Testes do resumo de estoque do painel (consumo/entrada da semana e previsão
 * de ruptura). Tudo em quantidade (unidade base), nunca em R$.
 */
describe('resumoEstoque', () => {
  const AGORA = new Date('2026-06-19T12:00:00.000Z');
  const diasAtras = (n: number): Date =>
    new Date(AGORA.getTime() - n * 24 * 60 * 60 * 1000);

  it('soma o saldo e separa consumo/entrada dos últimos 7 dias', () => {
    const movimentos = [
      { delta: 1000, dataHora: diasAtras(10) }, // entrada antiga (fora da semana)
      { delta: 500, dataHora: diasAtras(3) }, // entrada na semana
      { delta: -200, dataHora: diasAtras(2) }, // consumo na semana
      { delta: -300, dataHora: diasAtras(1) }, // consumo na semana
      { delta: -100, dataHora: diasAtras(20) }, // consumo antigo (fora da semana)
    ];

    const r = resumoEstoque(movimentos, 100, AGORA);

    expect(r.saldo).toBe(1000 + 500 - 200 - 300 - 100); // 900
    expect(r.consumoSemana).toBe(500); // 200 + 300
    expect(r.entradaSemana).toBe(500);
    expect(r.estoqueBaixo).toBe(false);
    // 900 / 500 = 1.8 semanas restantes
    expect(r.semanasRestantes).toBeCloseTo(1.8, 5);
  });

  it('marca estoque baixo no limite e não projeta sem consumo', () => {
    const movimentos = [{ delta: 100, dataHora: diasAtras(2) }];
    const r = resumoEstoque(movimentos, 100, AGORA);

    expect(r.saldo).toBe(100);
    expect(r.estoqueBaixo).toBe(true); // saldo <= limite
    expect(r.consumoSemana).toBe(0);
    expect(r.semanasRestantes).toBeNull(); // sem consumo, sem projeção
  });
});
