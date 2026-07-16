import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AcessosService } from './acessos.service';
import {
  CredenciaisInvalidasError,
  PermissaoInsuficienteError,
} from './acessos.errors';

/**
 * Testes de exemplo (unitários) do `AcessosService`. Usam um `PrismaService`
 * falso (em memória) e um `JwtService` real, exercitando os efeitos
 * colaterais (consulta, bcrypt e emissão de token) sem banco de dados.
 */
describe('AcessosService', () => {
  const jwt = new JwtService({ secret: 'test-secret' });

  interface UsuarioFake {
    id: string;
    login: string;
    senhaHash: string;
    perfil: 'GERENTE' | 'FISCAL';
  }

  function criarServico(usuarios: UsuarioFake[]): AcessosService {
    const prismaFake = {
      usuario: {
        findUnique: ({ where: { login } }: { where: { login: string } }) =>
          Promise.resolve(usuarios.find((u) => u.login === login) ?? null),
        findMany: () =>
          Promise.resolve(usuarios.map((u) => ({ login: u.login }))),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new AcessosService(prismaFake as any, jwt);
  }

  describe('autenticar', () => {
    it('concede acesso e emite token com credenciais válidas', async () => {
      const senhaHash = await bcrypt.hash('segredo123', 10);
      const service = criarServico([
        { id: 'u1', login: 'pedro.munoz', senhaHash, perfil: 'GERENTE' },
      ]);

      const resultado = await service.autenticar('pedro.munoz', 'segredo123');

      expect(resultado.perfil).toBe('GERENTE');
      expect(typeof resultado.token).toBe('string');
      const payload = jwt.verify<{ sub: string; perfil: string }>(
        resultado.token,
      );
      expect(payload.sub).toBe('u1');
      expect(payload.perfil).toBe('GERENTE');
    });

    it('nega com senha incorreta lançando CredenciaisInvalidasError', async () => {
      const senhaHash = await bcrypt.hash('correta', 10);
      const service = criarServico([
        { id: 'u1', login: 'carmen.felicia', senhaHash, perfil: 'FISCAL' },
      ]);

      await expect(
        service.autenticar('carmen.felicia', 'errada'),
      ).rejects.toBeInstanceOf(CredenciaisInvalidasError);
    });

    it('nega quando o login não existe', async () => {
      const service = criarServico([]);
      await expect(
        service.autenticar('inexistente', 'qualquer'),
      ).rejects.toBeInstanceOf(CredenciaisInvalidasError);
    });
  });

  describe('autorizar / exigirAutorizacao', () => {
    it('gerente desenvolvedor é autorizado em qualquer funcionalidade', () => {
      const service = criarServico([]);
      expect(
        service.autorizar('ADMINISTRADOR', 'OPERADORES_CRUD'),
      ).toBe(true);
      expect(service.autorizar('ADMINISTRADOR', 'ADMIN_DADOS')).toBe(
        true,
      );
    });

    it('gerente gere o dia a dia e pessoas, mas só o desenvolvedor zera/limpa dados', () => {
      const service = criarServico([]);
      expect(service.autorizar('GERENTE', 'INSUMOS')).toBe(true);
      expect(service.autorizar('GERENTE', 'INSUMOS_GERENCIAR')).toBe(true);
      expect(service.autorizar('GERENTE', 'OPERADORES_CRUD')).toBe(true);
      expect(service.autorizar('GERENTE', 'USUARIOS_CRUD')).toBe(true);
      expect(service.autorizar('GERENTE', 'LOTE_APAE_GERENCIAR')).toBe(true);
      expect(service.autorizar('GERENTE', 'ESCALA_EDITAR')).toBe(true);
      expect(service.autorizar('GERENTE', 'PONTO_EDITAR')).toBe(true);
      expect(service.autorizar('GERENTE', 'CENTRAL_JORNADA')).toBe(true);
      // Único ponto ainda exclusivo do administrador (acesso total).
      expect(service.autorizar('GERENTE', 'ADMIN_DADOS')).toBe(false);
    });

    it('fiscal é autorizado em funcionalidade operacional e negado em gerente-only', () => {
      const service = criarServico([]);
      expect(service.autorizar('FISCAL', 'CHECKLIST')).toBe(true);
      expect(service.autorizar('FISCAL', 'OPERADORES_CRUD')).toBe(false);
    });

    it('exigirAutorizacao lança PermissaoInsuficienteError para fiscal em gerente-only', () => {
      const service = criarServico([]);
      expect(() =>
        service.exigirAutorizacao('FISCAL', 'OPERADORES_CRUD'),
      ).toThrow(PermissaoInsuficienteError);
      expect(() =>
        service.exigirAutorizacao('ADMINISTRADOR', 'OPERADORES_CRUD'),
      ).not.toThrow();
    });
  });

  describe('loginDisponivel', () => {
    it('retorna false quando o login já está em uso e true caso contrário', async () => {
      const service = criarServico([
        { id: 'u1', login: 'pedro.munoz', senhaHash: 'x', perfil: 'GERENTE' },
      ]);
      await expect(service.loginDisponivel('pedro.munoz')).resolves.toBe(false);
      await expect(service.loginDisponivel('novo.usuario')).resolves.toBe(true);
    });
  });
});
