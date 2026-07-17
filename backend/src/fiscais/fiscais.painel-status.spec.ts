import { FiscaisService } from './fiscais.service';
import { agoraNaBrasilia, inicioDoDia } from '../common/datas';

/**
 * O painel de fiscais (fonte do selo "ao vivo" na tela de Escalas) deve refletir
 * o estado REAL da jornada, e não o último status "cru" registrado. Cenário do
 * bug: um fiscal saiu e sua jornada já encerrou (pelas batidas do Relógio
 * Ponto), mas o log legado ficou preso em "Intervalo". O painel agora usa a
 * mesma inteligência da jornada e mostra FORA_EXPEDIENTE.
 */
describe('FiscaisService.painel — status real (não o último cru)', () => {
  interface Batida {
    id: string;
    pessoaId: string;
    hora: Date;
  }
  interface Registro {
    fiscalId: string;
    status: string;
    em: Date;
    data: Date;
  }

  function criarPrisma(opts: { batidas: Batida[]; registros: Registro[] }) {
    const fiscais = [{ id: 'f1', nome: 'Sheila Souza', usuarioId: 'u1' }];
    return {
      fiscal: {
        findMany: () => Promise.resolve(fiscais.map((f) => ({ ...f }))),
      },
      usuario: { findMany: () => Promise.resolve([]) },
      colaborador: { findMany: () => Promise.resolve([]) },
      registroPontoFiscal: {
        findMany: () => Promise.resolve(opts.registros.map((r) => ({ ...r }))),
      },
      batidaPonto: {
        findMany: () => Promise.resolve(opts.batidas.map((b) => ({ ...b }))),
      },
    };
  }

  it('mostra FORA_EXPEDIENTE quando a jornada já encerrou, mesmo com o log preso em INTERVALO', async () => {
    const base = agoraNaBrasilia();
    const dia = inicioDoDia(base);
    const min = (m: number) => new Date(base.getTime() - m * 60_000);
    // Duas batidas próximas (30 min) → jornada curta encerrada (sem intervalo).
    const batidas = [
      { id: 'b1', pessoaId: 'f1', hora: min(180) },
      { id: 'b2', pessoaId: 'f1', hora: min(150) },
    ];
    // Log legado "preso" em INTERVALO (estado antigo que causava o bug).
    const registros = [
      { fiscalId: 'f1', status: 'DISPONIVEL', em: min(180), data: dia },
      { fiscalId: 'f1', status: 'INTERVALO', em: min(150), data: dia },
    ];
    const service = new FiscaisService(
      criarPrisma({ batidas, registros }) as never,
    );

    const painel = await service.painel();
    const f1 = painel.find((p) => p.fiscalId === 'f1');
    expect(f1?.status).toBe('FORA_EXPEDIENTE');
  });

  it('sem batidas nem registros, o fiscal aparece como FORA_EXPEDIENTE', async () => {
    const service = new FiscaisService(
      criarPrisma({ batidas: [], registros: [] }) as never,
    );
    const painel = await service.painel();
    expect(painel[0]?.status).toBe('FORA_EXPEDIENTE');
  });
});
