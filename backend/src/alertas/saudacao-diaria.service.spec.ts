import { Perfil } from '@prisma/client';
import { SaudacaoDiariaService } from './saudacao-diaria.service';

/**
 * Testes do cron de saudação diária — foco no Passo A.3 (Fase 4 · Opção A):
 * a conta do fiscal é resolvida pela FICHA CANÔNICA (colaboradorId gravado na
 * escala), sem depender do modelo legado `Fiscal`.
 */
describe('SaudacaoDiariaService — resolução por ficha canônica', () => {
  // Segunda-feira; 13:00 UTC = 10:00 em Brasília (UTC-3) → entrada "10:00".
  const AGORA = new Date('2024-03-11T13:00:00.000Z');

  function criar() {
    const fiscalFindUnique = jest.fn().mockResolvedValue(null);
    const enviar = jest.fn().mockResolvedValue(undefined);
    // A ficha da Ana: entra às 10:00 de segunda a quinta e folga no domingo. É
    // daqui que sai a hora da saudação desde a ADR 0026 — antes vinha da cópia
    // semanal, que podia dizer outra coisa.
    const fichaAna = {
      id: 'c1',
      nome: 'Ana Fiscal',
      matricula: '900001',
      usuarioId: 'u1',
      ativo: true,
      folgaDiaSemana: 0,
      grupoDomingo: null,
      entradaSemana: '10:00',
      saidaSemana: '19:00',
      entradaFds: '10:00',
      saidaFds: '19:00',
      entradaDom: null,
      saidaDom: null,
    };
    const prisma = {
      escalaEntry: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ funcionarioId: 'f1', colaboradorId: 'c1' }]),
      },
      colaborador: {
        findMany: jest.fn().mockResolvedValue([fichaAna]),
        findUnique: ({ where: { id } }: { where: { id: string } }) =>
          Promise.resolve(
            id === 'c1' ? { usuarioId: 'u1', nome: 'Ana Fiscal' } : null,
          ),
      },
      fiscal: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'f1', nome: 'Ana', usuarioId: 'u1' }]),
        findUnique: fiscalFindUnique,
      },
      usuario: {
        findMany: jest.fn().mockResolvedValue([{ id: 'u1', login: '900001' }]),
        findUnique: ({ where: { id } }: { where: { id: string } }) =>
          Promise.resolve(
            id === 'u1'
              ? {
                  id: 'u1',
                  perfil: Perfil.FISCAL,
                  nome: 'Ana Fiscal',
                  login: 'ana',
                }
              : null,
          ),
      },
      vendaDiaria: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const notificacoes = { enviar };
    const relogio = { agora: () => AGORA };
    const service = new SaudacaoDiariaService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      notificacoes as any,
      relogio,
    );
    return { service, enviar, fiscalFindUnique };
  }

  it('saúda o fiscal usando a conta da ficha, sem ler o modelo Fiscal', async () => {
    const { service, enviar, fiscalFindUnique } = criar();
    await service.saudarFiscais();
    // Enviou a saudação para a conta resolvida pela ficha (u1).
    expect(enviar).toHaveBeenCalledTimes(1);
    const destinatarios = (enviar.mock.calls[0] as unknown[])[0] as {
      id: string;
    }[];
    expect(destinatarios[0].id).toBe('u1');
    // Não caiu no fallback legado: o modelo Fiscal não foi consultado.
    expect(fiscalFindUnique).not.toHaveBeenCalled();
  });
});
