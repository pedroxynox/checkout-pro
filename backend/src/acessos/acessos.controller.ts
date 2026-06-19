import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { Publico } from '../common/decorators/publico.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import { AcessosService, ResultadoLogin } from './acessos.service';
import { LoginDto } from './dto/login.dto';

/**
 * Controller do Modulo_Acessos (Req 7.1, 7.2). Expõe o login individual
 * (rota pública) e a consulta do usuário autenticado (perfil/funcionalidades).
 */
@Controller('acessos')
export class AcessosController {
  constructor(private readonly acessosService: AcessosService) {}

  /**
   * Autentica um usuário pelo seu login individual e senha (Req 7.1). Rota
   * pública; em caso de credenciais inválidas, o `AcessosService` lança
   * `CredenciaisInvalidasError`, mapeado para 401 pelo filtro de exceções.
   */
  @Publico()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<ResultadoLogin> {
    return this.acessosService.autenticar(dto.login, dto.senha);
  }

  /** Retorna a identidade do usuário autenticado (perfil e login). */
  @Get('eu')
  eu(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<UsuarioAutenticado> {
    return this.acessosService.identidade(usuario);
  }
}
