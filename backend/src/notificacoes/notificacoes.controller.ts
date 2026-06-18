import { Controller, Get } from '@nestjs/common';
import { Notificacao } from '@prisma/client';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import { NotificacoesService } from './notificacoes.service';

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
}
