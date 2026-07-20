> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-20 · **Cobre:** `mobile/src/screens/produtosPesados/`

# Área: `produtosPesados`

## 1. Propósito
**Produtos pesados** — permite descobrir rapidamente o **código de balança** de
um produto pela busca (por nome ou código). É uma área da Home, pensada para que
qualquer pessoa do time consulte os códigos no dia a dia. A **carga** do arquivo
de códigos é feita numa tela separada, dentro do Centro de Controle (gestão).

## 2. Quem usa (perfis)
- **Consulta** (`PRODUTOS_PESADOS`): todos os perfis operacionais (fiscal,
  supervisor, gerente e administrador).
- **Carga** (`PRODUTOS_PESADOS_GERENCIAR`): gestão (gerente/administrador); o
  endpoint também aceita o perfil de importação (`IMPORTACOES`).
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `ProdutosPesadosScreen.tsx` | Consulta: busca + filtro por setor (área da Home) | 246 |
| `ProdutosPesadosCargaScreen.tsx` | Carga do arquivo `.txt` (Centro de Controle) | 158 |

## 4. Fluxo do usuário
**Consulta:** ao abrir, o app baixa o catálogo inteiro **uma vez** e busca em
memória. O usuário digita nome ou código e/ou escolhe um setor (chips); cada
resultado mostra o **código em destaque**, o nome e os selos de setor/tipo. A
lista exibida é limitada (teto) para manter a rolagem leve — a busca reduz o
resultado ao que interessa. Trata os estados carregando/erro/vazio.

**Carga:** o gestor toca em "Selecionar arquivo .txt", escolhe o arquivo
(exportado do ERP, com todos os setores) e envia; o catálogo inteiro é
substituído. A tela mostra o estado atual: total de produtos, última
atualização e a contagem por setor.

## 5. Dados e integração com o backend
| Ação na tela | Chamada | Endpoint |
|---|---|---|
| Listar catálogo | `produtosPesadosService.listar()` | `GET /produtos-pesados` |
| Estado do catálogo | `produtosPesadosService.status()` | `GET /produtos-pesados/status` |
| Enviar arquivo | `produtosPesadosService.upload(arquivo)` | `POST /produtos-pesados/upload` |

Módulo do backend relacionado:
[`produtos-pesados`](../03-atlas-backend/produtos-pesados.md).

## 6. Estado local e regras de UI
- **Consulta:** guarda o termo de busca e o setor selecionado; filtra em memória
  por `nomeNormalizado` (sem acentos/maiúsculas) **ou** pelo código; deriva os
  chips de setor a partir dos dados; limita a lista renderizada a um teto e
  avisa quando há resultados ocultos.
- **Carga:** guarda o estado de envio e o aviso de sucesso/erro; recarrega o
  status após um upload bem-sucedido.

## 7. Lógica pura / utilidades
- `normalizar(texto)` (na tela de consulta): minúsculas e sem acentos, para uma
  busca tolerante. A leitura/validação do arquivo é feita no backend (parser).

## 8. Componentes e hooks compartilhados usados
- `useRequisicao` (carregamento com estados) — ver [Hooks e utilidades](hooks-e-utilidades.md).
- `Tela`, `Cartao`, `CampoTexto`, `Botao`, `Selo`, `Aviso`, `LinhaInfo`,
  `EstadoVazio`, `Carregando`, `MensagemErro`, `ApiError`, `notificar` — ver
  [Componentes compartilhados](componentes-compartilhados.md).
- `expo-document-picker` (seleção do arquivo na carga).

## 9. Testes
Sem testes de tela dedicados nesta área. A leitura do arquivo (parte mais
sujeita a erro) é coberta por testes puros no backend
([`produtos-pesados`](../03-atlas-backend/produtos-pesados.md)).

## 10. Riscos, dívidas e pendências
- 🔧 **Busca em memória:** adequada para ~500 itens; se o catálogo crescer muito,
  paginar ou buscar no servidor.
- 🔜 **Foto do produto:** prevista para o futuro; depende de um storage de
  objetos (S3), ainda não disponível.
