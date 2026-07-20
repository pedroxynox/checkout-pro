/**
 * Produtos pesados (balança) — CONSULTA.
 *
 * Área da Home, liberada a todos os perfis (funcionalidade PRODUTOS_PESADOS).
 * A intenção é que qualquer pessoa do time descubra rapidamente o CÓDIGO DE
 * BALANÇA de um produto pela busca.
 *
 * Como o catálogo é pequeno (~500 itens), o app baixa a lista inteira UMA vez e
 * filtra EM MEMÓRIA (busca instantânea, funciona offline após o primeiro
 * carregamento), sem chamar o servidor a cada tecla. A lista exibida é limitada
 * a um teto para manter a rolagem leve — a busca/o filtro por setor reduzem o
 * resultado ao que interessa.
 */
import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Carregando,
  CampoTexto,
  Cartao,
  EstadoVazio,
  MensagemErro,
  Selo,
  Tela,
} from '../../components';
import { produtosPesadosService, ProdutoPesado } from '../../api/services';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, raio, tipografia } from '../../theme';

/** Teto de itens renderizados de uma vez (a busca/filtro reduzem a lista). */
const LIMITE_EXIBICAO = 80;

/** Minúsculas e sem acentos — para uma busca tolerante. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function ProdutosPesadosScreen(): React.ReactElement {
  const req = useRequisicao(() => produtosPesadosService.listar(), []);
  const [busca, setBusca] = useState('');
  const [setor, setSetor] = useState<string>('TODOS');

  const produtos = req.dados ?? [];

  const setores = useMemo(() => {
    const conjunto = new Set(produtos.map((p) => p.categoria));
    return ['TODOS', ...[...conjunto].sort((a, b) => a.localeCompare(b))];
  }, [produtos]);

  const filtrados = useMemo(() => {
    const termo = normalizar(busca);
    return produtos.filter((p) => {
      if (setor !== 'TODOS' && p.categoria !== setor) {
        return false;
      }
      if (!termo) {
        return true;
      }
      return (
        normalizar(p.nome).includes(termo) ||
        p.codigo.toLowerCase().includes(termo)
      );
    });
  }, [produtos, busca, setor]);

  const visiveis = filtrados.slice(0, LIMITE_EXIBICAO);
  const ocultos = filtrados.length - visiveis.length;

  if (req.carregando) {
    return (
      <Tela>
        <Carregando />
      </Tela>
    );
  }
  if (req.erro) {
    return (
      <Tela aoAtualizar={req.recarregar} atualizando={req.atualizando}>
        <MensagemErro mensagem={req.erro} aoTentarNovamente={req.recarregar} />
      </Tela>
    );
  }

  return (
    <Tela aoAtualizar={req.recarregar} atualizando={req.atualizando}>
      <CampoTexto
        rotulo="Buscar produto"
        placeholder="Nome ou código do produto"
        value={busca}
        onChangeText={setBusca}
        autoCorrect={false}
        autoCapitalize="none"
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {setores.map((s) => {
          const ativo = s === setor;
          return (
            <Pressable
              key={s}
              onPress={() => setSetor(s)}
              style={[styles.chip, ativo && styles.chipAtivo]}
            >
              <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]}>
                {s === 'TODOS' ? 'Todos' : s}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={styles.contagem}>
        {filtrados.length} produto(s)
        {ocultos > 0 ? ` · refine a busca para ver os ${ocultos} restantes` : ''}
      </Text>

      {visiveis.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum produto encontrado"
          descricao="Verifique o nome/código ou troque o setor. Se o catálogo estiver vazio, um gestor precisa carregar o arquivo."
        />
      ) : (
        visiveis.map((p) => <ItemProduto key={p.id} produto={p} />)
      )}
    </Tela>
  );
}

/** Cartão de um produto: destaque no CÓDIGO (o que interessa na balança). */
function ItemProduto({
  produto,
}: {
  produto: ProdutoPesado;
}): React.ReactElement {
  return (
    <Cartao estilo={styles.item}>
      <View style={styles.itemInfo}>
        <Text style={styles.nome}>{produto.nome}</Text>
        <View style={styles.selos}>
          <Selo
            texto={produto.categoria}
            cor={cores.primaria}
            fundo={cores.primariaClara}
          />
          {produto.tipo ? (
            <Selo
              texto={produto.tipo}
              cor={cores.textoSecundario}
              fundo={cores.superficieAlternativa}
            />
          ) : null}
        </View>
      </View>
      <View style={styles.codigoCaixa}>
        <Text style={styles.codigoRotulo}>Código</Text>
        <Text style={styles.codigo}>{produto.codigo}</Text>
      </View>
    </Cartao>
  );
}

const styles = StyleSheet.create({
  chips: {
    gap: espacamento.sm,
    paddingBottom: espacamento.sm,
  },
  chip: {
    paddingHorizontal: espacamento.md,
    paddingVertical: espacamento.sm,
    borderRadius: raio.pill,
    backgroundColor: cores.superficieAlternativa,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  chipAtivo: {
    backgroundColor: cores.primariaClara,
    borderColor: cores.primaria,
  },
  chipTexto: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
  },
  chipTextoAtivo: {
    color: cores.primaria,
  },
  contagem: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
    marginBottom: espacamento.md,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: espacamento.lg,
  },
  itemInfo: {
    flex: 1,
    paddingRight: espacamento.md,
  },
  nome: {
    ...tipografia.subtitulo,
    fontSize: 15,
    color: cores.texto,
    marginBottom: espacamento.sm,
  },
  selos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.xs,
  },
  codigoCaixa: {
    alignItems: 'center',
    minWidth: 84,
    paddingVertical: espacamento.sm,
    paddingHorizontal: espacamento.md,
    borderRadius: raio.md,
    backgroundColor: cores.primariaClara,
  },
  codigoRotulo: {
    ...tipografia.legenda,
    fontSize: 10,
    color: cores.primaria,
    textTransform: 'uppercase',
  },
  codigo: {
    ...tipografia.titulo,
    color: cores.primariaEscura,
  },
});

export default ProdutosPesadosScreen;
