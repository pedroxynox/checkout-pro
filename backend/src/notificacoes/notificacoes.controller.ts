import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { Notificacao } from '@prisma/client';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import { NotificacoesService } from './notificacoes.service';
import {
  RegistrarPushTokenDto,
  RemoverPushTokenDto,
} from './dto/notificacoes.dto';

/**
 * Controller do serviço transversal de Notificações (Req 7.3): centro de
 * notificações in-app — histórico do usuário autenticado. Liberado ao fiscal
 * (`@Funcionalidade('NOTIFICACOES')`).
 */
@Controller('notificacoes')
@Funcionalidade('NOTIFICACOES')
export class NotificacoesController {
  constructor(private readonly notificacoesService: NotificacoesService) {}

  /** Histórico de notificações do usuário autenticado (Req 7.3.3). */
  @Get('historico')
  async historico(
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<Notificacao[]> {
    return this.notificacoesService.historico(usuario.sub);
  }

  /** Registra o token de push (Expo) do aparelho para o usuário logado. */
  @Post('push-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  async registrarPushToken(
    @Body() dto: RegistrarPushTokenDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    await this.notificacoesService.registrarPushToken(
      usuario.sub,
      dto.token,
      dto.plataforma,
    );
  }

  /** Remove o token de push do aparelho (logout). */
  @Post('push-token/remover')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removerPushToken(@Body() dto: RemoverPushTokenDto): Promise<void> {
    await this.notificacoesService.removerPushToken(dto.token);
  }
}
