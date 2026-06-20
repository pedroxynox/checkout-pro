/**
 * Testes de componente/snapshot do painel de Insumos (Almoxarifado do Setor).
 *
 * Cobre a exibição dos insumos vindos do backend (`GET /insumos`) com saldo em
 * quantidade, semáforo de estoque baixo e consumo da semana (Req 3.1.4, 3.1.5).
 */
import { render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { InsumosScreen } from './InsumosScreen';

jest.mock('../../api/services', () => ({
  insumosService: {
    listar: jest.fn(),
    retirarFardo: jest.fn(),
    consumirBobina: jest.fn(),
    consumirInsumo: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { insumosService } = require('../../api/services');

const INSUMOS = [
  {
    id: 'i1',
    nome: 'Sacolas',
    categoria: 'SACOLA',
    saldo: 3200,
    limiteMinimo: 1000,
    unidade: 'sacola',
    embalagem: 'fardo',
    fatorEmbalagem: 1000,
    ativo: true,
    estoqueBaixo: false,
    consumoSemana: 500,
    entradaSemana: 1000,
    semanasRestantes: 6.4,
  },
  {
    id: 'i2',
    nome: 'Bobina',
    categoria: 'BOBINA',
    saldo: 8,
    limiteMinimo: 20,
    unidade: 'bobina',
    embalagem: 'caixa',
    fatorEmbalagem: 20,
    ativo: true,
    estoqueBaixo: true,
    consumoSemana: 10,
    entradaSemana: 0,
    semanasRestantes: 0.8,
  },
];

function navegacaoFake() {
  return { navigate: jest.fn() } as never;
}

describe('InsumosScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    insumosService.listar.mockResolvedValue(INSUMOS);
  });

  it('exibe os insumos com saldo e o selo de estoque baixo', async () => {
    render(<InsumosScreen navigation={navegacaoFake()} route={{} as never} />);

    expect((await screen.findAllByText('Sacolas')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bobina').length).toBeGreaterThan(0);
    // Bobina abaixo do mínimo → selo "Baixo"; Sacolas OK.
    expect(screen.getByText('Baixo')).toBeTruthy();
    expect(screen.getByText('OK')).toBeTruthy();
  });

  it('mantém o snapshot do painel', async () => {
    const arvore = render(
      <InsumosScreen navigation={navegacaoFake()} route={{} as never} />,
    );

    await waitFor(() => expect(insumosService.listar).toHaveBeenCalled());
    await screen.findAllByText('Sacolas');
    expect(arvore.toJSON()).toMatchSnapshot();
  });

  it('exibe estado vazio quando não há insumos', async () => {
    insumosService.listar.mockResolvedValue([]);

    render(<InsumosScreen navigation={navegacaoFake()} route={{} as never} />);

    expect(await screen.findByText('Nenhum insumo')).toBeTruthy();
  });
});
