import {
  ColaboradoresService,
  funcaoExigeTurno,
  validarTurnoObrigatorio,
} from './colaboradores.service';
import { TurnoObrigatorioError } from './colaboradores.errors';

/**
 * Regra de negócio: fiscal e operador precisam de um turno fixo (é o que
 * agrupa a escala do dia). Supervisor, gerente e administrador (função GESTOR)
 * NÃO têm turno fixo.
 */
describe('Turno obrigatório para fiscal/operador', () => {
  describe('funcaoExigeTurno (helper puro)', () => {
    it('exige turno para FISCAL e OPERADOR', () => {
      expect(funcaoExigeTurno('FISCAL')).toBe(true);
      expect(funcaoExigeTurno('OPERADOR')).toBe(true);
    });

    it('NÃO exige turno para SUPERVISOR e GESTOR', () => {
      expect(funcaoExigeTurno('SUPERVISOR')).toBe(false);
      expect(funcaoExigeTurno('GESTOR')).toBe(false);
    });
  });

  describe('validarTurnoObrigatorio (helper puro)', () => {
    it('lança quando fiscal/operador está sem turno', () => {
      expect(() => validarTurnoObrigatorio('FISCAL', null)).toThrow(
        TurnoObrigatorioError,
      );
      expect(() => validarTurnoObrigatorio('OPERADOR', undefined)).toThrow(
        TurnoObrigatorioError,
      );
    });

    it('não lança quando fiscal/operador tem turno', () => {
      expect(() =>
        validarTurnoObrigatorio('OPERADOR', 'ABERTURA'),
      ).not.toThrow();
      expect(() => validarTurnoObrigatorio('FISCAL', 'APOIO')).not.toThrow();
    });

    it('nunca lança para supervisor/gestor, mesmo sem turno', () => {
      expect(() => validarTurnoObrigatorio('SUPERVISOR', null)).not.toThrow();
      expect(() => validarTurnoObrigatorio('GESTOR', null)).not.toThrow();
    });
  });

  describe('ColaboradoresService.cadastrar', () => {
    // A validação de turno ocorre ANTES de qualquer acesso ao banco, então um
    // Prisma "vazio" basta: se a regra falhar, o teste quebra no acesso e não
    // no erro esperado.
    function servico(): ColaboradoresService {
      return new ColaboradoresService({} as never, {} as never);
    }

    it('rejeita cadastrar OPERADOR sem turno', async () => {
      await expect(
        servico().cadastrar({ nome: 'Ana', matricula: '1001' }),
      ).rejects.toBeInstanceOf(TurnoObrigatorioError);
    });

    it('rejeita cadastrar FISCAL sem turno', async () => {
      await expect(
        servico().cadastrar({
          nome: 'Bruno',
          matricula: '1002',
          funcao: 'FISCAL',
        }),
      ).rejects.toBeInstanceOf(TurnoObrigatorioError);
    });
  });

  describe('ColaboradoresService.editar', () => {
    function servicoComColaborador(atual: {
      funcao: string;
      turno: string | null;
    }): ColaboradoresService {
      const prismaFake = {
        colaborador: {
          findUnique: () =>
            Promise.resolve({ id: 'c1', ativo: true, ...atual }),
        },
      };
      return new ColaboradoresService(prismaFake as never, {} as never);
    }

    it('rejeita remover o turno de um operador (turno = null)', async () => {
      const service = servicoComColaborador({
        funcao: 'OPERADOR',
        turno: 'ABERTURA',
      });
      await expect(
        service.editar('c1', { turno: null }),
      ).rejects.toBeInstanceOf(TurnoObrigatorioError);
    });

    it('rejeita converter um operador sem turno em fiscal', async () => {
      const service = servicoComColaborador({
        funcao: 'OPERADOR',
        turno: null,
      });
      await expect(
        service.editar('c1', { funcao: 'FISCAL' }),
      ).rejects.toBeInstanceOf(TurnoObrigatorioError);
    });
  });
});
