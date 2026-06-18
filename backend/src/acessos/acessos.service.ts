import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import {
  decidirAutorizacao,
  loginDisponivelEntre,
  Perfil,
} from './acessos.domain';
import {
  CredenciaisInvalidasError,
  PermissaoInsuficienteError,
} from './acessos.errors';

/** Resultado de uma autenticação bem-sucedida. */
export interface ResultadoLogin {
  token: string;
  perfil: Perfil;
}

/**
 * Serviço do Modulo_Acessos: autenticação por login individual e exclusivo
 * (Req 7.1) e autorização por perfil (Req 7.2).
 *
 * A lógica de decisão é delegada a funções puras (`acessos.domain`), enquanto
 * este serviço cuida apenas dos efeitos colaterais: consulta ao banco
 * (Prisma), verificação de hash (bcrypt) e emissão de token (JWT).
 */
@Injectable()
export class AcessosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Autentica um usuário pelo seu **próprio** login individual (Req 7.1.1,
   * 7.1.2, 7.1.5). Em caso de sucesso, emite um token JWT e retorna o perfil
   * associado; em caso de credenciais inválidas (login inexistente ou senha
   * incorreta), lança `CredenciaisInvalidasError` (Req 7.1.3).
   */
  async autenticar(login: string, senha: string): Promise<ResultadoLogin> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { login },
    });

    if (!usuario || !(await bcrypt.compare(senha, usuario.senhaHash))) {
      throw new CredenciaisInvalidasError();
    }

    const perfil = usuario.perfil as Perfil;
    const token = await this.jwtService.signAsync({
      sub: usuario.id,
      login: usuario.login,
      perfil,
    });

    return { token, perfil };
  }

  /**
   * Indica se um perfil pode acessar uma funcionalidade (Req 7.2). Delega a
   * decisão à função pura `decidirAutorizacao`. Não lança — retorna booleano.
   */
  autorizar(perfil: Perfil, funcionalidade: string): boolean {
    return decidirAutorizacao(perfil, funcionalidade);
  }

  /**
   * Exige autorização para uma funcionalidade; quando um fiscal tenta acessar
   * uma funcionalidade restrita ao gerente, lança `PermissaoInsuficienteError`
   * (Req 7.2.4). Usado pela camada de API (guards) para barrar o acesso.
   */
  exigirAutorizacao(perfil: Perfil, funcionalidade: string): void {
    if (!this.autorizar(perfil, funcionalidade)) {
      throw new PermissaoInsuficienteError();
    }
  }

  /**
   * Verifica se um login está disponível, garantindo a unicidade/exclusividade
   * de login (Req 7.1.4, 7.1.6): nenhum login é compartilhado entre usuários.
   * Apoia-se na restrição de unicidade de `Usuario.login` no banco.
   */
  async loginDisponivel(login: string): Promise<boolean> {
    const existentes = await this.prisma.usuario.findMany({
      select: { login: true },
    });
    return loginDisponivelEntre(
      existentes.map((u) => u.login),
      login,
    );
  }

  /**
   * Gera o hash de uma senha (bcrypt) para persistência. Centraliza o custo do
   * algoritmo e mantém o `autenticar` simétrico ao cadastro de credenciais.
   */
  async gerarHashSenha(senha: string): Promise<string> {
    const SALT_ROUNDS = 10;
    return bcrypt.hash(senha, SALT_ROUNDS);
  }
}
