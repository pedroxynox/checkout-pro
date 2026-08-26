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

describe('CentralJornadaController — permissão do relatório de marcações inválidas', () => {
  it('herda a alçada da Central pelo decorador da classe (sem exigir nada a mais)', () => {
    // O relatório expõe o ponto de toda a equipe: fica atrás da mesma alçada do
    // resto da Central, declarada no @Funcionalidade da CLASSE.
    const daClasse = Reflect.getMetadata(
      FUNCIONALIDADE_KEY,
      CentralJornadaController,
    );
    const doMetodo = Reflect.getMetadata(
      FUNCIONALIDADE_KEY,
      CentralJornadaController.prototype.marcacoesInvalidas,
    );

    expect(daClasse).toEqual(['CENTRAL_JORNADA']);
    expect(doMetodo).toBeUndefined();
    expect(decidirAutorizacao('FISCAL', 'CENTRAL_JORNADA')).toBe(false);
    expect(decidirAutorizacao('SUPERVISOR', 'CENTRAL_JORNADA')).toBe(true);
  });
});
