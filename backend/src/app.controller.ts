import { Controller, Get } from '@nestjs/common';
import { AppService, InfoAplicacao } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  info(): InfoAplicacao {
    return this.appService.info();
  }

  @Get('health')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
