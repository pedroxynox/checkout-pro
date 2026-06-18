import { UsuarioAutenticado } from '../common/decorators/usuario-atual.decorator';
import { AcessosController } from './acessos.controller';
import { CredenciaisInvalidasError } from './acessos.errors';
import { AcessosService } from './acessos.service';

/**
 * Testes de exemplo do `AcessosController` (Tarefa 13.2): login (Req 7.1) e
 * consulta do usuário autenticado.
 */
describe('AcessosController', () => {
  it('retorna token e perfil no login com credenciais válidas', async () => {
    const service = {
      autenticar: jest.fn(() =>
        Promise.resolve({ token: 'tok', perfil: 'GERENTE' as const }),
      ),
    } as unknown as AcessosService;
    const controller = new AcessosController(service);

    const resultado = await controller.login({
      login: 'ana',
      senha: 'segredo',
    });

    expect(resultado).toEqual({ token: 'tok', perfil: 'GERENTE' });
  });

  it('propaga CredenciaisInvalidasError em login inválido', async () => {
    const service = {
      autenticar: jest.fn(() =>
        Promise.reject(new CredenciaisInvalidasError()),
      ),
    } as unknown as AcessosService;
    const controller = new AcessosController(service);

    await expect(
      controller.login({ login: 'ana', senha: 'errada' }),
    ).rejects.toBeInstanceOf(CredenciaisInvalidasError);
  });

  it('retorna a identidade do usuário autenticado em /eu', () => {
    const controller = new AcessosController({} as AcessosService);
    const usuario: UsuarioAutenticado = {
      sub: 'u1',
      login: 'ana',
      perfil: 'FISCAL',
    };
    expect(controller.eu(usuario)).toBe(usuario);
  });
});
