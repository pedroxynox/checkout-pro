/**
 * Testes unitários da lógica pura da fila offline (Task 19.1).
 *
 * Cobrem a ordenação cronológica para envio e a resolução de conflito de
 * status do fiscal por "última alteração vence" (last-write-wins).
 */
import {
  adicionarAcao,
  ordenarParaEnvio,
  removerAcoes,
  resolverConflitos,
} from './fila';
import { AcaoPendente } from './tipos';

function statusAcao(
  id: string,
  fiscalId: string,
  criadaEm: number,
  status: 'DISPONIVEL' | 'INTERVALO' | 'FORA_EXPEDIENTE' = 'DISPONIVEL',
): AcaoPendente {
  return {
    id,
    tipo: 'ALTERACAO_STATUS_FISCAL',
    payload: { fiscalId, status },
    criadaEm,
    entidadeId: fiscalId,
  };
}

function fardoAcao(id: string, criadaEm: number): AcaoPendente {
  return {
    id,
    tipo: 'RETIRADA_FARDO',
    payload: { codigoBarras: `cb-${id}`, insumoId: 'i1' },
    criadaEm,
    entidadeId: 'i1',
  };
}

describe('fila offline — ordenação', () => {
  it('ordena as ações da mais antiga para a mais recente', () => {
    const fila = [fardoAcao('b', 30), fardoAcao('a', 10), fardoAcao('c', 20)];
    expect(ordenarParaEnvio(fila).map((a) => a.id)).toEqual(['a', 'c', 'b']);
  });

  it('mantém a fila ordenada ao adicionar uma ação', () => {
    const fila = [fardoAcao('a', 10), fardoAcao('c', 30)];
    const nova = adicionarAcao(fila, fardoAcao('b', 20));
    expect(nova.map((a) => a.id)).toEqual(['a', 'b', 'c']);
  });

  it('remove as ações cujos ids estão no conjunto', () => {
    const fila = [fardoAcao('a', 10), fardoAcao('b', 20)];
    expect(removerAcoes(fila, new Set(['a'])).map((a) => a.id)).toEqual(['b']);
  });
});

describe('fila offline — resolução de conflito (last-write-wins)', () => {
  it('mantém apenas a alteração de status mais recente por fiscal', () => {
    const fila = [
      statusAcao('s1', 'fiscal-1', 10, 'DISPONIVEL'),
      statusAcao('s2', 'fiscal-1', 20, 'INTERVALO'),
      statusAcao('s3', 'fiscal-1', 30, 'FORA_EXPEDIENTE'),
    ];
    const { mantidas, descartadas } = resolverConflitos(fila);

    expect(mantidas.map((a) => a.id)).toEqual(['s3']);
    expect(descartadas.map((a) => a.id).sort()).toEqual(['s1', 's2']);
    expect((mantidas[0].payload as { status: string }).status).toBe(
      'FORA_EXPEDIENTE',
    );
  });

  it('resolve conflitos por fiscal de forma independente', () => {
    const fila = [
      statusAcao('a1', 'fiscal-1', 10),
      statusAcao('a2', 'fiscal-1', 40),
      statusAcao('b1', 'fiscal-2', 20),
    ];
    const { mantidas } = resolverConflitos(fila);
    expect(mantidas.map((a) => a.id).sort()).toEqual(['a2', 'b1']);
  });

  it('preserva todas as retiradas de fardo (sem deduplicação)', () => {
    const fila = [fardoAcao('f1', 10), fardoAcao('f2', 20), fardoAcao('f3', 30)];
    const { mantidas, descartadas } = resolverConflitos(fila);
    expect(mantidas).toHaveLength(3);
    expect(descartadas).toHaveLength(0);
  });
});
