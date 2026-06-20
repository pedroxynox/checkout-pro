import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import { AssistenteService, MensagemConversa } from './assistente.service';
import { EnviarMensagemDto } from './dto/assistente.dto';
import {
  GeminiIndisponivelError,
  GeminiNaoConfiguradoError,
} from './gemini.client';

/**
 * Controller do assistente de IA (chat flutuante). Não usa `@Funcionalidade`,
 * portanto fica disponível para qualquer usuário autenticado (os 15 da equipe).
 * Cada usuário só acessa a sua própria conversa (isolada por `usuario.sub`).
 */
@Controller('assistente')
export class AssistenteController {
  constructor(private readonly service: AssistenteService) {}

  /** Indica se o assistente está configurado (chave da API presente). */
  @Get('status')
  status(): { configurado: boolean } {
    return { configurado: this.service.estaConfigurado() };
  }

  /** Conversa atual do usuário (mensagens das últimas 24h). */
  @Get('conversa')
  async conversa(
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<MensagemConversa[]> {
    return this.service.obterConversa(usuario.sub);
  }

  /** Envia uma mensagem e recebe a resposta do assistente. */
  @Post('mensagem')
  @HttpCode(HttpStatus.OK)
  async enviar(
    @Body() dto: EnviarMensagemDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<MensagemConversa> {
    try {
      return await this.service.enviarMensagem(
        { id: usuario.sub, nome: usuario.nome, perfil: usuario.perfil },
        dto.texto.trim(),
      );
    } catch (erro) {
      if (
        erro instanceof GeminiNaoConfiguradoError ||
        erro instanceof GeminiIndisponivelError
      ) {
        throw new ServiceUnavailableException(erro.message);
      }
      throw erro;
    }
  }

  /** Limpa toda a conversa do usuário ("Limpar conversa"). */
  @Delete('conversa')
  async limpar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<{ removidas: number }> {
    return this.service.limparConversa(usuario.sub);
  }
}
