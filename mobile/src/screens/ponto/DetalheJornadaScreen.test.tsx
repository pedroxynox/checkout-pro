/**
 * Detalhe da jornada (Central): o débito segue o contrato do dia que vem do
 * backend (spec jornada-5x2, R6.3) e o cabeçalho mostra o(s) contrato(s) do
 * ciclo.
 */
import { aceitaDebito, textoContratos } from './DetalheJornadaScreen';

jest.mock('../../api/services', () => ({ centralJornadaService: {} }));
jest.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ podeAcessar: () => true }),
}));

const dia = (extra: Record<string, unknown>) =>
  ({ diaSemana: 2, ehFeriado: false, ...extra }) as never;

describe('aceitaDebito', () => {
  it('usa o geraDebito do backend', () => {
    expect(aceitaDebito(dia({ geraDebito: true }))).toBe(true);
    expect(aceitaDebito(dia({ geraDebito: false }))).toBe(false);
    // Um contrato que paga 100% num dia útil também não aceita débito.
    expect(aceitaDebito(dia({ diaSemana: 3, geraDebito: false }))).toBe(false);
  });

  it('backend antigo: domingo e feriado não aceitam', () => {
    expect(aceitaDebito(dia({}))).toBe(true);
    expect(aceitaDebito(dia({ diaSemana: 0 }))).toBe(false);
    expect(aceitaDebito(dia({ ehFeriado: true }))).toBe(false);
  });
});

describe('textoContratos', () => {
  it('um contrato: o nome; vários: cada um com o seu trecho', () => {
    expect(textoContratos(undefined)).toBeNull();
    expect(
      textoContratos([
        {
          tipoContratoJornadaId: 'a',
          nome: '6x1 - 2x1',
          de: '2026-10-26',
          ate: '2026-11-25',
        },
      ]),
    ).toBe('6x1 - 2x1');
    expect(
      textoContratos([
        {
          tipoContratoJornadaId: 'a',
          nome: '6x1 - 2x1',
          de: '2026-10-26',
          ate: '2026-11-22',
        },
        {
          tipoContratoJornadaId: 'b',
          nome: '5x2 44h',
          de: '2026-11-23',
          ate: '2026-11-25',
        },
      ]),
    ).toBe('6x1 - 2x1 (26/10–22/11) · 5x2 44h (23/11–25/11)');
  });
});
