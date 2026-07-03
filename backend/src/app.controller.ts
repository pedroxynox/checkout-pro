import { Controller, Get } from '@nestjs/common';
import { Publico } from './common/decorators/publico.decorator';
import { AppService, InfoAplicacao } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Rotas públicas (sem autenticação): expõem informações básicas e os
  // health checks. Sem @Publico(), o JwtAuthGuard global responderia 401 e o
  // health check nunca passaria.
  //
  // `/health` é a verificação de LIVENESS (o processo está de pé), sem tocar
  // no banco — é o que o provedor de hospedagem (ex.: Render) consulta para
  // saber se deve reiniciar a instância; por isso responde sempre 200.
  // `/health/ready` é a verificação de READINESS (o serviço consegue atender):
  // checa o banco de dados e responde 503 quando ele está indisponível.
  @Publico()
  @Get()
  info(): InfoAplicacao {
    return this.appService.info();
  }

  @Publico()
  @Get('health')
  health(): { status: 'ok' } {
    return this.appService.saude();
  }

  @Publico()
  @Get('health/ready')
  prontidao(): Promise<{ status: 'ok'; banco: 'ok' }> {
    return this.appService.prontidao();
  }
}
