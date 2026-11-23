import { BadRequestException } from '@nestjs/common';
import { camposLegadosAlterados } from './colaboradores.domain';
import { CamposLegadosCongeladosError } from './colaboradores.errors';
import { ColaboradoresService } from './colaboradores.service';

/**
 * Ficha × jornada (spec `jornada-5x2`, Fase 4):
 * - `POST /colaboradores` aceita o bloco `jornada` (R4.7): validado antes de
 *   criar a pessoa e gravado depois; sem ele, a pessoa fica no 6x1.
 * - Com vigência, os campos legados da ficha ficam congelados (R1.3a): mudar
 *   devolve 409, reenviar o mesmo valor (APK antigo) passa.
 */

const PADRAO = 'contrato-6x1';
const C_5X2 = 'contrato-5x2';

const fichaAtual = {
  id: 'c1',
  ativo: true,
  matricula: '1001',
  nome: 'Ana',
  funcao: 'OPERADOR',
  turno: 'ABERTURA',
  usuarioId: null,
  tipoContratoJornadaId: PADRAO,
  folgaDiaSemana: 3,
  grupoDomingo: 'G1',
  entradaSemana: '06:50',
  saidaSemana: '15:50',
  entradaFds: '06:50',
  saidaFds: '16:50',
  entradaDom: null,
  saidaDom: null,
};

function montar(opcoes: { vigencias?: number; jornadaFalha?: Error } = {}) {
  const criados: unknown[] = [];
  const atualizacoes: Record<string, unknown>[] = [];
  const chamadas: string[] = [];
  const prisma = {
    colaborador: {
      findUnique: ({ where }: { where: { id?: string; matricula?: string } }) =>
        Promise.resolve(where.id ? { ...fichaAtual } : null),
      create: ({ data }: { data: Record<string, unknown> }) => {
        chamadas.push('criar');
        criados.push(data);
        return Promise.resolve({ ...fichaAtual, id: 'novo', ...data });
      },
    },
    colaboradorIdentificador: { findUnique: () => Promise.resolve(null) },
    tipoContratoJornada: {
      findFirst: () => Promise.resolve({ id: PADRAO }),
      findUnique: () => Promise.resolve({ trabalhaDomingo: false }),
    },
    jornadaVigencia: {
      count: () => Promise.resolve(opcoes.vigencias ?? 0),
    },
    fiscal: { findMany: () => Promise.resolve([]) },
    escalaEntry: { deleteMany: () => Promise.resolve({ count: 0 }) },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        colaborador: {
          update: ({ data }: { data: Record<string, unknown> }) => {
            atualizacoes.push(data);
            return Promise.resolve({ ...fichaAtual, ...data });
          },
        },
        colaboradorIdentificador: {
          deleteMany: () => Promise.resolve({ count: 0 }),
          create: () => Promise.resolve({}),
        },
      }),
  };
  const plano = { vigenteDesde: new Date('2026-11-23T00:00:00.000Z') };
  const jornada = {
    validarNoCadastro: jest.fn((...args: unknown[]) => {
      chamadas.push('validar');
      void args;
      return opcoes.jornadaFalha
        ? Promise.reject(opcoes.jornadaFalha)
        : Promise.resolve(plano);
    }),
    gravarPlano: jest.fn(() => {
      chamadas.push('gravar');
      return Promise.resolve({
        vigencia: {},
        avisos: [
          { tipo: 'DIA_SEM_HORARIO', diaSemana: 6, mensagem: 'Sem horário' },
        ],
      });
    }),
  };
  const service = new ColaboradoresService(
    prisma as never,
    {} as never,
    jornada as never,
  );
  return { service, jornada, criados, atualizacoes, chamadas, plano };
}

const autor = { login: 'dono', podeTrocarContrato: true };

