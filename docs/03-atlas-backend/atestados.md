> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-20 · **Cobre:** `backend/src/atestados/`

# Módulo: `atestados`

## 1. Propósito
Gestão de **atestados médicos**: lançar um atestado (período + **CID**, ou "sem
CID"), gerar as faltas justificadas do período identificadas como **ATESTADO**,
e avisar a gestão quando o mesmo CID passa do limite do **INSS**.

## 2. Responsabilidades e limites
- **Faz:** cria o documento (`Atestado`) e, em cada dia corrido do período, uma
  falta JUSTIFICADA (motivo `ATESTADO_MEDICO`, `aPrazo`) vinculada por
  `atestadoId` e carimbada com o `cid` (convertendo faltas já existentes em vez
  de duplicar); autocompleta o CID-10; soma dias por CID e avisa quando cruza a
  regra do INSS; lista atestados e o histórico por CID de um colaborador.
- **Não faz:** não calcula o score (o peso da falta justificada por atestado é
  do domínio de [`operadores`](operadores.md)/`common`, ADR 0009); não anexa a
  foto do documento (previsto para o futuro; depende de storage de objetos/S3);
  não decide cobertura da escala — operacionalmente o atestado **descobre** o
  posto (a pessoa some do expediente e o dia aparece como atestado).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `atestados.domain.ts` | Regras puras: CID, dias e regra do INSS (15 dias / 60 dias) | 166 |
| `atestados.service.ts` | Lançar, listar, histórico por CID e avisos | 403 |
| `atestados.controller.ts` | Rotas HTTP (lançar, autocompletar CID, listar, histórico, remover) | 85 |
| `atestados.errors.ts` | Erros de domínio (mapeados para HTTP) | 41 |
| `atestados.module.ts` | Ligações (DI) do módulo | 19 |
| `cid10.catalogo.ts` | Catálogo CID-10 curado (autocompletar) | 177 |
| `atestados.domain.spec.ts` | Testes do domínio (CID, dias, INSS) | 105 |
| `dto/atestados.dto.ts` | Validação de entrada das rotas | — |

## 4. Endpoints (rotas HTTP)
> Lista canônica em [API HTTP → `atestados`](../05-referencia-dados/api-http.md).

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `GET /atestados/cid?busca=` | `OPERADORES_AUSENCIAS` | Autocompletar do CID-10 (por código ou descrição). |
| `POST /atestados` | `OPERADORES_AUSENCIAS` | Lança o atestado e cria as faltas justificadas do período. |
| `GET /atestados?inicio&fim` | `OPERADORES_AUSENCIAS` | Lista os atestados que intersectam o período. |
| `GET /atestados/colaborador/:id` | `OPERADORES_AUSENCIAS` | Histórico do colaborador agrupado por CID (com regra do INSS). |
| `DELETE /atestados/:id` | `OPERADORES_AUSENCIAS` | Remove o atestado e as faltas diárias vinculadas. |

## 5. Serviços e funções

### `AtestadosService`
- **`lancar(input, autor)`** — valida período/data/ciclo; normaliza o CID
  (exige CID **ou** a marca explícita `semCid`); cria o `Atestado` e as faltas
  do período numa **transação**; avalia a regra do INSS e avisa a gestão **uma
  única vez**, no momento em que o mesmo CID cruza o limite.
- **`listar(periodo)`** — atestados que intersectam o período (nome + descrição
  do CID).
- **`historicoColaborador(id)`** — agrupado por CID: episódios, total de dias,
  total na janela do INSS e bandeira `ultrapassaInss`.
- **`buscarCid(termo)`** / **`remover(id)`**.

## 6. Lógica de domínio (funções puras)
- `normalizarCid(cid)` — maiúsculas, sem espaços, só letras/dígitos e ponto.
- `buscarCid(catalogo, termo, limite)` — por código ou descrição (sem acentos).
- `contarDiasCorridos(inicio, fim)` — dias inclusive.
- `avaliarRegraInss({ episodios, cid, referenciaFim })` — soma os dias do
  **mesmo CID** na janela de **60 dias** e sinaliza quando passa de **15 dias**
  (encaminhar ao INSS). Atestados **sem CID** não são agrupados.
- `cruzouLimiteInss(antes, depois)` — para avisar só na virada do limite.

## 7. Estados e enums
Não define enums próprios. Reutiliza `MotivoJustificativa.ATESTADO_MEDICO` e
`StatusJustificativa.JUSTIFICADA` nas faltas geradas.

## 8. Dados que o módulo toca
- **Escreve/lê:** `Atestado` (tabela `atestados`) e `Ausencia` (colunas
  `atestadoId`/`cid` + a justificativa dos dias do período).
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService`, `NotificacoesService` (avisos), Data Inicial
  e Ciclo de Folha (validações de data). O peso no score fica em
  [`operadores`](operadores.md) (ADR 0009).
- **É usado por:** o app (Escalas → card "Atestados"; escala/faltas do dia
  mostram o status ATESTADO).

## 10. Regras de negócio-chave
1. **Atestado = documento + período**, que gera faltas JUSTIFICADAS diárias
   identificadas como ATESTADO (não como falta comum).
2. **CID obrigatório ou "sem CID" explícito** (distingue de "não preenchido").
3. **Regra do INSS:** mesmo CID somando **> 15 dias** em **60 dias** → aviso à
   gestão para encaminhar ao INSS (auxílio-doença).
4. **Conversão sem duplicar:** dias que já tinham falta viram atestado.
5. **Operacionalmente descobre o posto** (a cobertura da escala continua sendo
   responsabilidade do gestor).

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `atestados.domain.spec.ts` | Normalização de CID, busca, contagem de dias, regra do INSS (janela/limite/virada) | 12 |

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- 🔜 **Foto/anexo do atestado:** `Atestado.fotoUrl` já existe no modelo, mas só
  será usado quando houver storage de objetos (S3): o disco do servidor é
  efêmero.
- 🔧 **Catálogo CID-10 curado:** cobre os motivos comuns; para o catálogo
  completo do DATASUS, ampliar `cid10.catalogo.ts` (ou carregá-lo de um
  arquivo/tabela) sem mudar a interface de busca.
- ℹ️ **Escala de fiscais:** o status ATESTADO aparece tanto no roster de
  operadores quanto na escala consolidada de fiscais (a linha do fiscal mostra
  "Atestado" + CID). O card-resumo "Atestados do dia" cobre o roster de
  operadores.
