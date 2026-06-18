import { Controller, Get } from '@nestjs/common';
import { Publico } from './common/decorators/publico.decorator';
import { AppService, InfoAplicacao } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Rotas públicas (sem autenticação): expõem informações básicas e o
  // health check usado por provedores de hospedagem (ex.: Render) para
  // verificar se o serviço está saudável. Sem @Publico(), o JwtAuthGuard
  // global responderia 401 e o health check nunca passaria.
  @Publico()
  @Get()
  info(): InfoAplicacao {
    return this.appService.info();
  }

  @Publico()
  @Get('health')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