describe('cadastro com o bloco jornada (R4.7)', () => {
  it('valida antes de criar, grava depois e devolve os avisos', async () => {
    const { service, jornada, chamadas, plano } = montar();
    const r = await service.cadastrar(
      {
        nome: 'Bia',
        matricula: '2002',
        turno: 'ABERTURA',
        dataAdmissao: '2026-11-20',
        jornada: { aPartirDe: '2026-11-23', grupo: 'G2' },
      },
      'ADMINISTRADOR',
      autor,
    );
    expect(chamadas).toEqual(['validar', 'criar', 'gravar']);
    expect(jornada.validarNoCadastro).toHaveBeenCalledWith(
      { aPartirDe: '2026-11-23', grupo: 'G2' },
      PADRAO,
      PADRAO,
      autor,
    );
    expect(jornada.gravarPlano).toHaveBeenCalledWith('novo', plano, 'dono');
    expect(r.avisosJornada).toHaveLength(1);
  });

  it('sem "vale a partir de", usa a data de admissão', async () => {
    const { service, jornada } = montar();
    await service.cadastrar(
      {
        nome: 'Bia',
        matricula: '2002',
        turno: 'ABERTURA',
        dataAdmissao: '2026-11-24T10:00:00.000Z',
        tipoContratoJornadaId: C_5X2,
        jornada: { grupo: 'G3' },
      },
      'ADMINISTRADOR',
      autor,
    );
    expect(jornada.validarNoCadastro).toHaveBeenCalledWith(
      { grupo: 'G3', aPartirDe: '2026-11-24' },
      C_5X2,
      PADRAO,
      autor,
    );
  });

  it('jornada inválida não cria a pessoa', async () => {
    const { service, criados, jornada } = montar({
      jornadaFalha: new BadRequestException('Grupo deve ser G1, G2 ou G3.'),
    });
    await expect(
      service.cadastrar(
        {
          nome: 'Bia',
          matricula: '2002',
          turno: 'ABERTURA',
          jornada: { aPartirDe: '2026-11-23', grupo: 'G9' },
        },
        'ADMINISTRADOR',
        autor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(criados).toHaveLength(0);
    expect(jornada.gravarPlano).not.toHaveBeenCalled();
  });

  it('sem o bloco, nada de vigência (APK antigo: fica no 6x1)', async () => {
    const { service, jornada } = montar();
    const r = await service.cadastrar({
      nome: 'Bia',
      matricula: '2002',
      turno: 'ABERTURA',
    });
    expect(jornada.validarNoCadastro).not.toHaveBeenCalled();
    expect(jornada.gravarPlano).not.toHaveBeenCalled();
    expect(r.avisosJornada).toBeUndefined();
  });
});

describe('campos legados congelados com vigência (R1.3a)', () => {
  const fichaInteira = {
    nome: 'Ana',
    folgaDiaSemana: 3,
    grupoDomingo: 'G1',
    entradaSemana: '06:50',
    saidaSemana: '15:50',
    entradaFds: '06:50',
    saidaFds: '16:50',
    entradaDom: '',
    saidaDom: '',
    tipoContratoJornadaId: PADRAO,
  };

  it('409 ao mudar um campo legado de quem tem vigência', async () => {
    const { service, atualizacoes } = montar({ vigencias: 1 });
    const falha = service.editar('c1', { ...fichaInteira, folgaDiaSemana: 4 });
    await expect(falha).rejects.toBeInstanceOf(CamposLegadosCongeladosError);
    await expect(
      service.editar('c1', { ...fichaInteira, saidaSemana: '16:00' }),
    ).rejects.toThrow('saidaSemana');
    expect(atualizacoes).toHaveLength(0);
  });

  it('409 ao trocar o contrato da ficha (vazio = padrão conta como o mesmo)', async () => {
    const { service } = montar({ vigencias: 1 });
    await expect(
      service.editar('c1', { tipoContratoJornadaId: C_5X2 }),
    ).rejects.toThrow('tipoContratoJornadaId');
    await expect(
      service.editar('c1', { tipoContratoJornadaId: '' }),
    ).resolves.toBeDefined();
  });

  it('reenviar a ficha inteira com os mesmos valores passa e não mexe no grupo', async () => {
    const { service, atualizacoes } = montar({ vigencias: 1 });
    await service.editar('c1', { ...fichaInteira, nome: 'Ana Souza' });
    expect(atualizacoes).toHaveLength(1);
    // O contrato não trabalha domingo, mas o grupo da ficha é história do 6x1.
    expect(atualizacoes[0]).not.toHaveProperty('grupoDomingo', null);
    expect(atualizacoes[0].nome).toBe('Ana Souza');
  });

  it('sem vigência, a ficha legada segue editável como antes', async () => {
    const { service, atualizacoes } = montar({ vigencias: 0 });
    await service.editar('c1', { ...fichaInteira, folgaDiaSemana: 4 });
    expect(atualizacoes[0].folgaDiaSemana).toBe(4);
    // Comportamento antigo preservado: contrato sem domingo tira do rodízio.
    expect(atualizacoes[0].grupoDomingo).toBeNull();
  });
});

describe('camposLegadosAlterados', () => {
  const atual = {
    folgaDiaSemana: 3,
    entradaSemana: '06:50',
    saidaSemana: '15:50',
    entradaFds: null,
    saidaFds: null,
    entradaDom: null,
    saidaDom: null,
    grupoDomingo: 'G1',
    tipoContratoJornadaId: PADRAO,
  };

  it('ausente não muda; vazio e null são iguais', () => {
    expect(camposLegadosAlterados(atual, {})).toEqual([]);
    expect(
      camposLegadosAlterados(atual, { entradaFds: '', saidaDom: null }),
    ).toEqual([]);
  });

  it('lista só os que mudam', () => {
    expect(
      camposLegadosAlterados(atual, {
        folgaDiaSemana: 3,
        grupoDomingo: null,
        entradaSemana: '07:00',
      }),
    ).toEqual(['entradaSemana', 'grupoDomingo']);
  });
});
