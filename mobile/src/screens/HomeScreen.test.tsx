/**
 * Teste de UI da navegação por perfil (Tarefa 21.1).
 *
 * Valida, pela tela inicial (Home), que o gerente vê **todas** as áreas e o
 * fiscal vê **apenas** as operacionais (Req 7.2.2–7.2.4). A filtragem usa a
 * regra real de `podeAcessar`, garantindo consistência com a allowlist do
 * fiscal. Também verifica que tocar em uma área navega para a rota
 * correspondente.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Perfil } from '../api/types';
import { podeAcessar } from '../auth/funcionalidades';
import { AREAS } from '../navigation/areas';
import { HomeScreen } from './HomeScreen';

jest.mock('../auth/AuthContext', () => ({
  useAuth: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { useAuth } = require('../auth/AuthContext');

function montarAuth(perfil: Perfil) {
  useAuth.mockReturnValue({
    usuario: { sub: 'u1', login: perfil.toLowerCase(), perfil },
    perfil,
    podeAcessar: (funcionalidade: string) => podeAcessar(perfil, funcionalidade),
    sair: jest.fn(),
  });
}

function navegacaoFake() {
  const navigate = jest.fn();
  return { navigate } as never;
}

describe('HomeScreen — navegação por perfil (Tarefa 21.1)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('o gerente vê todas as áreas', () => {
    montarAuth('GERENTE');
    render(<HomeScreen navigation={navegacaoFake()} route={{} as never} />);

    for (const area of AREAS) {
      expect(screen.getByText(area.titulo)).toBeTruthy();
    }
    // Inclui a área exclusiva do gerente (Operadores).
    expect(screen.getByText('Operadores')).toBeTruthy();
  });

  it('o fiscal vê as áreas operacionais, mas não a gestão de acessos', () => {
    montarAuth('FISCAL');
    render(<HomeScreen navigation={navegacaoFake()} route={{} as never} />);

    // Áreas operacionais visíveis (inclui Operadores para lançar ausências).
    expect(screen.getByText('Insumos')).toBeTruthy();
    expect(screen.getByText('Checklist')).toBeTruthy();
    expect(screen.getByText('Fiscais')).toBeTruthy();
    expect(screen.getByText('Operadores')).toBeTruthy();

    // Área restrita ao gerente (gestão de pessoas/acessos) não aparece.
    expect(screen.queryByText('Pessoas e Acessos')).toBeNull();
  });

  it('navega para a rota da área ao tocar no cartão', () => {
    montarAuth('GERENTE');
    const navigation = navegacaoFake();
    render(<HomeScreen navigation={navigation} route={{} as never} />);

    fireEvent.press(screen.getByText('Insumos'));
    expect((navigation as { navigate: jest.Mock }).navigate).toHaveBeenCalledWith(
      'Insumos',
    );
  });
});
