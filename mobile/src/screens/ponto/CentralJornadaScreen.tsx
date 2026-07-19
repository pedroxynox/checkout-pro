/**
 * Central de Jornada — portal de controle da jornada de cada colaborador no
 * ciclo de folha (26→25). No topo, um cartão "hero" com o ciclo (período, dias
 * restantes e barra de dias percorridos) e o saldo atual do time. Em seguida,
 * três atalhos de ação (inconsistências, revisar/fechar ciclo e feriados) com
 * contador/estado, o resumo do time em métricas com ícone, a lista por pessoa
 * (drill-down diário com a ação de marcar falta como débito) e o comparativo
 * dos últimos ciclos. Aplica-se ao contrato 6x1-2x1.
 */
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { centralJornadaService, feriadosService } from '../../api/services';
import {
  CentralComparativo,
  CentralInconsistencias,
  CentralPeriodo,
  CentralPessoaResumo,
  CentralResumo,
} from '../../api/services/centralJornada';
import {
  Cartao,
  CartaoAcao,
  CartaoMetrica,
  Carregando,
  EstadoVazio,
  MensagemErro,
  Selo,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { RootStackParamList } from '../../navigation/types';
import { formatarDuracao, hojeISO } from '../../utils/formato';
import { cores, espacamento, raio, sombra, tipografia } from '../../theme';

const MS_DIA = 24 * 60 * 60 * 1000;

/** Saldo com sinal: "+2h 30min" / "−7h". */
function formatarSaldo(ms: number): string {
  if (ms === 0) return '0min';
  const sinal = ms > 0 ? '+' : '−';
  return `${sinal}${formatarDuracao(Math.abs(ms))}`;
}

function rotuloFuncao(f: string): string {
  if (f === 'FISCAL') return 'Fiscal';
  if (f === 'SUPERVISOR') return 'Supervisor';
  if (f === 'OPERADOR') return 'Operador';
  return 'Gestor';
}

/** Instante (ms) do dia-calendário de um ISO, ancorado em UTC (00:00Z). */
function diaUTC(iso: string): number {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`).getTime();
}

/** Progresso do ciclo em dias: percorridos, total e dias restantes. */
function progressoCiclo(periodo: CentralPeriodo): {
  decorridos: number;
  total: number;
  restantes: number;
  fracao: number;
} {
  const inicio = diaUTC(periodo.inicio);
  const fim = diaUTC(periodo.fim);
  const hoje = diaUTC(hojeISO());
  const total = Math.max(1, Math.round((fim - inicio) / MS_DIA) + 1);
  const decorridos = Math.min(
    total,
    Math.max(0, Math.round((hoje - inicio) / MS_DIA) + 1),
  );
  const restantes = Math.max(0, total - decorridos);
  return { decorridos, total, restantes, fracao: decorridos / total };
}

export function CentralJornadaScreen(): React.ReactElement {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [ciclo, setCiclo] = useState(0);
  const [verComparativo, setVerComparativo] = useState(false);

  const resumo = useRequisicao<CentralResumo>(
    () => centralJornadaService.resumo(ciclo),
    [ciclo],
  );
  // Contadores dos atalhos (pendências do ciclo e feriados registrados).
  const inconsistencias = useRequisicao<CentralInconsistencias>(
    () => centralJornadaService.inconsistencias(ciclo),
    [ciclo],
  );
  const feriados = useRequisicao(() => feriadosService.listar(), []);
  const comparativo = useRequisicao<CentralComparativo[]>(
    () =>
      verComparativo
        ? centralJornadaService.comparativos(6)
        : Promise.resolve([]),
    [verComparativo],
  );

  function recarregarTudo(): void {
    resumo.recarregar();
    inconsistencias.recarregar();
    feriados.recarregar();
  }

  // Ao voltar do detalhe (onde se pode marcar falta como débito), atualiza o
  // resumo — assim o saldo/hero reflete a mudança. Pula o primeiro foco: a
  // carga inicial já é feita pelo useRequisicao ao montar.
  const recarregarResumoRef = React.useRef(resumo.recarregar);
  recarregarResumoRef.current = resumo.recarregar;
  const primeiroFoco = React.useRef(true);
  useFocusEffect(
    React.useCallback(() => {
      if (primeiroFoco.current) {
        primeiroFoco.current = false;
        return;
      }
      recarregarResumoRef.current();
    }, []),
  );

  // Todos os colaboradores não-gerentes aparecem (mesmo sem movimento), em
  // ordem alfabética por nome.
  const pessoas = (resumo.dados?.pessoas ?? [])
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const totalPendencias = inconsistencias.dados?.totais.total ?? 0;
  // "Registrados" = feriados manuais (estaduais/municipais); os nacionais são
  // automáticos e não contam como cadastro do usuário.
  const feriadosRegistrados = (feriados.dados ?? []).filter(
    (f) => !f.automatico,
  ).length;

  return (
    <Tela aoAtualizar={recarregarTudo} atualizando={resumo.atualizando}>
      {/* Hero: ciclo (período + progresso em dias) e saldo atual do time. */}
      <HeroCiclo
        periodo={resumo.dados?.periodo ?? null}
        saldoMs={resumo.dados?.totais.saldoMs ?? 0}
        ciclo={ciclo}
        aoAnterior={() => setCiclo((c) => c - 1)}
        aoProximo={() => setCiclo((c) => Math.min(0, c + 1))}
      />

      {/* Atalhos de ação com contador/estado. */}
      <View style={styles.acoes}>
        <CartaoAcao
          icone="alert-circle"
          cor={cores.vermelho}
          fundo={cores.vermelhoFundo}
          titulo="Revisar inconsistências"
          estado={
            totalPendencias > 0
              ? `${totalPendencias} pendência${totalPendencias === 1 ? '' : 's'}`
              : 'Sem pendências'
          }
          estadoCor={totalPendencias > 0 ? cores.vermelho : cores.verde}
          aoPressionar={() => navigation.navigate('Inconsistencias')}
        />
        <CartaoAcao
          icone="checkmark-circle"
          cor={cores.verde}
          fundo={cores.verdeFundo}
          titulo="Revisar / fechar ciclo"
          estado={
            totalPendencias > 0
              ? `${totalPendencias} a resolver`
              : 'Pronto para revisão'
          }
          estadoCor={totalPendencias > 0 ? cores.amarelo : cores.verde}
          aoPressionar={() => navigation.navigate('ExportarCiclo')}
        />
        <CartaoAcao
          icone="calendar"
          cor={cores.azul}
          fundo={cores.azulFundo}
          titulo="Gerenciar feriados"
          estado={`${feriadosRegistrados} registrado${feriadosRegistrados === 1 ? '' : 's'}`}
          estadoCor={cores.azul}
          aoPressionar={() => navigation.navigate('Feriados')}
        />
      </View>

      {resumo.carregando ? (
        <Carregando />
      ) : resumo.erro ? (
        <MensagemErro
          mensagem={resumo.erro}
          aoTentarNovamente={resumo.recarregar}
        />
      ) : (
        <>
          {/* Resumo do time (métricas com ícone) */}
          {resumo.dados && (
            <Cartao style={styles.cardResumo}>
              <Text style={styles.secaoTitulo}>Resumo do time</Text>
              <View style={styles.gridResumo}>
                <CartaoMetrica
                  icone="time-outline"
                  cor={cores.verde}
                  fundo={cores.verdeFundo}
                  valor={formatarDuracao(resumo.dados.totais.extras50Ms)}
                  rotulo="Extras 50%"
                />
                <CartaoMetrica
                  icone="time-outline"
                  cor={cores.verde}
                  fundo={cores.verdeFundo}
                  valor={formatarDuracao(resumo.dados.totais.extras100Ms)}
                  rotulo="Extras 100%"
                />
                <CartaoMetrica
                  icone="person-outline"
                  cor={cores.laranja}
                  fundo={cores.laranjaFundo}
                  valor={String(resumo.dados.totais.faltas)}
                  rotulo="Faltas"
                />
                <CartaoMetrica
                  icone="document-text-outline"
                  cor={cores.roxo}
                  fundo={cores.roxoFundo}
                  valor={String(resumo.dados.totais.diasTac)}
                  rotulo="TAC"
                />
                {resumo.dados.totais.atrasos > 0 && (
                  <CartaoMetrica
                    icone="alarm-outline"
                    cor={cores.laranja}
                    fundo={cores.laranjaFundo}
                    valor={String(resumo.dados.totais.atrasos)}
                    rotulo="Atrasos"
                  />
                )}
                {resumo.dados.totais.conflitos > 0 && (
                  <CartaoMetrica
                    icone="warning-outline"
                    cor={cores.vermelho}
                    fundo={cores.vermelhoFundo}
                    valor={String(resumo.dados.totais.conflitos)}
                    rotulo="Conflitos"
                  />
                )}
              </View>
            </Cartao>
          )}

          {/* Lista por pessoa */}
          {pessoas.length === 0 ? (
            <EstadoVazio
              icone="people-outline"
              titulo="Nenhum colaborador"
              descricao="Não há colaboradores para exibir neste ciclo. Cadastre colaboradores para acompanhar a jornada."
            />
          ) : (
            pessoas.map((p) => (
              <PessoaCartao
                key={p.colaboradorId}
                pessoa={p}
                aoTocar={() =>
                  navigation.navigate('DetalheJornada', {
                    colaboradorId: p.colaboradorId,
                    ciclo,
                    pessoa: p,
                  })
                }
              />
            ))
          )}

          {/* Comparativo dos últimos ciclos */}
          <Pressable
            onPress={() => setVerComparativo((v) => !v)}
            style={styles.comparativoBtn}
          >
            <Ionicons
              name={verComparativo ? 'chevron-up' : 'stats-chart-outline'}
              size={16}
              color={cores.primaria}
            />
            <Text style={styles.comparativoBtnTexto}>
              {verComparativo
                ? 'Ocultar comparativo'
                : 'Ver comparativo por ciclo'}
            </Text>
          </Pressable>
          {verComparativo &&
            (comparativo.carregando ? (
              <Carregando />
            ) : (
              <Cartao>
                {(comparativo.dados ?? []).map((c) => (
                  <View key={c.periodo.rotulo} style={styles.compLinha}>
                    <Text style={styles.compRotulo}>{c.periodo.rotulo}</Text>
                    <View style={styles.compValores}>
                      <Text style={styles.compItem}>
                        50%: {formatarDuracao(c.totais.extras50Ms)}
                      </Text>
                      <Text style={styles.compItem}>
                        100%: {formatarDuracao(c.totais.extras100Ms)}
                      </Text>
                      <Text style={[styles.compItem, { color: cores.vermelho }]}>
                        Faltas: {c.totais.faltas}
                      </Text>
                      <Text style={[styles.compItem, { color: cores.amarelo }]}>
                        TAC: {c.totais.diasTac}
                      </Text>
                      <Text
                        style={[
                          styles.compItem,
                          {
                            color:
                              c.totais.saldoMs >= 0
                                ? cores.verde
                                : cores.vermelho,
                          },
                        ]}
                      >
                        Saldo: {formatarSaldo(c.totais.saldoMs)}
                      </Text>
                    </View>
                  </View>
                ))}
              </Cartao>
            ))}
        </>
      )}
    </Tela>
  );
}

/** Cartão "hero" do topo: ciclo (período + progresso) e saldo atual do time. */
function HeroCiclo({
  periodo,
  saldoMs,
  ciclo,
  aoAnterior,
  aoProximo,
}: {
  periodo: CentralPeriodo | null;
  saldoMs: number;
  ciclo: number;
  aoAnterior: () => void;
  aoProximo: () => void;
}): React.ReactElement {
  const prog = periodo ? progressoCiclo(periodo) : null;
  const saldoCor =
    saldoMs > 0 ? cores.verde : saldoMs < 0 ? cores.vermelho : cores.texto;

  return (
    <View style={styles.hero}>
      {/* Linha do ciclo: navegação + período. */}
      <View style={styles.heroTopo}>
        <Pressable onPress={aoAnterior} style={styles.setaBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={20} color={cores.primaria} />
        </Pressable>
        <View style={styles.heroCentro}>
          <View style={styles.heroCicloLabelLinha}>
            <View style={styles.heroIconeCiclo}>
              <Ionicons
                name="calendar-outline"
                size={14}
                color={cores.primaria}
              />
            </View>
            <Text style={styles.heroCicloLabel}>Ciclo de folha</Text>
          </View>
          <Text style={styles.heroPeriodo}>{periodo?.rotulo ?? '—'}</Text>
          <Text style={styles.heroDiasRestantes}>
            {prog ? `${prog.restantes} dias restantes` : ' '}
          </Text>
        </View>
        <Pressable
          onPress={aoProximo}
          style={[styles.setaBtn, ciclo >= 0 && styles.setaDesabilitada]}
          disabled={ciclo >= 0}
          hitSlop={10}
        >
          <Ionicons
            name="chevron-forward"
            size={20}
            color={ciclo >= 0 ? cores.textoSecundario : cores.primaria}
          />
        </Pressable>
      </View>

      <View style={styles.heroDivisor} />

      {/* Saldo atual + barra de dias percorridos do ciclo. */}
      <View style={styles.heroSaldoBloco}>
        <Text style={styles.heroSaldoLabel}>Saldo atual</Text>
        <Text style={[styles.heroSaldoValor, { color: saldoCor }]}>
          {formatarSaldo(saldoMs)}
        </Text>
        {prog && (
          <>
            <View style={styles.barraTrilha}>
              <View
                style={[
                  styles.barraPreenchida,
                  {
                    width: `${Math.round(prog.fracao * 100)}%` as `${number}%`,
                  },
                ]}
              />
            </View>
            <Text style={styles.heroProgressoTexto}>
              Dia {prog.decorridos} de {prog.total} do ciclo
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

function PessoaCartao({
  pessoa,
  aoTocar,
}: {
  pessoa: CentralPessoaResumo;
  aoTocar: () => void;
}): React.ReactElement {
  return (
    <Cartao style={styles.cardPessoa}>
      <Pressable onPress={aoTocar} style={styles.pessoaTopo}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pessoaNome}>{pessoa.primeiroNome}</Text>
          <Text style={styles.pessoaFuncao}>{rotuloFuncao(pessoa.funcao)}</Text>
        </View>
        <View style={styles.pessoaSaldoBox}>
          <Text
            style={[
              styles.pessoaSaldo,
              { color: pessoa.saldoMs >= 0 ? cores.verde : cores.vermelho },
            ]}
          >
            {formatarSaldo(pessoa.saldoMs)}
          </Text>
          <Text style={styles.pessoaSaldoLabel}>saldo</Text>
        </View>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={cores.textoSecundario}
        />
      </Pressable>

      <View style={styles.pessoaChips}>
        <Selo
          texto={`Carga ${formatarDuracao(pessoa.cargaTrabalhadaMs)}`}
          cor={cores.texto}
          fundo={cores.fundo}
        />
        {pessoa.extras50Ms > 0 && (
          <Selo
            texto={`+50% ${formatarDuracao(pessoa.extras50Ms)}`}
            cor={cores.azul}
            fundo={cores.azulFundo}
          />
        )}
        {pessoa.extras100Ms > 0 && (
          <Selo
            texto={`+100% ${formatarDuracao(pessoa.extras100Ms)}`}
            cor={cores.azul}
            fundo={cores.azulFundo}
          />
        )}
        {pessoa.horasDevidasMs > 0 && (
          <Selo
            texto={`Deve ${formatarDuracao(pessoa.horasDevidasMs)}`}
            cor={cores.vermelho}
            fundo={cores.vermelhoFundo}
          />
        )}
        {pessoa.horasAtestadoMs > 0 && (
          <Selo
            texto={`Atestado ${formatarDuracao(pessoa.horasAtestadoMs)}`}
            cor={cores.texto}
            fundo={cores.fundo}
          />
        )}
        {pessoa.faltas > 0 && (
          <Selo
            texto={`${pessoa.faltas} falta(s)`}
            cor={cores.vermelho}
            fundo={cores.vermelhoFundo}
          />
        )}
        {pessoa.diasTac > 0 && (
          <Selo
            texto={`TAC: ${pessoa.diasTac}`}
            cor={cores.amarelo}
            fundo={cores.amareloFundo}
          />
        )}
        {pessoa.conflitos > 0 && (
          <Selo
            texto={`Conflito: ${pessoa.conflitos}`}
            cor={cores.vermelho}
            fundo={cores.vermelhoFundo}
          />
        )}
        {pessoa.atrasos > 0 && (
          <Selo
            texto={`Atraso: ${pessoa.atrasos}`}
            cor={cores.amarelo}
            fundo={cores.amareloFundo}
          />
        )}
      </View>

    </Cartao>
  );
}

const styles = StyleSheet.create({
  // Hero
  hero: {
    backgroundColor: cores.superficie,
    borderRadius: raio.lg,
    borderWidth: 1,
    borderColor: cores.divisor,
    padding: espacamento.lg,
    marginBottom: espacamento.md,
    ...sombra.cartao,
  },
  heroTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  setaBtn: {
    width: 36,
    height: 36,
    borderRadius: raio.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: cores.superficieAlternativa,
  },
  setaDesabilitada: { opacity: 0.4 },
  heroCentro: { flex: 1, alignItems: 'center', paddingHorizontal: espacamento.sm },
  heroCicloLabelLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
  },
  heroIconeCiclo: {
    width: 22,
    height: 22,
    borderRadius: raio.sm,
    backgroundColor: cores.primariaClara,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCicloLabel: { ...tipografia.legenda, color: cores.textoSecundario },
  heroPeriodo: {
    ...tipografia.subtitulo,
    color: cores.texto,
    marginTop: 2,
    textAlign: 'center',
  },
  heroDiasRestantes: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  heroDivisor: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: cores.divisor,
    marginVertical: espacamento.md,
  },
  heroSaldoBloco: { alignItems: 'center' },
  heroSaldoLabel: { ...tipografia.legenda, color: cores.textoSecundario },
  heroSaldoValor: {
    ...tipografia.titulo,
    fontSize: 34,
    marginTop: 2,
    marginBottom: espacamento.md,
  },
  barraTrilha: {
    width: '100%',
    height: 8,
    borderRadius: raio.pill,
    backgroundColor: cores.divisor,
    overflow: 'hidden',
  },
  barraPreenchida: {
    height: '100%',
    borderRadius: raio.pill,
    backgroundColor: cores.primaria,
  },
  heroProgressoTexto: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.xs,
  },
  // Ações
  acoes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.sm,
    marginBottom: espacamento.md,
  },
  // Resumo do time
  cardResumo: { marginBottom: espacamento.md },
  secaoTitulo: {
    ...tipografia.secao,
    color: cores.texto,
    marginBottom: espacamento.sm,
  },
  gridResumo: { flexDirection: 'row', flexWrap: 'wrap', gap: espacamento.sm },
  // Pessoa
  cardPessoa: { marginBottom: espacamento.sm },
  pessoaTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
  },
  pessoaNome: { ...tipografia.rotulo, color: cores.texto, fontWeight: '700' },
  pessoaFuncao: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  pessoaSaldoBox: { alignItems: 'flex-end', marginRight: espacamento.xs },
  pessoaSaldo: { ...tipografia.rotulo, fontWeight: '700' },
  pessoaSaldoLabel: { ...tipografia.legenda, color: cores.textoSecundario },
  pessoaChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.xs,
    marginTop: espacamento.sm,
  },
  // Comparativo
  comparativoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacamento.xs,
    paddingVertical: espacamento.md,
  },
  comparativoBtnTexto: {
    ...tipografia.rotulo,
    color: cores.primaria,
    fontWeight: '600',
  },
  compLinha: {
    paddingVertical: espacamento.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  compRotulo: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
    marginBottom: 4,
  },
  compValores: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.sm,
  },
  compItem: { ...tipografia.legenda, color: cores.textoSecundario },
});

export default CentralJornadaScreen;
