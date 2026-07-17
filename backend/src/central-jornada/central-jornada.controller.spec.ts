import { decidirAutorizacao } from '../acessos/acessos.domain';
import { FUNCIONALIDADE_KEY } from '../common/decorators/funcionalidade.decorator';
import { CentralJornadaController } from './central-jornada.controller';

describe('CentralJornadaController — permissão do débito de horas', () => {
  it('protege a alteração de débito com a alçada gerencial da Central', () => {
    const funcionalidade = Reflect.getMetadata(
      FUNCIONALIDADE_KEY,
      CentralJornadaController.prototype.marcarDebito,
    );

    expect(funcionalidade).toEqual(['CENTRAL_JORNADA']);
    expect(decidirAutorizacao('FISCAL', 'CENTRAL_JORNADA')).toBe(false);
    expect(decidirAutorizacao('SUPERVISOR', 'CENTRAL_JORNADA')).toBe(true);
    expect(decidirAutorizacao('GERENTE', 'CENTRAL_JORNADA')).toBe(true);
    expect(decidirAutorizacao('ADMINISTRADOR', 'CENTRAL_JORNADA')).toBe(true);
  });
});
