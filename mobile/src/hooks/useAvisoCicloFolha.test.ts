/**
 * Testes do `useAvisoCicloFolha` — o aviso de ciclo de folha de um período em
 * edição.
 *
 * O foco é a REDAÇÃO: o mesmo dado ("há um ciclo fechado") vira um texto
 * diferente em atestado/ausência (onde o backend recusa o lançamento) e em
 * férias (onde permite). Errar isso é prometer ao gestor um impedimento que não
 * existe, ou esconder um que existe.
 */
import { renderHook, waitFor } from '@testing-library/react-native';
import { useAvisoCicloFolha } from './useAvisoCicloFolha';

jest.mock('../api/services/cicloFolha', () => ({
  cicloFolhaService: { intervalo: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { cicloFolhaService } = require('../api/services/cicloFolha');

/** Um ciclo aberto, com os dias que lhe cabem. */
const aberto = (rotulo: string, dias: number) => ({
  inicio: '2026-06-26T00:00:00.000Z',
  fim: '2026-07-25T00:00:00.000Z',
  rotulo,
  dias,
  status: 'ABERTO' as const,
});

const fechado = (rotulo: string, dias: number) => ({
  ...aberto(rotulo, dias),
  status: 'FECHADO' as const,
});

describe('useAvisoCicloFolha', () => {
  beforeEach(() => jest.clearAllMocks());

  it('não avisa quando o período cabe num único ciclo aberto', async () => {
    cicloFolhaService.intervalo.mockResolvedValue({
      ciclos: [aberto('26/06 – 25/07', 5)],
      atravessaCiclos: false,
      fechados: [],
    });

    const { result } = renderHook(() =>
      useAvisoCicloFolha({ inicio: '2026-07-01', fim: '2026-07-05' }),
    );

    await waitFor(() => expect(cicloFolhaService.intervalo).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('informa a travessia com os dias de cada ciclo', async () => {
    cicloFolhaService.intervalo.mockResolvedValue({
      ciclos: [aberto('26/06 – 25/07', 2), aberto('26/07 – 25/08', 3)],
      atravessaCiclos: true,
      fechados: [],
    });

    const { result } = renderHook(() =>
      useAvisoCicloFolha({ inicio: '2026-07-24', fim: '2026-07-28' }),
    );

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.tom).toBe('info');
    expect(result.current?.texto).toContain('26/06 – 25/07 (2 dias)');
    expect(result.current?.texto).toContain('26/07 – 25/08 (3 dias)');
  });

  it('num ciclo fechado, anuncia o impedimento quando o backend bloqueia', async () => {
    cicloFolhaService.intervalo.mockResolvedValue({
      ciclos: [fechado('26/06 – 25/07', 5)],
      atravessaCiclos: false,
      fechados: ['26/06 – 25/07'],
    });

    const { result } = renderHook(() =>
      useAvisoCicloFolha({
        inicio: '2026-07-01',
        fim: '2026-07-05',
        bloqueiaSeFechado: true,
      }),
    );

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.tom).toBe('alerta');
    expect(result.current?.texto).toContain('não pode ser lançado');
    expect(result.current?.texto).toContain('26/06 – 25/07');
  });

  it('num ciclo fechado, NÃO anuncia impedimento quando o backend permite (férias)', async () => {
    cicloFolhaService.intervalo.mockResolvedValue({
      ciclos: [fechado('26/06 – 25/07', 5)],
      atravessaCiclos: false,
      fechados: ['26/06 – 25/07'],
    });

    const { result } = renderHook(() =>
      useAvisoCicloFolha({
        inicio: '2026-07-01',
        fim: '2026-07-05',
        bloqueiaSeFechado: false,
      }),
    );

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.tom).toBe('alerta');
    expect(result.current?.texto).toContain('permitido');
    expect(result.current?.texto).not.toContain('não pode ser lançado');
  });

  it('não consulta nada quando o formulário está fechado', async () => {
    const { result } = renderHook(() =>
      useAvisoCicloFolha({
        inicio: '2026-07-01',
        fim: '2026-07-05',
        ativo: false,
      }),
    );

    await waitFor(() => expect(result.current).toBeNull());
    expect(cicloFolhaService.intervalo).not.toHaveBeenCalled();
  });

  it('não consulta com período invertido', async () => {
    renderHook(() =>
      useAvisoCicloFolha({ inicio: '2026-07-05', fim: '2026-07-01' }),
    );

    await waitFor(() =>
      expect(cicloFolhaService.intervalo).not.toHaveBeenCalled(),
    );
  });

  it('uma falha na consulta não gera aviso (o aviso é um extra)', async () => {
    cicloFolhaService.intervalo.mockRejectedValue(new Error('403'));

    const { result } = renderHook(() =>
      useAvisoCicloFolha({ inicio: '2026-07-01', fim: '2026-07-05' }),
    );

    await waitFor(() => expect(cicloFolhaService.intervalo).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});
