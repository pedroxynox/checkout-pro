import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import { CadastrarUsuarioDto, RedefinirSenhaDto } from './dto/usuarios.dto';
import { UsuarioResumo, UsuariosService } from './usuarios.service';

/**
 * Controller de gestão de pessoas/usuários. Funcionalidade administrativa
 * restrita ao gerente (`USUARIOS_CRUD` não pertence ao conjunto liberado ao
 * fiscal, portanto o PerfilGuard só permite GERENTE).
 */
@Controller('usuarios')
@Funcionalidade('USUARIOS_CRUD')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  /** Lista os usuários cadastrados. */
  @Get()
  listar(): Promise<UsuarioResumo[]> {
    return this.usuariosService.listar();
  }

  /** Cadastra uma nova pessoa (login por matrícula). */
  @Post()
  cadastrar(@Body() dto: CadastrarUsuarioDto): Promise<UsuarioResumo> {
    return this.usuariosService.cadastrar(dto);
  }

  /** Redefine a senha de um usuário. */
  @Patch(':id/senha')
  @HttpCode(HttpStatus.NO_CONTENT)
  async redefinirSenha(
    @Param('id') id: string,
    @Body() dto: RedefinirSenhaDto,
  ): Promise<void> {
    await this.usuariosService.redefinirSenha(id, dto.senha);
  }

  /** Remove um usuário (não é permitido excluir o próprio). */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remover(
    @Param('id') id: string,
    @UsuarioAtual() atual: UsuarioAutenticado,
  ): Promise<void> {
    await this.usuariosService.remover(id, atual.sub);
  }
}
