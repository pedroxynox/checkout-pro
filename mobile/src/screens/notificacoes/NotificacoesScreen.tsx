/**
 * Central de Notificações (Req 7.3.1, 7.3.3) — versão premium.
 *
 * Lista as notificações do usuário como cartões compactos, agrupados por dia
 * (Hoje / Ontem / data). Cada cartão mostra só o essencial: ícone do módulo num
 * círculo pastel, título, um resumo de até duas linhas, a hora, o indicador de
 * não lida e UM botão de ação que leva DIRETO ao módulo correspondente (sem
 * abrir nenhuma janela, modal ou prévia).
 *
 * Barra superior: filtro Todas / Não lidas / Lidas, "Marcar todas como lidas" e
 * um filtro por módulo (chips inline). O estado "lida" é guardado no aparelho
 * (o backend não tem esse endpoint) — ver `utils/notificacoesLidas`.
 */
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { notificacoesService } from '../../api/services';
import { Notificacao } from '../../api/types';
import { Carregando, EstadoVazio, MensagemErro, Segmentado, Tela } from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { RootStackParamList } from '../../navigation/types';
import { useNotificacoes } from '../../notificacoes/NotificacoesContext';
import { cores, coresModulos, espacamento, raio, sombra, tipografia } from '../../theme';
import { formatarHora, hojeISO, isoParaDataBR } from '../../utils/formato';
import { carregarLidas, salvarLidas } from '../../utils/notificacoesLidas';
import {
  Categoria,
  classificarNotificacao,
  limparTitulo,
} from './classificarNotificacao';

type FiltroLeitura = 'todas' | 'nao_lidas' | 'lidas';

/** Cor de destaque por módulo (círculo do ícone e botão de ação). */
const COR_MODULO: Record<string, string> = {
  Resumo: coresModulos.Indicadores,
  Checklist: coresModulos.Checklist,
  Insumos: coresModulos.Insumos,
  Importações: coresModulos.Importacoes,
  Contratos: '#0EA5E9',
  Faltas: cores.vermelho,
  Fiscais: coresModulos.Fiscais,
  Escalas: coresModulos.Escala,
  Vendas: coresModulos.PainelVendas,
  Indicadores: coresModulos.Indicadores,
  'Centro de Controle': '#0A2540',
  Geral: cores.primaria,
};

function corDe(modulo: string): string {
  return COR_MODULO[modulo] ?? cores.primaria;
}

const OFFSET_BR_MS = -3 * 60 * 60 * 1000;

/** Dia-calendário (Brasília) de uma data ISO, como "yyyy-mm-dd". */
function diaChave(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  return new Date(t + OFFSET_BR_MS).toISOString().slice(0, 10);
}

/** Rótulo do grupo: Hoje / Ontem / dd/mm/aaaa. */
function rotuloDia(chave: string): string {
  const hoje = hojeISO();
  const ontem = new Date(new Date(`${hoje}T00:00:00.000Z`).getTime() - 86400000)
    .toISOString()
    .slice(0, 10);
  if (chave === hoje) return 'Hoje';
  if (chave === ontem) return 'Ontem';
  return isoParaDataBR(chave);
}

/** Uma notificação já enriquecida (categoria + estado de leitura). */
interface ItemNotificacao extends Notificacao {
  categoria: Categoria;
  tituloLimpo: string;
  naoLida: boolean;
}

/** Grupo de notificações de um mesmo dia. */
interface Grupo {
  rotulo: string;
  itens: ItemNotificacao[];
}

