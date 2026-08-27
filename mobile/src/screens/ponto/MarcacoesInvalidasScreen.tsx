/**
 * Relatório de MARCAÇÕES INVÁLIDAS (uso gerencial — CENTRAL_JORNADA).
 *
 * É a lista de trabalho de quem vai **ajustar o ponto**: para cada dia já
 * encerrado em que o registro ficou incompleto, mostra quantas marcações faltam
 * e **quais** (entrada, saída para o intervalo, retorno ou encerramento), com as
 * horas que existem ao lado — para conferir o comprovante e corrigir.
 *
 * Diferente do painel de inconsistências (que reúne cinco naturezas de problema
 * e, nas incompletas, só diz "falta o encerramento"), aqui a **entrada
 * esquecida** é identificada como tal: o backend confronta a 1ª marcação com o
 * turno da escala. Quando os dados não permitem afirmar, o item vem marcado como
 * "conferir" com o motivo — a tela nunca apresenta hipótese como se fosse fato.
 *
 * Os dias vêm agrupados por data (do mais recente para o mais antigo), abertos
 * por padrão, com busca por pessoa e filtro pela marcação que falta.
 *
 * Cada item é **tocável**: abre o Relógio Ponto já na pessoa e no dia daquele
 * item (modo correção), de onde o gestor lança a batida que falta e volta —
 * ou segue direto para a próxima pendência. Ao voltar, a lista se recarrega,
 * então o que foi resolvido desaparece.
 */
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { centralJornadaService } from '../../api/services';
import {
  CentralMarcacoesInvalidas,
  MarcacaoCanonica,
  MarcacaoInvalidaItem,
} from '../../api/services/centralJornada';
import { useAuth } from '../../auth/AuthContext';
import { RootStackParamList } from '../../navigation/types';
import { filtrarFila, ordenarFila } from './filaCorrecao';
import {
  Cartao,
  CampoTexto,
  Carregando,
  EstadoVazio,
  MensagemErro,
  Segmentado,
  Selo,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { formatarDuracao } from '../../utils/formato';
import { cores, espacamento, raio, tipografia } from '../../theme';

const NOMES_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Filtro pela marcação que está faltando. */
type FiltroTipo = 'TODAS' | MarcacaoCanonica;

const OPCOES_FILTRO: { valor: FiltroTipo; rotulo: string }[] = [
  { valor: 'TODAS', rotulo: 'Todas' },
  { valor: 'ENTRADA', rotulo: 'Entrada' },
  { valor: 'SAIDA_INTERVALO', rotulo: 'Saída' },
  { valor: 'RETORNO_INTERVALO', rotulo: 'Retorno' },
  { valor: 'ENCERRAMENTO', rotulo: 'Fim' },
];

function dataCurta(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${NOMES_SEMANA[d.getUTCDay()]} ${dd}/${mm}`;
}

function rotuloFuncao(f: string): string {
  if (f === 'FISCAL') return 'Fiscal';
  if (f === 'SUPERVISOR') return 'Supervisor';
  if (f === 'OPERADOR') return 'Operador';
  return 'Gestor';
}

/** Nome da marcação como aparece na tela. */
function rotuloMarcacao(tipo: MarcacaoCanonica): string {
  switch (tipo) {
    case 'ENTRADA':
      return 'Entrada';
    case 'SAIDA_INTERVALO':
      return 'Saída p/ intervalo';
    case 'RETORNO_INTERVALO':
      return 'Retorno do intervalo';
    default:
      return 'Encerramento';
  }
}

/** Selo da quantidade que falta: 1 é amarelo, 2 ou mais é vermelho. */
function seloQuantidade(quantidade: number): { rotulo: string; cor: string; fundo: string } {
  const rotulo = quantidade === 1 ? 'Falta 1' : `Faltam ${quantidade}`;
  return quantidade === 1
    ? { rotulo, cor: cores.amarelo, fundo: cores.amareloFundo }
    : { rotulo, cor: cores.vermelho, fundo: cores.vermelhoFundo };
}

export function MarcacoesInvalidasScreen(): React.ReactElement {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { podeAcessar } = useAuth();
  const [ciclo, setCiclo] = useState(0);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<FiltroTipo>('TODAS');
  // Guardamos os dias FECHADOS: por padrão todos aparecem abertos, porque esta
  // tela é uma lista de trabalho (o gestor quer ver o que ajustar sem tocar).
  const [diasFechados, setDiasFechados] = useState<Set<string>>(new Set());

  const req = useRequisicao<CentralMarcacoesInvalidas>(
    () => centralJornadaService.marcacoesInvalidas(ciclo),
    [ciclo],
  );

  // Ao voltar do Relógio Ponto (onde a batida que faltava foi lançada), a lista
  // é recarregada: sem isso, o item já resolvido continuaria aqui e o gestor
  // ajustaria o mesmo dia duas vezes. Pula o primeiro foco — a carga inicial já
  // é feita pelo useRequisicao ao montar.
  const recarregarRef = useRef(req.recarregar);
  recarregarRef.current = req.recarregar;
  const primeiroFoco = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (primeiroFoco.current) {
        primeiroFoco.current = false;
        return;
      }
      recarregarRef.current();
    }, []),
  );

  // Os filtros e a ordem vivem em `filaCorrecao` porque o Relógio Ponto usa os
  // mesmos para caminhar até a próxima pendência.
  const filtros = useMemo(
    () => ({ nome: busca, tipo: filtro === 'TODAS' ? undefined : filtro }),
    [busca, filtro],
  );

  const porDia = useMemo(() => {
    const filtrados = ordenarFila(filtrarFila(req.dados?.itens ?? [], filtros));
    const mapa = new Map<string, MarcacaoInvalidaItem[]>();
    for (const item of filtrados) {
      const arr = mapa.get(item.data) ?? [];
      arr.push(item);
      mapa.set(item.data, arr);
    }
    return [...mapa.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [req.dados, filtros]);

  /**
   * Abre o Relógio Ponto já na pessoa e no dia do item, em "modo correção".
   *
   * Usa `push` (e não `navigate`): o Relógio Ponto pode já estar embaixo na
   * pilha — há um atalho dele para a Central —, e `navigate` faria voltar até
   * ele, tirando esta lista da pilha. Com `push`, o "voltar" traz o gestor de
   * volta à lista, que é o fluxo de trabalho.
   */
  function ajustarItem(item: MarcacaoInvalidaItem): void {
    navigation.push('RegistroPonto', {
      correcaoColaboradorId: item.colaboradorId,
      correcaoNome: item.nome,
      // O item traz o ISO do início do dia; o Relógio Ponto trabalha em
      // `yyyy-mm-dd`.
      correcaoData: item.data.slice(0, 10),
      correcaoFaltantes: item.tiposFaltantes,
      correcaoEntradaPrevista: item.entradaPrevista,
      correcaoCiclo: ciclo,
      correcaoFiltroNome: filtros.nome?.trim() || undefined,
      correcaoFiltroTipo: filtros.tipo,
    });
  }

  // Ajustar a batida acontece no Relógio Ponto: sem acesso a ele, o item não é
  // tocável (a rota nem existe na pilha desse usuário) e a lista segue sendo o
  // relatório de leitura que sempre foi.
  const podeAjustar = podeAcessar('PONTO_VISUALIZAR');

  function alternarDia(data: string): void {
    setDiasFechados((prev) => {
      const proximo = new Set(prev);
      if (proximo.has(data)) proximo.delete(data);
      else proximo.add(data);
      return proximo;
    });
  }

  const totais = req.dados?.totais;

  return (
    <Tela aoAtualizar={req.recarregar} atualizando={req.atualizando}>
      {/* Seletor de ciclo (26→25), igual ao resto da Central. */}
      <Cartao style={styles.cardCiclo}>
        <Pressable
          onPress={() => setCiclo((c) => c - 1)}
          style={styles.setaBtn}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={22} color={cores.primaria} />
        </Pressable>
        <View style={styles.cicloCentro}>
          <Text style={styles.cicloLabel}>Ciclo de folha</Text>
          <Text style={styles.cicloRotulo}>
            {req.dados?.periodo.rotulo ?? '—'}
          </Text>
        </View>
        <Pressable
          onPress={() => setCiclo((c) => Math.min(0, c + 1))}
          style={[styles.setaBtn, ciclo >= 0 && styles.setaDesabilitada]}
          disabled={ciclo >= 0}
          hitSlop={10}
        >
          <Ionicons
            name="chevron-forward"
            size={22}
            color={ciclo >= 0 ? cores.textoSecundario : cores.primaria}
          />
        </Pressable>
      </Cartao>

      {req.carregando ? (
        <Carregando />
      ) : req.erro ? (
        <MensagemErro mensagem={req.erro} aoTentarNovamente={req.recarregar} />
      ) : (
        <>
          {totais && <ResumoCiclo totais={totais} podeAjustar={podeAjustar} />}

          <Cartao>
            <CampoTexto
              rotulo="Buscar por pessoa"
              placeholder="Nome do colaborador…"
              value={busca}
              onChangeText={setBusca}
              autoCorrect={false}
            />
            <Text style={styles.filtroRotulo}>Marcação que falta</Text>
            <Segmentado
              opcoes={OPCOES_FILTRO}
              selecionado={filtro}
              aoSelecionar={setFiltro}
            />
          </Cartao>

          {porDia.length === 0 ? (
            <EstadoVazio
              icone="checkmark-done-outline"
              titulo="Nada a ajustar"
              descricao={
                busca.trim() || filtro !== 'TODAS'
                  ? 'Nenhuma marcação faltante com esses filtros.'
                  : 'Todas as marcações do ciclo estão completas.'
              }
            />
          ) : (
            porDia.map(([data, itens]) => {
              const aberto = !diasFechados.has(data);
              return (
                <Cartao key={data} style={styles.cardDia}>
                  <Pressable
                    onPress={() => alternarDia(data)}
                    style={styles.diaHeader}
                    accessibilityRole="button"
                  >
                    <Text style={styles.diaTitulo}>
                      {dataCurta(data)}
                      {itens[0]?.ehFeriado ? ' • Feriado' : ''}
                    </Text>
                    <View style={styles.diaBadge}>
                      <Text style={styles.diaBadgeTexto}>{itens.length}</Text>
                    </View>
                    <Ionicons
                      name={aberto ? 'chevron-up' : 'chevron-down'}
                      size={20}
                      color={cores.textoSecundario}
                    />
                  </Pressable>

                  {aberto &&
                    itens.map((item) => (
                      <ItemMarcacao
                        key={`${item.colaboradorId}-${item.data}`}
                        item={item}
                        aoPressionar={
                          podeAjustar ? () => ajustarItem(item) : undefined
                        }
                      />
                    ))}
                </Cartao>
              );
            })
          )}
        </>
      )}
    </Tela>
  );
}

/** Cartão de resumo do ciclo: o tamanho do trabalho a fazer. */
function ResumoCiclo({
  totais,
  podeAjustar,
}: {
  totais: CentralMarcacoesInvalidas['totais'];
  podeAjustar: boolean;
}): React.ReactElement {
  if (totais.dias === 0) {
    return (
      <Cartao style={styles.cardResumo}>
        <Text style={styles.resumoTexto}>
          Nenhuma marcação faltante neste ciclo. 🎉
        </Text>
        <AvisoNaoRetorno quantidade={totais.naoRetornosExcluidos} />
      </Cartao>
    );
  }
  return (
    <Cartao style={styles.cardResumo}>
      <Text style={styles.resumoTitulo}>
        {totais.marcacoesFaltantes} marcação(ões) a ajustar
      </Text>
      <Text style={styles.resumoTexto}>
        Em {totais.dias} dia(s), de {totais.pessoas} pessoa(s).
      </Text>
      {podeAjustar && (
        <Text style={styles.resumoDica}>
          Toque em uma pessoa para lançar a marcação que falta no Relógio Ponto.
        </Text>
      )}
      <View style={styles.resumoChips}>
        {totais.faltaUma > 0 && (
          <Selo
            texto={`${totais.faltaUma} dia(s) falta 1`}
            cor={cores.amarelo}
            fundo={cores.amareloFundo}
          />
        )}
        {totais.faltamDuas > 0 && (
          <Selo
            texto={`${totais.faltamDuas} dia(s) faltam 2`}
            cor={cores.vermelho}
            fundo={cores.vermelhoFundo}
          />
        )}
        {totais.faltamTresOuMais > 0 && (
          <Selo
            texto={`${totais.faltamTresOuMais} dia(s) faltam 3+`}
            cor={cores.vermelho}
            fundo={cores.vermelhoFundo}
          />
        )}
        {totais.aConferir > 0 && (
          <Selo
            texto={`${totais.aConferir} a conferir`}
            cor={cores.laranja}
            fundo={cores.laranjaFundo}
          />
        )}
      </View>
      {/* Por tipo: mostra em quantos dias cada marcação está faltando. */}
      <View style={styles.resumoChips}>
        {OPCOES_FILTRO.filter((o) => o.valor !== 'TODAS').map((o) => {
          const tipo = o.valor as MarcacaoCanonica;
          const qtd = totais.porTipo[tipo] ?? 0;
          if (qtd === 0) return null;
          return (
            <Selo
              key={tipo}
              texto={`${rotuloMarcacao(tipo)}: ${qtd}`}
              cor={cores.azul}
              fundo={cores.azulFundo}
            />
          );
        })}
      </View>
      {totais.devidasMs > 0 && (
        <Text style={styles.resumoDevidas}>
          Estes dias somam {formatarDuracao(totais.devidasMs)} lançadas como
          horas devidas — ajustar as marcações corrige o saldo.
        </Text>
      )}
      <AvisoNaoRetorno quantidade={totais.naoRetornosExcluidos} />
    </Cartao>
  );
}

/**
 * Nota sobre os dias de não retorno do intervalo, que ficam FORA desta lista.
 *
 * Ali a pessoa saiu e não voltou: não há batida esquecida para ajustar, é uma
 * incidência de conduta e o seu lugar é o painel de incidências. Ainda assim a
 * contagem aparece aqui — se o dia simplesmente desaparecesse, o gestor poderia
 * concluir que o ciclo está limpo quando não está.
 */
function AvisoNaoRetorno({
  quantidade,
}: {
  quantidade: number;
}): React.ReactElement | null {
  if (quantidade <= 0) return null;
  return (
    <Text style={styles.resumoNaoRetorno}>
      {quantidade === 1
        ? '1 dia de não retorno do intervalo não entra nesta lista'
        : `${quantidade} dias de não retorno do intervalo não entram nesta lista`}
      : a pessoa saiu e não voltou, então não há marcação esquecida a ajustar —
      são incidências, tratadas no painel de incidências.
    </Text>
  );
}

/**
 * Um dia de uma pessoa com marcação faltando.
 *
 * Com `aoPressionar`, o item é a **porta de entrada do ajuste**: leva ao Relógio
 * Ponto já na pessoa e no dia certos. Sem ele (usuário sem acesso ao Relógio
 * Ponto), continua sendo texto de leitura — um item que parece clicável e não
 * faz nada é pior do que um item claramente estático.
 */
function ItemMarcacao({
  item,
  aoPressionar,
}: {
  item: MarcacaoInvalidaItem;
  aoPressionar?: () => void;
}): React.ReactElement {
  const selo = seloQuantidade(item.quantidadeFaltante);
  const conteudo = (
    <>
      <View style={styles.itemTopo}>
        <Text style={styles.itemNome} numberOfLines={1}>
          {item.nome}
        </Text>
        <Selo texto={selo.rotulo} cor={selo.cor} fundo={selo.fundo} />
        {aoPressionar ? (
          <Ionicons
            name="chevron-forward"
            size={18}
            color={cores.textoSecundario}
          />
        ) : null}
      </View>
      <Text style={styles.itemSub}>{rotuloFuncao(item.funcao)}</Text>

      {/* O que falta, em destaque: é a ação a tomar. */}
      <Text style={styles.itemDetalhe}>{item.detalhe}</Text>
      <View style={styles.itemChips}>
        {item.tiposFaltantes.map((t) => (
          <Selo
            key={t}
            texto={rotuloMarcacao(t)}
            cor={cores.vermelho}
            fundo={cores.vermelhoFundo}
          />
        ))}
      </View>

      {/* O que existe, para conferir com o comprovante. */}
      <Text style={styles.itemHoras}>
        {item.registradas} de {item.esperadas} marcações:{' '}
        {item.horasRegistradas.length
          ? item.horasRegistradas.join(' · ')
          : 'nenhuma'}
        {item.entradaPrevista ? ` — turno ${item.entradaPrevista}` : ''}
      </Text>

      {item.devidasMs > 0 && (
        <Text style={styles.itemDevidas}>
          Gerou {formatarDuracao(item.devidasMs)} de horas devidas.
        </Text>
      )}

      {/* Hipótese, não fato: mostra o motivo para o gestor conferir. */}
      {item.confianca === 'BAIXA' && item.observacao && (
        <View style={styles.aviso}>
          <Ionicons
            name="alert-circle-outline"
            size={16}
            color={cores.laranja}
          />
          <Text style={styles.avisoTexto}>{item.observacao}</Text>
        </View>
      )}
    </>
  );

  if (!aoPressionar) return <View style={styles.itemLinha}>{conteudo}</View>;

  return (
    <Pressable
      onPress={aoPressionar}
      style={({ pressed }) => [
        styles.itemLinha,
        pressed && styles.itemPressionado,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Ajustar o ponto de ${item.nome} em ${dataCurta(item.data)}. ${item.detalhe}.`}
    >
      {conteudo}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardCiclo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  setaBtn: { padding: espacamento.xs },
  setaDesabilitada: { opacity: 0.4 },
  cicloCentro: { alignItems: 'center', flex: 1 },
  cicloLabel: { ...tipografia.legenda, color: cores.textoSecundario },
  cicloRotulo: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
  },
  cardResumo: { marginTop: espacamento.md },
  resumoTitulo: {
    ...tipografia.subtitulo,
    color: cores.texto,
    marginBottom: 2,
  },
  resumoTexto: { ...tipografia.corpo, color: cores.texto },
  resumoChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.xs,
    marginTop: espacamento.sm,
  },
  resumoDevidas: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
  },
  resumoDica: {
    ...tipografia.legenda,
    color: cores.primaria,
    marginTop: espacamento.xs,
    fontWeight: '600',
  },
  resumoNaoRetorno: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
    fontStyle: 'italic',
  },
  filtroRotulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.md,
    marginBottom: espacamento.xs,
  },
  cardDia: { marginTop: espacamento.sm },
  diaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
  },
  diaTitulo: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
    flex: 1,
  },
  diaBadge: {
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: raio.lg,
    backgroundColor: cores.vermelhoFundo,
    alignItems: 'center',
  },
  diaBadgeTexto: {
    ...tipografia.legenda,
    color: cores.vermelho,
    fontWeight: '700',
  },
  itemLinha: {
    marginTop: espacamento.sm,
    paddingTop: espacamento.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
  },
  itemPressionado: {
    backgroundColor: cores.superficieAlternativa,
    borderRadius: raio.sm,
  },
  itemTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
  },
  itemNome: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
    flex: 1,
  },
  itemSub: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  itemDetalhe: {
    ...tipografia.corpo,
    color: cores.texto,
    marginTop: espacamento.xs,
    fontWeight: '600',
  },
  itemChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.xs,
    marginTop: espacamento.xs,
  },
  itemHoras: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.xs,
  },
  itemDevidas: {
    ...tipografia.legenda,
    color: cores.vermelho,
    marginTop: 2,
  },
  aviso: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacamento.xs,
    marginTop: espacamento.xs,
    padding: espacamento.sm,
    borderRadius: raio.sm,
    backgroundColor: cores.laranjaFundo,
  },
  avisoTexto: {
    ...tipografia.legenda,
    color: cores.texto,
    flex: 1,
  },
});

export default MarcacoesInvalidasScreen;
