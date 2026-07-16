import { decidirAutorizacao } from '../acessos/acessos.domain';
import { FUNCIONALIDADE_KEY } from '../common/decorators/funcionalidade.decorator';
import { CentralJornadaController } from './central-jornada.controller';

describe('CentralJornadaController — permissão do débito de horas', () => {
  it('protege a alteração de débito com a alçada gerencial da Central', () => {
    const funcionalidade = Reflect.getMetadata(
      FUNCIONALIDADE_KEY,
      CentralJornadaController.prototype.marcarDebito,
    );

    expect(funcionalidade).toEqual(['FISCAIS_JORNADA']);
    expect(decidirAutorizacao('FISCAL', 'FISCAIS_JORNADA')).toBe(false);
    expect(decidirAutorizacao('SUPERVISOR', 'FISCAIS_JORNADA')).toBe(true);
    expect(decidirAutorizacao('GERENTE', 'FISCAIS_JORNADA')).toBe(true);
    expect(decidirAutorizacao('GERENTE_DESENVOLVEDOR', 'FISCAIS_JORNADA')).toBe(
      true,
    );
  });
});