export function NotificacoesScreen(): React.ReactElement {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const requisicao = useRequisicao(() => notificacoesService.historico(), []);
  const { zerar, ultima } = useNotificacoes();

  const [lidas, setLidas] = React.useState<Set<string>>(new Set());
  const [filtroLeitura, setFiltroLeitura] = React.useState<FiltroLeitura>('todas');
  const [filtroModulo, setFiltroModulo] = React.useState<string>('todos');
  const [mostrarFiltro, setMostrarFiltro] = React.useState(false);

  // Carrega o estado "lida" (persistido no aparelho) uma vez.
  React.useEffect(() => {
    let ativo = true;
    void carregarLidas().then((ids) => {
      if (ativo) setLidas(new Set(ids));
    });
    return () => {
      ativo = false;
    };
  }, []);

  // Ao abrir, zera o badge da aba e recarrega o histórico.
  useFocusEffect(
    React.useCallback(() => {
      zerar();
      requisicao.recarregar();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  // Nova notificação em tempo real com a tela aberta → recarrega.
  React.useEffect(() => {
    if (ultima) requisicao.recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ultima]);

  const persistir = React.useCallback((proximo: Set<string>) => {
    setLidas(proximo);
    void salvarLidas([...proximo]);
  }, []);

  // Enriquecimento: categoria + título sem emoji + não lida.
  const itens: ItemNotificacao[] = React.useMemo(
    () =>
      (requisicao.dados ?? []).map((n) => ({
        ...n,
        categoria: classificarNotificacao(n.titulo, n.mensagem),
        tituloLimpo: limparTitulo(n.titulo),
        naoLida: !lidas.has(n.id),
      })),
    [requisicao.dados, lidas],
  );

  // Módulos presentes (para os chips de filtro).
  const modulos = React.useMemo(() => {
    const vistos = new Set<string>();
    const lista: string[] = [];
    for (const it of itens) {
      if (!vistos.has(it.categoria.modulo)) {
        vistos.add(it.categoria.modulo);
        lista.push(it.categoria.modulo);
      }
    }
    return lista;
  }, [itens]);

  const totalNaoLidas = itens.filter((i) => i.naoLida).length;

  // Aplica filtros (leitura + módulo).
  const filtrados = itens.filter((i) => {
    if (filtroLeitura === 'nao_lidas' && !i.naoLida) return false;
    if (filtroLeitura === 'lidas' && i.naoLida) return false;
    if (filtroModulo !== 'todos' && i.categoria.modulo !== filtroModulo) return false;
    return true;
  });

  // Agrupa por dia, preservando a ordem (backend já vem do mais novo ao antigo).
  const grupos: Grupo[] = React.useMemo(() => {
    const mapa = new Map<string, ItemNotificacao[]>();
    for (const it of filtrados) {
      const chave = diaChave(it.criadaEm);
      const arr = mapa.get(chave) ?? [];
      arr.push(it);
      mapa.set(chave, arr);
    }
    return [...mapa.entries()].map(([chave, lista]) => ({
      rotulo: rotuloDia(chave),
      itens: lista,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrados]);

  function marcarTodas(): void {
    if (totalNaoLidas === 0) return;
    persistir(new Set([...lidas, ...itens.map((i) => i.id)]));
  }

  function abrir(item: ItemNotificacao): void {
    if (item.naoLida) persistir(new Set([...lidas, item.id]));
    try {
      navigation.navigate(item.categoria.rota as never);
    } catch {
      // Se o módulo não estiver disponível para o perfil, apenas ignora.
    }
  }

  const carregando = requisicao.carregando;
  const semNada = !carregando && !requisicao.erro && itens.length === 0;

  return (
    <Tela aoAtualizar={requisicao.recarregar} atualizando={requisicao.atualizando}>
      <Text style={styles.tituloTela}>Notificações</Text>
      <Text style={styles.subtitulo}>
        {totalNaoLidas > 0
          ? `${totalNaoLidas} não lida${totalNaoLidas > 1 ? 's' : ''}`
          : 'Você está em dia'}
      </Text>

      {!semNada ? (
        <>
          <View style={styles.barra}>
            <Segmentado<FiltroLeitura>
              opcoes={[
                { valor: 'todas', rotulo: 'Todas' },
                { valor: 'nao_lidas', rotulo: 'Não lidas' },
                { valor: 'lidas', rotulo: 'Lidas' },
              ]}
              selecionado={filtroLeitura}
              aoSelecionar={setFiltroLeitura}
            />
          </View>

          <View style={styles.acoes}>
            <Pressable
              onPress={marcarTodas}
              disabled={totalNaoLidas === 0}
              style={styles.acaoBtn}
              accessibilityRole="button"
            >
              <Ionicons
                name="checkmark-done-outline"
                size={16}
                color={totalNaoLidas === 0 ? cores.textoSecundario : cores.primaria}
              />
              <Text
                style={[
                  styles.acaoTexto,
                  { color: totalNaoLidas === 0 ? cores.textoSecundario : cores.primaria },
                ]}
              >
                Marcar todas como lidas
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setMostrarFiltro((v) => !v)}
              style={styles.acaoBtn}
              accessibilityRole="button"
            >
              <Ionicons
                name={mostrarFiltro ? 'funnel' : 'funnel-outline'}
                size={15}
                color={filtroModulo !== 'todos' || mostrarFiltro ? cores.primaria : cores.textoSecundario}
              />
              <Text
                style={[
                  styles.acaoTexto,
                  {
                    color:
                      filtroModulo !== 'todos' || mostrarFiltro
                        ? cores.primaria
                        : cores.textoSecundario,
                  },
                ]}
              >
                Filtro
              </Text>
            </Pressable>
          </View>

          {mostrarFiltro ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {['todos', ...modulos].map((m) => {
                const ativo = filtroModulo === m;
                const cor = m === 'todos' ? cores.primaria : corDe(m);
                return (
                  <Pressable
                    key={m}
                    onPress={() => setFiltroModulo(m)}
                    style={[
                      styles.chip,
                      ativo && { backgroundColor: `${cor}1A`, borderColor: cor },
                    ]}
                  >
                    <Text
                      style={[styles.chipTexto, ativo && { color: cor, fontWeight: '700' }]}
                    >
                      {m === 'todos' ? 'Todos' : m}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
        </>
      ) : null}

      {carregando ? (
        <Carregando />
      ) : requisicao.erro ? (
        <MensagemErro mensagem={requisicao.erro} aoTentarNovamente={requisicao.recarregar} />
      ) : semNada ? (
        <EstadoVazio
          icone="notifications-off-outline"
          titulo="Sem notificações"
          descricao="Você está em dia. Novas notificações aparecerão aqui."
        />
      ) : grupos.length === 0 ? (
        <EstadoVazio
          icone="filter-outline"
          titulo="Nada por aqui"
          descricao="Nenhuma notificação com esse filtro."
        />
      ) : (
        grupos.map((g) => (
          <View key={g.rotulo} style={styles.grupo}>
            <Text style={styles.grupoRotulo}>{g.rotulo}</Text>
            {g.itens.map((n) => (
              <CartaoNotificacao key={n.id} item={n} aoAbrir={() => abrir(n)} />
            ))}
          </View>
        ))
      )}
    </Tela>
  );
}

/** Cartão compacto de uma notificação. Só o botão navega (nunca o cartão). */
function CartaoNotificacao({
  item,
  aoAbrir,
}: {
  item: ItemNotificacao;
  aoAbrir: () => void;
}): React.ReactElement {
  const cor = corDe(item.categoria.modulo);
  return (
    <View style={styles.cartao}>
      <View style={styles.cartaoTopo}>
        <View style={[styles.iconeCirculo, { backgroundColor: `${cor}1A` }]}>
          <Ionicons name={item.categoria.icone} size={22} color={cor} />
        </View>
        <View style={styles.cartaoTextos}>
          <View style={styles.tituloLinha}>
            <Text style={styles.cartaoTitulo} numberOfLines={1}>
              {item.tituloLimpo}
            </Text>
            {item.naoLida ? <View style={[styles.pontoNaoLida, { backgroundColor: cor }]} /> : null}
          </View>
          <Text style={styles.cartaoResumo} numberOfLines={2}>
            {item.mensagem}
          </Text>
        </View>
      </View>

      <View style={styles.cartaoRodape}>
        <Text style={styles.hora}>{formatarHora(item.criadaEm)}</Text>
        <Pressable
          onPress={aoAbrir}
          style={[styles.botaoAcao, { backgroundColor: `${cor}14` }]}
          accessibilityRole="button"
          accessibilityLabel={item.categoria.acao}
        >
          <Text style={[styles.botaoAcaoTexto, { color: cor }]}>{item.categoria.acao}</Text>
          <Ionicons name="chevron-forward" size={15} color={cor} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tituloTela: {
    ...tipografia.titulo,
    color: cores.texto,
  },
  subtitulo: {
    ...tipografia.corpo,
    color: cores.textoSecundario,
    marginTop: 2,
    marginBottom: espacamento.lg,
  },
  barra: {
    marginBottom: espacamento.sm,
  },
  acoes: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: espacamento.sm,
  },
  acaoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    paddingVertical: espacamento.xs,
  },
  acaoTexto: {
    ...tipografia.rotulo,
  },
  chips: {
    gap: espacamento.sm,
    paddingVertical: espacamento.xs,
    paddingRight: espacamento.lg,
  },
  chip: {
    paddingHorizontal: espacamento.md,
    paddingVertical: espacamento.xs,
    borderRadius: raio.pill,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
  },
  chipTexto: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  grupo: {
    marginTop: espacamento.md,
  },
  grupoRotulo: {
    ...tipografia.secao,
    color: cores.textoSecundario,
    marginBottom: espacamento.sm,
    marginLeft: 2,
  },
  cartao: {
    backgroundColor: cores.superficie,
    borderRadius: raio.lg,
    padding: espacamento.lg,
    marginBottom: espacamento.md,
    ...sombra.cartao,
  },
  cartaoTopo: {
    flexDirection: 'row',
    gap: espacamento.md,
  },
  iconeCirculo: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartaoTextos: {
    flex: 1,
  },
  tituloLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
  },
  cartaoTitulo: {
    ...tipografia.rotulo,
    fontSize: 15,
    color: cores.texto,
    flex: 1,
  },
  pontoNaoLida: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  cartaoResumo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    lineHeight: 18,
    marginTop: 2,
  },
  cartaoRodape: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: espacamento.md,
  },
  hora: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  botaoAcao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: espacamento.md,
    paddingVertical: espacamento.xs,
    borderRadius: raio.pill,
  },
  botaoAcaoTexto: {
    ...tipografia.rotulo,
    fontSize: 13,
  },
});

export default NotificacoesScreen;
