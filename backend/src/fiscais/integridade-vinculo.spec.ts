import { detectarVinculosOrfaos } from './integridade-vinculo';

/**
 * Testes da verificação de integridade do vínculo Fiscal ↔ Colaborador
 * (spec `solidez-contratos-jornada`, Fase 4 · Passo 4.4).
 */
describe('detectarVinculosOrfaos', () => {
  it('vínculo por conta de acesso: nenhum órfão', () => {
    const r = detectarVinculosOrfaos(
      [{ id: 'f1', nome: 'Ana Fiscal', usuarioId: 'u1' }],
      [{ id: 'u1', login: '1001' }],
      [{ id: 'c1', nome: 'Ana', matricula: '1001', usuarioId: 'u1' }],
    );
    expect(r.ok).toBe(true);
    expect(r.fiscaisSemFicha).toHaveLength(0);
    expect(r.fichasSemRegistroFiscal).toHaveLength(0);
    expect(r.vinculados).toBe(1);
  });

  it('vínculo por matrícula (fallback) quando não há conta compartilhada', () => {
    const r = detectarVinculosOrfaos(
      [{ id: 'f1', nome: 'Bia', usuarioId: 'u1' }],
      [{ id: 'u1', login: '2002' }],
      // Ficha sem usuarioId, mas com matrícula == login da conta do fiscal.
      [{ id: 'c1', nome: 'Bia', matricula: '2002', usuarioId: null }],
    );
    expect(r.ok).toBe(true);
    expect(r.vinculados).toBe(1);
  });

  it('fiscal sem conta de acesso → aparece como fiscal sem ficha', () => {
    const r = detectarVinculosOrfaos(
      [{ id: 'f1', nome: 'Sem Conta', usuarioId: null }],
      [],
      [],
    );
    expect(r.ok).toBe(false);
    expect(r.fiscaisSemFicha).toEqual([
      { fiscalId: 'f1', nome: 'Sem Conta', usuarioId: null },
    ]);
  });

  it('fiscal com conta mas sem ficha correspondente → fiscal sem ficha', () => {
    const r = detectarVinculosOrfaos(
      [{ id: 'f1', nome: 'Orfao', usuarioId: 'u9' }],
      [{ id: 'u9', login: '9999' }],
      [{ id: 'c1', nome: 'Outro', matricula: '1001', usuarioId: 'u1' }],
    );
    expect(r.fiscaisSemFicha.map((x) => x.fiscalId)).toEqual(['f1']);
    // A ficha 'c1' não corresponde a nenhum fiscal → também é órfã.
    expect(r.fichasSemRegistroFiscal.map((x) => x.colaboradorId)).toEqual([
      'c1',
    ]);
    expect(r.ok).toBe(false);
  });

  it('ficha FISCAL sem registro de fiscal → ficha sem registro', () => {
    const r = detectarVinculosOrfaos(
      [],
      [],
      [{ id: 'c1', nome: 'Nova Fiscal', matricula: '3003', usuarioId: 'u3' }],
    );
    expect(r.fichasSemRegistroFiscal).toHaveLength(1);
    expect(r.vinculados).toBe(0);
    expect(r.ok).toBe(false);
  });

  it('conta ganha prioridade: só uma ficha por fiscal (sem dupla contagem)', () => {
    const r = detectarVinculosOrfaos(
      [{ id: 'f1', nome: 'Ana', usuarioId: 'u1' }],
      [{ id: 'u1', login: '1001' }],
      [
        { id: 'c1', nome: 'Ana', matricula: '1001', usuarioId: 'u1' },
        { id: 'c2', nome: 'Ana Antiga', matricula: '1001-old', usuarioId: null },
      ],
    );
    // Vincula por conta a c1; c2 fica como ficha sem registro (fiscal distinto).
    expect(r.vinculados).toBe(1);
    expect(r.fichasSemRegistroFiscal.map((x) => x.colaboradorId)).toEqual([
      'c2',
    ]);
  });
});
