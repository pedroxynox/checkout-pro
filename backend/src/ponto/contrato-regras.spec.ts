import {
  CONTRATO_PADRAO,
  REGISTRO_CONTRATOS,
  regrasDoContrato,
} from './contrato-regras';
import {
  calcularJornadaDia,
  REGRAS_PADRAO,
  REGRAS_SEIS_X_UM_DOIS_X_UM,
  RegrasContrato,
} from './ponto.domain';

describe('regrasDoContrato', () => {
  it('devolve as regras do contrato 6x1–2x1 pelo tipo', () => {
    expect(regrasDoContrato('SEIS_X_UM_DOIS_X_UM')).toBe(
      REGRAS_SEIS_X_UM_DOIS_X_UM,
    );
  });

  it('cai no contrato vigente para tipo ausente ou desconhecido', () => {
    expect(regrasDoContrato(undefined)).toBe(
      REGISTRO_CONTRATOS[CONTRATO_PADRAO],
    );
    expect(regrasDoContrato('NAO_EXISTE')).toBe(
      REGISTRO_CONTRATOS[CONTRATO_PADRAO],
    );
  });

  it('as regras do 6x1 preservam as cargas atuais (7h / 7h20 / 8h)', () => {
    const r = REGRAS_SEIS_X_UM_DOIS_X_UM;
    expect(r.cargaBaseMs(0)).toBe(26_400_000); // domingo 7h20
    expect(r.cargaBaseMs(1)).toBe(25_200_000); // seg-qui 7h
    expect(r.cargaBaseMs(6)).toBe(28_800_000); // sex-sáb 8h
    expect(r.temAdicional100(0)).toBe(true); // domingo 100%
    expect(r.temAdicional100(3)).toBe(false); // dia útil 50%
  });
});

describe('calcularJornadaDia é genérico sobre o contrato', () => {
  // Jornada fechada de 7h (07-11 + 12-15), numa segunda-feira.
  const batidas = [
    { id: '1', hora: new Date('2026-07-13T07:00:00.000Z') },
    { id: '2', hora: new Date('2026-07-13T11:00:00.000Z') },
    { id: '3', hora: new Date('2026-07-13T12:00:00.000Z') },
    { id: '4', hora: new Date('2026-07-13T15:00:00.000Z') },
  ];
  const agora = new Date('2026-07-13T23:00:00.000Z');

  it('sem regras usa o contrato padrão (base 7h, sem extras)', () => {
    const j = calcularJornadaDia(batidas, agora, 1, false, true);
    expect(j.baseMs).toBe(25_200_000);
    expect(j.trabalhadoMs).toBe(7 * 3_600_000);
    expect(j.horasExtrasMs).toBe(0);
  });

  it('com outra base contratual, o mesmo dia gera horas extras', () => {
    const regras: RegrasContrato = {
      ...REGRAS_PADRAO,
      cargaBaseMs: () => 6 * 3_600_000, // contrato hipotético: base 6h
    };
    const j = calcularJornadaDia(batidas, agora, 1, false, true, regras);
    expect(j.baseMs).toBe(6 * 3_600_000);
    expect(j.horasExtrasMs).toBe(3_600_000); // 1h além da base
    expect(j.horasExtras50Ms).toBe(3_600_000); // dia útil → 50%
  });
});
