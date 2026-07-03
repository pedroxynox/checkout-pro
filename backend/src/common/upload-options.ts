import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

/** 1 MiB em bytes. */
const MIB = 1024 * 1024;

/**
 * Opções de upload para arquivos de TEXTO (.txt de arrecadação e vendas).
 * Limite conservador — os relatórios diários são pequenos. Evita que um upload
 * gigante seja carregado inteiro em memória (proteção contra exaustão de RAM).
 */
export const opcoesUploadTexto: MulterOptions = {
  limits: { fileSize: 2 * MIB, files: 1 },
};

/**
 * Opções de upload para IMAGENS (fotos do checklist). Limite maior, pois fotos
 * de celular podem ter alguns MB.
 */
export const opcoesUploadImagem: MulterOptions = {
  limits: { fileSize: 10 * MIB, files: 1 },
};
