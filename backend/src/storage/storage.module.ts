import { Global, Module } from '@nestjs/common';
import { LocalDiskStorage } from './local-disk-storage';
import { OBJECT_STORAGE } from './object-storage';

/**
 * Módulo de armazenamento de objetos (Tarefa 13). Fornece a implementação de
 * `ObjectStorage` sob o token `OBJECT_STORAGE`. Hoje usa o adaptador de disco
 * local; para trocar por S3 basta substituir o `useClass` por outro adaptador
 * que implemente a mesma interface, sem alterar os controllers.
 */
@Global()
@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      useClass: LocalDiskStorage,
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
