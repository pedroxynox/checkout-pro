import { CID10 } from './cid10.catalogo';
import {
  avaliarRegraInss,
  buscarCid,
  contarDiasCorridos,
  cruzouLimiteInss,
  normalizarCid,
} from './atestados.domain';

const dia = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

describe('normalizarCid', () => {
  it('coloca em maiúsculas, remove espaços e caracteres inválidos', () => {
    expect(normalizarCid(' m54.5 ')).toBe('M54.5');
    expect(normalizarCid('j 11')).toBe('J11');
    expect(normalizarCid('a09*')).toBe('A09');
  });
  it('devolve null para vazio', () => {
    expect(normalizarCid('')).toBeNull();
    expect(normalizarCid(null)).toBeNull();
    expect(normalizarCid('   ')).toBeNull();
  });
});

describe('buscarCid', () => {
  it('acha por código (prefixo)', () => {
    const r = buscarCid(CID10, 'J11');
    expect(r[0].codigo).toBe('J11');
  });
  it('acha por descrição sem acento/caixa', () => {
    const r = buscarCid(CID10, 'gripe');
    expect(r.some((e) => e.codigo === 'J11' || e.codigo === 'J10')).toBe(true);
  });
  it('respeita o limite', () => {
    expect(buscarCid(CID10, '', 5)).toHaveLength(5);
  });
});

describe('contarDiasCorridos', () => {
  it('conta inclusivo', () => {
    expect(contarDiasCorridos(dia('2026-07-14'), dia('2026-07-14'))).toBe(1);
    expect(contarDiasCorridos(dia('2026-07-14'), dia('2026-07-19'))).toBe(6);
  });
  it('zero quando fim < início', () => {
    expect(contarDiasCorridos(dia('2026-07-19'), dia('2026-07-14'))).toBe(0);
  });
});

describe('avaliarRegraInss', () => {
  const episodios = [
    { cid: 'M54.5', inicio: dia('2026-07-01'), dias: 10 },
    { cid: 'M54.5', inicio: dia('2026-07-20'), dias: 8 },
    { cid: 'J11', inicio: dia('2026-07-20'), dias: 3 },
  ];

  it('soma os dias do mesmo CID na janela e ultrapassa 15', () => {
    const r = avaliarRegraInss({
      episodios,
      cid: 'M54.5',
      referenciaFim: dia('2026-07-27'),
    });
    expect(r.totalDias).toBe(18);
    expect(r.ultrapassaInss).toBe(true);
  });

  it('não mistura CIDs diferentes', () => {
    const r = avaliarRegraInss({
      episodios,
      cid: 'J11',
      referenciaFim: dia('2026-07-27'),
    });
    expect(r.totalDias).toBe(3);
    expect(r.ultrapassaInss).toBe(false);
  });

  it('ignora episódios fora da janela de 60 dias', () => {
    const r = avaliarRegraInss({
      episodios: [
        { cid: 'M54.5', inicio: dia('2026-01-01'), dias: 20 }, // muito antigo
        { cid: 'M54.5', inicio: dia('2026-07-20'), dias: 8 },
      ],
      cid: 'M54.5',
      referenciaFim: dia('2026-07-27'),
    });
    expect(r.totalDias).toBe(8);
    expect(r.ultrapassaInss).toBe(false);
  });

  it('sem CID nunca aciona a regra', () => {
    const r = avaliarRegraInss({
      episodios: [{ cid: null, inicio: dia('2026-07-01'), dias: 30 }],
      cid: null,
      referenciaFim: dia('2026-07-27'),
    });
    expect(r.ultrapassaInss).toBe(false);
  });
});

describe('cruzouLimiteInss', () => {
  it('true só quando cruza o limite agora', () => {
    expect(cruzouLimiteInss(10, 18)).toBe(true);
    expect(cruzouLimiteInss(16, 24)).toBe(false); // já estava acima
    expect(cruzouLimiteInss(5, 12)).toBe(false); // não cruzou
  });
});
