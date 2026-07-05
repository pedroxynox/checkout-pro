import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import {
  ContratoCard,
  ContratosService,
  ResumoContratoColaborador,
} from './contratos.service';
import {
  ResumoCarteira,
  MarcoContrato,
  ResultadoDecisao,
} from './contratos.domain';
import {
  DefinirAdmissaoDto,
  ListarContratosDto,
  RegistrarDecisaoDto,
} from './dto/contratos.dto';

/**
 * Controller da seção **Contratos** (experiência 45 + 45).
 *
 * A leitura (cards, resumo e detalhe) exige `CONTRATOS_VISUALIZAR` (gerente,
 * gerente-desenvolvedor e supervisor). A gestão (definir admissão e decidir os
 * marcos) exige `CONTRATOS_GERIR` (gerente e gerente-desenvolvedor). Cada método
 * declara a sua funcionalidade para o `PerfilGuard` global.
 */
@Controller('contratos')
export class ContratosController {
  constructor(private readonly contratos: ContratosService) {}

  /** Lista os cards de contrato dos operadores (com filtros). */
  @Get()
  @Funcionalidade('CONTRATOS_VISUALIZAR')
  async listar(@Query() q: ListarContratosDto): Promise<ContratoCard[]> {
    return this.contratos.listar({
      busca: q.busca,
      etiqueta: q.etiqueta,
      incluirSemAdmissao:
        q.incluirSemAdmissao === undefined
          ? undefined
          : q.incluirSemAdmissao === 'true',
    });
  }

  /** Contagens agregadas para o resumo do topo da seção. */
  @Get('resumo')
  @Funcionalidade('CONTRATOS_VISUALIZAR')
  async resumo(): Promise<ResumoCarteira> {
    return this.contratos.resumo();
  }

  /** Resumo do contrato de um colaborador (detalhe/tempo de casa). */
  @Get(':colaboradorId')
  @Funcionalidade('CONTRATOS_VISUALIZAR')
  async doColaborador(
    @Param('colaboradorId') colaboradorId: string,
  ): Promise<ResumoContratoColaborador> {
    return this.contratos.resumoDoColaborador(colaboradorId);
  }

  /** Define/atualiza a data de admissão de um colaborador. */
  @Patch(':colaboradorId/admissao')
  @Funcionalidade('CONTRATOS_GERIR')
  async definirAdmissao(
    @Param('colaboradorId') colaboradorId: string,
    @Body() dto: DefinirAdmissaoDto,
  ): Promise<ContratoCard> {
    return this.contratos.definirAdmissao(colaboradorId, dto.dataAdmissao);
  }

  /** Registra (ou regrava) a decisão de um marco (aprovar/reprovar). */
  @Post(':colaboradorId/decisao')
  @Funcionalidade('CONTRATOS_GERIR')
  async registrarDecisao(
    @Param('colaboradorId') colaboradorId: string,
    @Body() dto: RegistrarDecisaoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<ContratoCard> {
    return this.contratos.registrarDecisao(
      colaboradorId,
      dto.marco as MarcoContrato,
      dto.resultado as ResultadoDecisao,
      { id: usuario?.sub, nome: usuario?.nome ?? usuario?.login },
      dto.observacao,
    );
  }
}
