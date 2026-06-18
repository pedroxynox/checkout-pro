/**
 * Testes de componente/snapshot da tela de Insumos (Task 18.5).
 *
 * Cobre a exibição dos saldos em tempo real dos insumos conhecidos e o selo de
 * "Baixo" quando o estoque está no limite ou abaixo dele (Req 3.1.4, 3.1.5).
 */
import { render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { InsumosScreen } from './InsumosScreen';

jest.mock('../../api/services', () => ({
  insumosService: {
    saldo: jest.fn(),
    estoqueBaixo: jest.fn(),
    cadastrar: jest.fn(),
    retirarFardo: jest.fn(),
    consumirBobina: jest.fn(),
    consumirInsumo: jest.fn(),
  },
}));

jest.mock('../../utils/insumosLocais', () => ({
  listarInsumosLocais: jest.fn(),
  salvarInsumoLocal: jest.fn(),
  removerInsumoLocal: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { insumosService } = require('../../api/services');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listarInsumosLocais } = require('../../utils/insumosLocais');

const INSUMOS = [
  { id: 'i1', nome: 'Sacola P', categoria: 'SACOLA', limiteMinimo: 50 },
  { id: 'i2', nome: 'Bobina 80mm', categoria: 'BOBINA', limiteMinimo: 10 },
];

function navegacaoFake() {
  return { navigate: jest.fn() } as never;
}

describe('InsumosScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listarInsumosLocais.mockResolvedValue(INSUMOS);
    insumosService.saldo.mockImplementation(async (id: string) => ({
      saldo: id === 'i1' ? 320 : 8,
    }));
    insumosService.estoqueBaixo.mockImplementation(async (id: string) => ({
      estoqueBaixo: id === 'i2',
    }));
  });

  it('exibe os saldos dos insumos e o selo de estoque baixo', async () => {
    render(<InsumosScreen navigation={navegacaoFake()} route={{} as never} />);

    // Os nomes aparecem na lista de saldos e nos seletores de fardo/consumo.
    expect((await screen.findAllByText('Sacola P')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bobina 80mm').length).toBeGreaterThan(0);
    // Os saldos numéricos aparecem na lista de saldos.
    expect(screen.getByText('320')).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();
    // Apenas a bobina está com estoque baixo.
    expect(screen.getByText('Baixo')).toBeTruthy();
  });

  it('mantém o snapshot dos saldos em tempo real', async () => {
    const arvore = render(
      <InsumosScreen navigation={navegacaoFake()} route={{} as never} />,
    );

    await waitFor(() => expect(insumosService.saldo).toHaveBeenCalled());
    await screen.findAllByText('Sacola P');
    expect(arvore.toJSON()).toMatchSnapshot();
  });

  it('exibe estado vazio quando não há insumos cadastrados', async () => {
    listarInsumosLocais.mockResolvedValue([]);

    render(<InsumosScreen navigation={navegacaoFake()} route={{} as never} />);

    expect(await screen.findByText('Nenhum insumo')).toBeTruthy();
  });
});
