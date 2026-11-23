import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { AcessosService } from '../acessos/acessos.service';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import { GravarJornadaDto } from './dto/jornada-colaborador.dto';
import {
  AutorJornada,
  JornadaColaboradorService,
  JornadaDoColaborador,
  ResultadoGravacaoJornada,
} from './jornada-colaborador.service';

/** Funcionalidade que permite escolher ou trocar o contrato (decisão do dono). */
export const FUNCIONALIDADE_TROCAR_CONTRATO = 'ADMIN_DADOS';

/**
 * Jornada da pessoa pela ficha (spec `jornada-5x2`, Fase 4): as vigências de
 * contrato, grupo, folgas fixas e disponibilidade.
 *
 * - `GET`: quem vê o perfil (`COLABORADORES_PERFIL`) ou administra a equipe
 *   (`OPERADORES_CRUD`).
 * - `PUT`/`DELETE`: `OPERADORES_CRUD`; trocar o contrato exige também
 *   `ADMIN_DADOS` (403).
 */
@Controller('colaboradores/:id/jornada')
export class JornadaColaboradorController {
  constructor(
    private readonly service: JornadaColaboradorService,
    private readonly acessos: AcessosService,
  ) {}

  /** Vigente, histórico de vigências e próximas folgas (14 dias). */
  @Get()
  @Funcionalidade('COLABORADORES_PERFIL', 'OPERADORES_CRUD')
  obter(@Param('id') id: string): Promise<JornadaDoColaborador> {
    return this.service.obter(id);
  }

  /** Grava (cria ou substitui) a vigência de `aPartirDe`, com os avisos. */
  @Put()
  @Funcionalidade('OPERADORES_CRUD')
  gravar(
    @Param('id') id: string,
    @Body() dto: GravarJornadaDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<ResultadoGravacaoJornada> {
    return this.service.gravar(id, dto, this.autor(usuario));
  }

  /** Remove uma vigência (nunca num ciclo fechado). */
  @Delete(':vigenciaId')
  @Funcionalidade('OPERADORES_CRUD')
  remover(
    @Param('id') id: string,
    @Param('vigenciaId') vigenciaId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<JornadaDoColaborador> {
    return this.service.remover(id, vigenciaId, this.autor(usuario));
  }

  private autor(usuario: UsuarioAutenticado | undefined): AutorJornada {
    return autorDaJornada(this.acessos, usuario);
  }
}

/** Quem grava a jornada e se pode trocar o contrato. */
export function autorDaJornada(
  acessos: Pick<AcessosService, 'usuarioTemAlguma'>,
  usuario: UsuarioAutenticado | undefined,
): AutorJornada {
  return {
    login: usuario?.login ?? null,
    podeTrocarContrato: acessos.usuarioTemAlguma(usuario, [
      FUNCIONALIDADE_TROCAR_CONTRATO,
    ]),
  };
}
