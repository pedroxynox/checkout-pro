/**
 * Ranking do time numa métrica do "Resumo do time" (uso gerencial —
 * CENTRAL_JORNADA). É o que abre ao tocar numa card do resumo da Central:
 * extras 50%, extras 100%, faltas, atrasos, TAC ou conflitos.
 *
 * **Uma tela para as seis métricas.** O que muda é a configuração: a identidade
 * (título, ícone, cor, como ler e formatar o valor) vem de
 * [`metricasResumo`](./metricasResumo.ts) — a mesma fonte que a card usa, para
 * card e ranking não poderem divergir — e aqui se junta apenas o que é próprio
 * desta tela (`EXTRA_METRICA`): o detalhe dia a dia e a frase do estado vazio.
 * Seis telas separadas seriam o mesmo código copiado seis vezes, e seis lugares
 * para corrigir.
 *
 * Decisões de leitura:
 * - a **cor é a mesma da card** que o usuário acabou de tocar, para ele não se
 *   perder; o que "estar no topo" significa vai escrito no cabeçalho, porque cor
 *   não é suficiente para dizer se muito é bom ou ruim;
 * - a **barra é proporcional ao primeiro colocado**: é isso que mostra, num
 *   relance, se o segundo tem metade ou quase o mesmo;
 * - **quem está em zero não compete**: vai para um rodapé recolhido, para o topo
 *   da lista conter só o que exige atenção;
 * - cada pessoa **abre o detalhe diário** já existente da Central, para o ranking
 *   não ser um beco sem saída.
 */
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import React, { useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { centralJornadaService } from '../../api/services';
import {
  CentralRankings,
  MetricaRanking,
  RankingPessoa,
} from '../../api/services/centralJornada';
import {
  Cartao,
  Carregando,
  EstadoVazio,
  MensagemErro,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { RootStackParamList } from '../../navigation/types';
import {
  IDENTIDADE_METRICA,
  IdentidadeMetrica,
  contar,
} from './metricasResumo';
import { formatarDuracao } from '../../utils/formato';
import { cores, espacamento, raio, tipografia } from '../../theme';

const NOMES_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Cores das três primeiras posições (ouro, prata, bronze). */
const CORES_PODIO = ['#C99700', '#8A94A6', '#A9642B'];

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

/** Rótulo em português do motivo da ausência (enum do backend). */
function rotuloMotivo(motivo: string | null): string {
  switch (motivo) {
    case 'ATESTADO_MEDICO':
      return 'Atestado médico';
    case 'ABONADA':
      return 'Abonada';
    case 'LICENCA':
      return 'Licença';
    case 'ATRASO_JUSTIFICADO':
      return 'Atraso justificado';
    case 'OUTRO':
      return 'Outro motivo';
    default:
      return 'Sem motivo informado';
  }
}

/** Rótulo em português do estado da justificativa. */
function rotuloStatus(status: string): string {
  if (status === 'JUSTIFICADA') return 'justificada';
  if (status === 'INJUSTIFICADA') return 'não justificada';
  return 'pendente';
}

/** Uma linha do detalhe de uma pessoa (um dia). */
interface LinhaDetalhe {
  chave: string;
  dia: string;
  texto: string;
}

/**
 * O que a tela precisa além da identidade compartilhada da métrica: o detalhe
 * dia a dia e a frase do estado vazio.
 */
interface ExtraMetrica {
  /** Detalhe dia a dia; vazio quando a métrica não tem detalhe (extras). */
  detalhes: (p: RankingPessoa) => LinhaDetalhe[];
  /** Frase do estado vazio (ninguém pontuou na métrica). */
  vazio: string;
}

const SEM_DETALHE: ExtraMetrica['detalhes'] = () => [];

const EXTRA_METRICA: Record<MetricaRanking, ExtraMetrica> = {
  // Horas extras não têm detalhe por dia: ali o número é a informação.
  EXTRAS_50: {
    detalhes: SEM_DETALHE,
    vazio: 'Ninguém tem horas extras de 50% neste ciclo.',
  },
  EXTRAS_100: {
    detalhes: SEM_DETALHE,
    vazio: 'Ninguém tem horas extras de 100% neste ciclo.',
  },
  FALTAS: {
    detalhes: (p) =>
      p.faltasDetalhe.map((f) => ({
        chave: `falta-${f.data}`,
        dia: dataCurta(f.data),
        texto:
          f.tipo === 'ATESTADO'
            ? 'Atestado médico (abonado)'
            : f.tipo === 'FALTA_DEBITO'
              ? `Falta com débito de ${formatarDuracao(f.devidasMs)}`
              : 'Falta sem débito de horas',
      })),
    vazio: 'Ninguém tem faltas neste ciclo.',
  },
  TAC: {
    detalhes: (p) =>
      p.tacDetalhe.map((t) => ({
        chave: `tac-${t.data}`,
        dia: dataCurta(t.data),
        texto: t.motivos.length ? t.motivos.join(' · ') : 'Dia em TAC',
      })),
    vazio: 'Ninguém tem dias em TAC neste ciclo.',
  },
  ATRASOS: {
    detalhes: (p) =>
      p.atrasosDetalhe.map((a) => ({
        chave: `atraso-${a.data}`,
        dia: dataCurta(a.data),
        texto: `${a.minutos} min além do turno${
          a.entradaPrevista ? ` (previsto ${a.entradaPrevista})` : ''
        }`,
      })),
    vazio: 'Ninguém tem atrasos neste ciclo.',
  },
  CONFLITOS: {
    detalhes: (p) =>
      p.conflitosDetalhe.map((c) => ({
        chave: `conflito-${c.data}`,
        dia: dataCurta(c.data),
        texto: `Bateu ponto e tem ausência no mesmo dia — ${rotuloMotivo(
          c.motivoJustificativa,
        )} (${rotuloStatus(c.statusJustificativa)})${
          c.debito ? ' · marcada como débito' : ''
        }`,
      })),
    vazio: 'Nenhum conflito entre ponto e ausência neste ciclo.',
  },
};

/** Identidade da métrica (compartilhada com a card) + o extra desta tela. */
type ConfigMetrica = IdentidadeMetrica & ExtraMetrica;

function configDe(metrica: MetricaRanking): ConfigMetrica {
  return { ...IDENTIDADE_METRICA[metrica], ...EXTRA_METRICA[metrica] };
}

export function RankingTimeScreen(): React.ReactElement {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { metrica, ciclo } =
    useRoute<RouteProp<RootStackParamList, 'RankingTime'>>().params;
  const config = configDe(metrica);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [verZerados, setVerZerados] = useState(false);

  // O título da barra é o da métrica (a rota não o define).
  useLayoutEffect(() => {
    navigation.setOptions({ title: config.titulo });
  }, [navigation, config.titulo]);

  const req = useRequisicao<CentralRankings>(
    () => centralJornadaService.rankings(ciclo),
    [ciclo],
  );

  const { classificados, zerados, maior, total } = useMemo(() => {
    const pessoas = req.dados?.pessoas ?? [];
    const comValor = pessoas
      .map((p) => ({ pessoa: p, valor: config.valorPessoa(p) }))
      // Do que mais tem ao que menos tem; empate em ordem alfabética.
      .sort((a, b) =>
        b.valor === a.valor
          ? a.pessoa.nome.localeCompare(b.pessoa.nome)
          : b.valor - a.valor,
      );
    return {
      classificados: comValor.filter((i) => i.valor > 0),
      zerados: comValor.filter((i) => i.valor <= 0).map((i) => i.pessoa),
      maior: comValor.length ? Math.max(0, comValor[0].valor) : 0,
      total: comValor.reduce((s, i) => s + i.valor, 0),
    };
  }, [req.dados, config]);

  function alternar(colaboradorId: string): void {
    setExpandidos((prev) => {
      const proximo = new Set(prev);
      if (proximo.has(colaboradorId)) proximo.delete(colaboradorId);
      else proximo.add(colaboradorId);
      return proximo;
    });
  }

  function abrirDetalheDiario(pessoa: RankingPessoa): void {
    navigation.navigate('DetalheJornada', {
      colaboradorId: pessoa.colaboradorId,
      ciclo,
      pessoa,
    });
  }

  return (
    <Tela aoAtualizar={req.recarregar} atualizando={req.atualizando}>
      {req.carregando ? (
        <Carregando />
      ) : req.erro ? (
        <MensagemErro mensagem={req.erro} aoTentarNovamente={req.recarregar} />
      ) : (
        <>
          {/* Cabeçalho: período, total do time e o que "estar no topo" significa. */}
          <Cartao style={styles.cardTopo}>
            <View style={styles.topoLinha}>
              <View style={[styles.caixaIcone, { backgroundColor: config.fundo }]}>
                <Ionicons name={config.icone} size={20} color={config.cor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.topoCiclo}>
                  Ciclo {req.dados?.periodo.rotulo ?? '—'}
                </Text>
                <Text style={[styles.topoTotal, { color: config.cor }]}>
                  {config.formatar(total)}
                </Text>
                <Text style={styles.topoRotulo}>no time todo</Text>
              </View>
            </View>
            <Text style={styles.topoExplicacao}>
              {config.semantica === 'POSITIVA'
                ? 'Do que mais acumulou ao que menos acumulou.'
                : 'Do que mais precisa de atenção ao que menos precisa.'}
            </Text>
          </Cartao>

          {classificados.length === 0 ? (
            <EstadoVazio
              icone="checkmark-done-outline"
              titulo="Nada a mostrar"
              descricao={config.vazio}
            />
          ) : (
            classificados.map((item, indice) => (
              <LinhaRanking
                key={item.pessoa.colaboradorId}
                posicao={indice + 1}
                pessoa={item.pessoa}
                valor={item.valor}
                maior={maior}
                config={config}
                aberto={expandidos.has(item.pessoa.colaboradorId)}
                aoAlternar={() => alternar(item.pessoa.colaboradorId)}
                aoAbrirDetalhe={() => abrirDetalheDiario(item.pessoa)}
              />
            ))
          )}

          {/* Quem está em zero não compete: fica no rodapé, recolhido. */}
          {zerados.length > 0 && (
            <Cartao style={styles.cardZerados}>
              <Pressable
                onPress={() => setVerZerados((v) => !v)}
                style={styles.zeradosHeader}
                accessibilityRole="button"
              >
                <Ionicons
                  name="people-outline"
                  size={18}
                  color={cores.textoSecundario}
                />
                <Text style={styles.zeradosTitulo}>
                  {contar(zerados.length, 'pessoa', 'pessoas')} sem novidade
                </Text>
                <Ionicons
                  name={verZerados ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={cores.textoSecundario}
                />
              </Pressable>
              {verZerados &&
                zerados.map((p) => (
                  <Pressable
                    key={p.colaboradorId}
                    onPress={() => abrirDetalheDiario(p)}
                    style={styles.zeradoLinha}
                    accessibilityRole="button"
                  >
                    <Text style={styles.zeradoNome} numberOfLines={1}>
                      {p.nome}
                    </Text>
                    <Text style={styles.zeradoFuncao}>
                      {rotuloFuncao(p.funcao)}
                    </Text>
                  </Pressable>
                ))}
            </Cartao>
          )}
        </>
      )}
    </Tela>
  );
}

/** Uma pessoa no ranking: posição, valor, barra proporcional e detalhe. */
function LinhaRanking({
  posicao,
  pessoa,
  valor,
  maior,
  config,
  aberto,
  aoAlternar,
  aoAbrirDetalhe,
}: {
  posicao: number;
  pessoa: RankingPessoa;
  valor: number;
  maior: number;
  config: ConfigMetrica;
  aberto: boolean;
  aoAlternar: () => void;
  aoAbrirDetalhe: () => void;
}): React.ReactElement {
  const detalhes = config.detalhes(pessoa);
  // Proporção em relação ao 1º colocado (é a comparação que interessa).
  const fracao = maior > 0 ? Math.max(0.04, valor / maior) : 0;
  const corPosicao = CORES_PODIO[posicao - 1] ?? cores.textoSecundario;

  return (
    <Cartao style={styles.cardPessoa}>
      <Pressable
        onPress={aoAbrirDetalhe}
        style={styles.pessoaTopo}
        accessibilityRole="button"
        accessibilityLabel={`${pessoa.nome}, ${config.formatar(valor)}. Abrir detalhe diário.`}
      >
        <View style={[styles.posicao, { borderColor: corPosicao }]}>
          <Text style={[styles.posicaoTexto, { color: corPosicao }]}>
            {posicao}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.pessoaNome} numberOfLines={1}>
            {pessoa.nome}
          </Text>
          <Text style={styles.pessoaFuncao}>{rotuloFuncao(pessoa.funcao)}</Text>
        </View>
        <Text style={[styles.pessoaValor, { color: config.cor }]}>
          {config.formatar(valor)}
        </Text>
        <Ionicons
          name="chevron-forward"
          size={16}
          color={cores.textoSecundario}
        />
      </Pressable>

      <View style={styles.barraTrilha}>
        <View
          style={[
            styles.barraPreenchida,
            {
              width: `${Math.round(fracao * 100)}%` as `${number}%`,
              backgroundColor: config.cor,
            },
          ]}
        />
      </View>

      {detalhes.length > 0 && (
        <>
          <Pressable
            onPress={aoAlternar}
            style={styles.detalheBotao}
            accessibilityRole="button"
          >
            <Text style={styles.detalheBotaoTexto}>
              {aberto
                ? 'Ocultar os dias'
                : `Ver ${contar(detalhes.length, 'dia', 'dias')}`}
            </Text>
            <Ionicons
              name={aberto ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={cores.primaria}
            />
          </Pressable>
          {aberto &&
            detalhes.map((d) => (
              <View key={d.chave} style={styles.detalheLinha}>
                <Text style={styles.detalheDia}>{d.dia}</Text>
                <Text style={styles.detalheTexto}>{d.texto}</Text>
              </View>
            ))}
        </>
      )}
    </Cartao>
  );
}

const styles = StyleSheet.create({
  cardTopo: { marginBottom: espacamento.md },
  topoLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
  },
  caixaIcone: {
    width: 40,
    height: 40,
    borderRadius: raio.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topoCiclo: { ...tipografia.legenda, color: cores.textoSecundario },
  topoTotal: { ...tipografia.titulo, fontSize: 26 },
  topoRotulo: { ...tipografia.legenda, color: cores.textoSecundario },
  topoExplicacao: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
  },
  cardPessoa: { marginBottom: espacamento.sm },
  pessoaTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
  },
  posicao: {
    width: 28,
    height: 28,
    borderRadius: raio.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posicaoTexto: { ...tipografia.legenda, fontWeight: '700' },
  pessoaNome: { ...tipografia.rotulo, color: cores.texto, fontWeight: '700' },
  pessoaFuncao: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 1,
  },
  pessoaValor: { ...tipografia.rotulo, fontWeight: '700' },
  barraTrilha: {
    height: 6,
    borderRadius: raio.pill,
    backgroundColor: cores.divisor,
    overflow: 'hidden',
    marginTop: espacamento.sm,
  },
  barraPreenchida: { height: '100%', borderRadius: raio.pill },
  detalheBotao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacamento.xs,
    paddingTop: espacamento.sm,
  },
  detalheBotaoTexto: {
    ...tipografia.legenda,
    color: cores.primaria,
    fontWeight: '600',
  },
  detalheLinha: {
    marginTop: espacamento.xs,
    paddingTop: espacamento.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
  },
  detalheDia: {
    ...tipografia.legenda,
    color: cores.texto,
    fontWeight: '700',
  },
  detalheTexto: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 1,
  },
  cardZerados: { marginTop: espacamento.sm },
  zeradosHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
  },
  zeradosTitulo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    flex: 1,
  },
  zeradoLinha: {
    marginTop: espacamento.sm,
    paddingTop: espacamento.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
  },
  zeradoNome: { ...tipografia.rotulo, color: cores.texto },
  zeradoFuncao: { ...tipografia.legenda, color: cores.textoSecundario },
});

export default RankingTimeScreen;
