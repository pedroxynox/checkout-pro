import { AppService } from './app.service';

describe('AppService (smoke)', () => {
  let service: AppService;

  beforeEach(() => {
    service = new AppService();
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  it('deve retornar informações da aplicação com status ok', () => {
    const info = service.info();
    expect(info.status).toBe('ok');
    expect(info.nome).toContain('Check-out PRO');
  });
});
