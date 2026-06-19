import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AcessosService } from '../acessos/acessos.service';
import { Perfil } from '../acessos/acessos.domain';
import {
  MatriculaDuplicadaError,
  OperacaoInvalidaError,
  UsuarioNaoEncontradoError,
} from './usuarios.errors';

/** Representação de um usuário para a camada de gestão (sem o hash de senha). */
export interface UsuarioResumo {
  id: string;
  matricula: string;
  nome: string | null;
  perfil: Perfil;
  criadoEm: Date;
}

/**
 * Serviço de gestão de pessoas/usuários (uso administrativo do gerente):
 * cadastro com login por matrícula, listagem, redefinição de senha e remoção.
 * A senha é armazenada com hash (bcrypt) via AcessosService.
 */
@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acessos: AcessosService,
  ) {}

  /** Lista os usuários cadastrados (sem expor o hash de senha). */
  async listar(): Promise<UsuarioResumo[]> {
    const usuarios = await this.prisma.usuario.findMany({
      orderBy: [{ perfil: 'asc' }, { nome: 'asc' }],
      select: { id: true, login: true, nome: true, perfil: true, criadoEm: true },
    });
    return usuarios.map((u) => ({
      id: u.id,
      matricula: u.login,
      nome: u.nome,
      perfil: u.perfil as Perfil,
      criadoEm: u.criadoEm,
    }));
  }

  /** Cadastra um novo usuário (login = matrícula). Rejeita matrícula duplicada. */
  async cadastrar(dados: {
    matricula: string;
    nome: string;
    perfil: Perfil;
    senha: string;
  }): Promise<UsuarioResumo> {
    const matricula = dados.matricula.trim();
    if (!(await this.acessos.loginDisponivel(matricula))) {
      throw new MatriculaDuplicadaError(matricula);
    }
    const senhaHash = await this.acessos.gerarHashSenha(dados.senha);
    const u = await this.prisma.usuario.create({
      data: {
        login: matricula,
        nome: dados.nome.trim(),
        senhaHash,
        perfil: dados.perfil,
      },
      select: { id: true, login: true, nome: true, perfil: true, criadoEm: true },
    });
    return {
      id: u.id,
      matricula: u.login,
      nome: u.nome,
      perfil: u.perfil as Perfil,
      criadoEm: u.criadoEm,
    };
  }

  /** Redefine a senha de um usuário existente. */
  async redefinirSenha(id: string, senha: string): Promise<void> {
    await this.garantirExiste(id);
    const senhaHash = await this.acessos.gerarHashSenha(senha);
    await this.prisma.usuario.update({ where: { id }, data: { senhaHash } });
  }

  /**
   * Remove um usuário. Impede a auto-exclusão do solicitante. Remove primeiro
   * as notificações (relação obrigatória); demais relações são opcionais e
   * ficam com referência nula.
   */
  async remover(id: string, solicitanteId: string): Promise<void> {
    if (id === solicitanteId) {
      throw new OperacaoInvalidaError(
        'Você não pode excluir o seu próprio usuário.',
      );
    }
    await this.garantirExiste(id);
    await this.prisma.$transaction([
      this.prisma.notificacao.deleteMany({ where: { usuarioId: id } }),
      this.prisma.usuario.delete({ where: { id } }),
    ]);
  }

  private async garantirExiste(id: string): Promise<void> {
    const u = await this.prisma.usuario.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!u) {
      throw new UsuarioNaoEncontradoError();
    }
  }
}
