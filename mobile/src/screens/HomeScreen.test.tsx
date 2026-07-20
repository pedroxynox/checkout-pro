/**
 * Teste de UI da navegação por perfil (Tarefa 21.1).
 *
 * Valida, pela tela inicial (Home), que o gerente vê **todas** as áreas e o
 * fiscal vê **apenas** as operacionais (Req 7.2.2–7.2.4). A filtragem usa a
 * regra real de `podeAcessar`, garantindo consistência com a allowlist do
 * fiscal. Também verifica que tocar em uma área navega para a rota
 * correspondente.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Perfil } from '../api/types';
import { podeAcessar } from '../auth/funcionalidades';
import { AREAS } from '../navigation/areas';
import { HomeScreen } from './HomeScreen';

jest.mock('../auth/AuthContext', () => ({
  useAuth: jest.fn(),
}));

// O Resumo do Dia (topo da Home) consulta vários serviços conforme o perfil;
// mockamos todos com respostas neutras para a Home renderizar de forma
// determinística (sem pendências) nos testes.
jest.mock('../api/services', () => ({
  arrecadacaoService: {
    status: jest.fn(() => Promise.resolve({})),
    painelAtencao: jest.fn(() =>
      Promise.resolve({ criticos: 0, emAtencao: 0, tudoCerto: true, alertas: [] }),
    ),
  },
  vendasService: {
    status: jest.fn(() => Promise.resolve({ enviado: true })),
    painel: jest.fn(() => Promise.resolve(null)),
    painelResumo: jest.fn(() => Promise.resolve(null)),
  },
  insumosService: { listarProativo: jest.fn(() => Promise.resolve([])) },
  checklistService: {
    status: jest.fn(() => Promise.resolve({ status: 'FEITO' })),
  },
  operadoresService: {
    dia: jest.fn(() =>
      Promise.resolve({
        dataISO: '',
        diaSemana: 0,
        trabalhando: 0,
        folgas: 0,
        faltas: 0,
        colaboradores: [],
      }),
    ),
  },
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

  it('o gerente desenvolvedor vê todas as áreas disponíveis (menos as "em breve")', async () => {
    montarAuth('ADMINISTRADOR');
    render(<HomeScreen navigation={navegacaoFake()} route={{} as never} />);
    // Descarrega as atualizações de estado assíncronas dos hooks (Resumo do
    // Dia) dentro de act(...) para evitar o warning; os tiles renderizam de
    // forma síncrona, então as asserções abaixo permanecem válidas.
    await act(async () => {});

    // Vê todas as áreas prontas — exceto "Importações", que saiu da Home para
    // o Centro de Controle quando o usuário tem acesso ao Centro de Controle.
    for (const area of AREAS.filter(
      (a) => !a.emBreve && a.rota !== 'Importacoes',
    )) {
      expect(screen.getByText(area.titulo)).toBeTruthy();
    }
    // Importações não aparece mais na Home para o gerente (vive no Centro de
    // Controle); Gerenciar dados deixou de existir (ações movidas para lá).
    expect(screen.queryByText('Importações')).toBeNull();
    expect(screen.queryByText('Gerenciar dados')).toBeNull();

    // As áreas EM CONSTRUÇÃO ("em breve") ficam ocultas até serem concluídas,
    // mesmo para o desenvolvedor.
    for (const area of AREAS.filter((a) => a.emBreve)) {
      expect(screen.queryByText(area.titulo)).toBeNull();
    }
  });

  it('o gerente comum vê a operação, mas não a gestão de dados', async () => {
    montarAuth('GERENTE');
    render(<HomeScreen navigation={navegacaoFake()} route={{} as never} />);
    await act(async () => {});

    // Operação do dia a dia visível.
    expect(screen.getByText('Insumos')).toBeTruthy();
    expect(screen.getByText('Checklist')).toBeTruthy();
    expect(screen.getByText('Escalas')).toBeTruthy();

    // Gestão estrutural de dados NÃO aparece para o gerente comum.
    expect(screen.queryByText('Pessoas e Acessos')).toBeNull();
    expect(screen.queryByText('Gerenciar dados')).toBeNull();
  });

  it('o fiscal vê as áreas operacionais, mas não a gestão de acessos', async () => {
    montarAuth('FISCAL');
    render(<HomeScreen navigation={navegacaoFake()} route={{} as never} />);
    await act(async () => {});

    // Áreas operacionais visíveis (inclui Escalas para fiscais e operadores).
    expect(screen.getByText('Insumos')).toBeTruthy();
    expect(screen.getByText('Checklist')).toBeTruthy();
    expect(screen.getByText('Escalas')).toBeTruthy();

    // Área restrita ao gerente (gestão de pessoas/acessos) não aparece.
    expect(screen.queryByText('Pessoas e Acessos')).toBeNull();
  });

  it('navega para a rota da área ao tocar no cartão', async () => {
    montarAuth('GERENTE');
    const navigation = navegacaoFake();
    render(<HomeScreen navigation={navigation} route={{} as never} />);
    await act(async () => {});

    fireEvent.press(screen.getByText('Insumos'));
    expect((navigation as { navigate: jest.Mock }).navigate).toHaveBeenCalledWith(
      'Insumos',
    );
    // Descarrega qualquer atualização pendente após a navegação.
    await act(async () => {});
  });
});
