import { AcessosService } from '../acessos/acessos.service';
import { UsuarioAutenticado } from '../common/decorators/usuario-atual.decorator';
import { autorDaJornada } from './jornada-colaborador.controller';

/**
 * Só o administrador escolhe ou troca o contrato (decisão do dono): o autor da
 * jornada carrega o login e se tem `ADMIN_DADOS`, com os ajustes da Central de
 * Permissões.
 */
describe('autorDaJornada', () => {
  const acessos = new AcessosService({} as never, {} as never);
  const usuario = (
    perfil: UsuarioAutenticado['perfil'],
    extra: Partial<UsuarioAutenticado> = {},
  ): UsuarioAutenticado => ({ sub: 'u', login: 'quem', perfil, ...extra });

  it('administrador pode trocar o contrato; supervisor e gerente não', () => {
    expect(autorDaJornada(acessos, usuario('ADMINISTRADOR'))).toEqual({
      login: 'quem',
      podeTrocarContrato: true,
    });
    expect(
      autorDaJornada(acessos, usuario('SUPERVISOR')).podeTrocarContrato,
    ).toBe(false);
    expect(autorDaJornada(acessos, usuario('GERENTE')).podeTrocarContrato).toBe(
      false,
    );
  });

  it('sem usuário: sem login e sem troca', () => {
    expect(autorDaJornada(acessos, undefined)).toEqual({
      login: null,
      podeTrocarContrato: false,
    });
  });
});
