> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `backend/src/storage/`

# Módulo: `storage`

## 1. Propósito
Armazenamento de **objetos/arquivos** (fotos do checklist, arquivos de
importação) por trás de uma interface única, permitindo trocar a implementação
(disco local hoje; S3-compatível depois) sem afetar os controllers.

## 2. Responsabilidades e limites
- **Faz:** define o contrato `ObjectStorage`; fornece o adaptador atual de
  **disco local** (`LocalDiskStorage`) sob o token `OBJECT_STORAGE`; gera nomes
  únicos, cria diretórios e grava o conteúdo; sanitiza o prefixo (evita path
  traversal); devolve a chave e a URL de acesso.
- **Não faz:** não valida o tipo/tamanho do upload (limites em [`common`](common.md)
  `upload-options.ts`); não serve os arquivos por HTTP (a rota estática é do
  `AppModule`); não persiste metadados no banco (fica em cada módulo consumidor).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `object-storage.ts` | Interface `ObjectStorage` + token e tipos (`ArquivoParaSalvar`/`ArquivoSalvo`) | 36 |
| `local-disk-storage.ts` | Adaptador de disco local (`LocalDiskStorage`) | 49 |
| `storage.module.ts` | Módulo global; provê `OBJECT_STORAGE` → `LocalDiskStorage` | 21 |

## 4. Endpoints (rotas HTTP)
**Não expõe rotas HTTP.** Fornece a abstração `ObjectStorage` (token
`OBJECT_STORAGE`) para os módulos que precisam guardar arquivos (ex.:
[`checklist`](checklist.md)). Como o `StorageModule` é `@Global`, o token pode
ser injetado sem reimportar o módulo.

## 5. Serviços e funções

### `ObjectStorage` (interface)
Contrato de armazenamento: `salvar(arquivo: ArquivoParaSalvar): Promise<ArquivoSalvo>`.
Implementável por múltiplos adaptadores (disco local, S3…).

### `LocalDiskStorage.salvar(arquivo)`
- **Recebe:** `ArquivoParaSalvar` (`conteudo`, `nomeOriginal`, `mimeType?`,
  `prefixo?`).
- **Devolve:** `ArquivoSalvo` (`chave` e `url`).
- **Efeitos:** deriva a extensão do nome original, gera nome único
  (`randomUUID`), sanitiza o prefixo, cria o diretório
  (`STORAGE_DIR`, padrão `uploads/`) e grava o conteúdo. A URL usa
  `STORAGE_PUBLIC_URL` (padrão `/arquivos`).
- **Regras aplicadas:** `sanitizar` remove `..` e caracteres perigosos do
  prefixo (proteção contra **path traversal**).

## 6. Lógica de domínio (funções puras)
- `sanitizar(prefixo)` (privada) — normaliza o prefixo para um caminho seguro.
  O restante do adaptador tem efeitos de I/O (não é puro).

## 7. Estados e enums
Não se aplica. A escolha do adaptador é fixada no `StorageModule` (`useClass`).

## 8. Dados que o módulo toca
- **Escreve:** arquivos no **sistema de arquivos** (não no banco).
- **Não toca tabelas do Prisma.** Os metadados (chave/URL) são persistidos pelos
  módulos consumidores.
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `ConfigService` (`STORAGE_DIR`, `STORAGE_PUBLIC_URL`), `fs`,
  `path`, `crypto`.
- **É usado por:** módulos que armazenam arquivos (ex.: [`checklist`](checklist.md)).
  Exporta o token `OBJECT_STORAGE`.

## 10. Regras de negócio-chave
1. **Interface estável, implementação trocável:** os controllers dependem de
   `ObjectStorage`, não do disco (basta trocar o `useClass` para migrar a S3).
2. **Nomes únicos** por arquivo (`randomUUID` + extensão original).
3. **Proteção contra path traversal** na sanitização do prefixo.
4. **Configurável por ambiente** (`STORAGE_DIR`/`STORAGE_PUBLIC_URL`).

## 11. Testes
Não se aplica (sem testes dedicados no módulo).

## 12. Riscos, dívidas e pendências
- ⚠️ **Disco local não é durável em hospedagem efêmera** (ex.: filesystem
  reiniciável): arquivos podem se perder entre deploys — a migração para S3 é o
  próximo passo natural (já previsto pela interface).
- 🔧 **Sem remoção/limpeza:** a interface só oferece `salvar`; exclusão de
  arquivos órfãos precisaria ser adicionada.
- ⛔ **Sem cobertura de teste** do `LocalDiskStorage` (I/O e sanitização).
