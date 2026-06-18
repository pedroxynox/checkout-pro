import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ArquivoParaSalvar,
  ArquivoSalvo,
  ObjectStorage,
} from './object-storage';

/**
 * Adaptador de armazenamento de objetos em **disco local** (Tarefa 13).
 *
 * Implementa a interface `ObjectStorage` gravando os arquivos em um diretório
 * configurável (`STORAGE_DIR`, padrão `uploads/`). É suficiente para o estágio
 * atual; a interface permite trocar por um adaptador S3-compatível depois sem
 * alterar os controllers.
 */
@Injectable()
export class LocalDiskStorage implements ObjectStorage {
  private readonly logger = new Logger(LocalDiskStorage.name);
  private readonly diretorioBase: string;
  private readonly urlBase: string;

  constructor(config: ConfigService) {
    this.diretorioBase = config.get<string>('STORAGE_DIR') ?? 'uploads';
    this.urlBase = config.get<string>('STORAGE_PUBLIC_URL') ?? '/arquivos';
  }

  async salvar(arquivo: ArquivoParaSalvar): Promise<ArquivoSalvo> {
    const extensao = path.extname(arquivo.nomeOriginal) || '';
    const prefixo = this.sanitizar(arquivo.prefixo ?? '');
    const nome = `${randomUUID()}${extensao}`;
    const chave = prefixo ? `${prefixo}/${nome}` : nome;

    const destino = path.join(this.diretorioBase, chave);
    await fs.mkdir(path.dirname(destino), { recursive: true });
    await fs.writeFile(destino, arquivo.conteudo);
    this.logger.log(`Arquivo armazenado em ${destino}`);

    return { chave, url: `${this.urlBase}/${chave}` };
  }

  /** Remove componentes perigosos de um prefixo (evita path traversal). */
  private sanitizar(prefixo: string): string {
    return prefixo.replace(/\.\.+/g, '').replace(/[^\w\-/]/g, '');
  }
}
