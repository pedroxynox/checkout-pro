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
    const prisma = {
      escalaEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            funcionarioId: 'f1',
            colaboradorId: 'c1',
            diaSemana: 1,
            entrada: '10:00',
            folga: false,
          },
        ]),
      },
      colaborador: {
        findUnique: ({ where: { id } }: { where: { id: string } }) =>
          Promise.resolve(
            id === 'c1' ? { usuarioId: 'u1', nome: 'Ana Fiscal' } : null,
          ),
      },
      fiscal: { findUnique: fiscalFindUnique },
      usuario: {
        findUnique: ({ where: { id } }: { where: { id: string } }) =>
          Promise.resolve(
            id === 'u1'
              ? { id: 'u1', perfil: Perfil.FISCAL, nome: 'Ana Fiscal', login: 'ana' }
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
