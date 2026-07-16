/**
 * Central de Jornada — portal de controle da jornada de cada colaborador no
 * ciclo de folha (26→25). Mostra o resumo do time, a lista por pessoa (carga,
 * extras 50/100, horas que deve, atestado, faltas, TAC e saldo), o detalhe
 * diário (drill-down) com a ação de marcar falta como débito, e o comparativo
 * dos últimos ciclos. Aplica-se ao contrato 6x1-2x1.
 */
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { centralJornadaService } from '../../api/services';
import {
  CentralComparativo,
  CentralDiaDetalhe,
  CentralPessoaResumo,
  CentralResumo,
} from '../../api/services/centralJornada';
import { useAuth } from '../../auth/AuthContext';
import {
  Cartao,
  Carregando,
  EstadoVazio,
  MensagemErro,
  Selo,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { RootStackParamList } from '../../navigation/types';
import { formatarDuracao } from '../../utils/formato';
import { notificar } from '../../utils/dialogos';
import { cores, espacamento, raio, tipografia } from '../../theme';

const AZUL = '#2563EB';
const VERDE = cores.sucesso ?? '#1E9E5A';
const VERMELHO = cores.erro ?? '#DC2626';
const AMARELO = cores.amarelo ?? '#C99700';

const NOMES_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

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

function dataCurta(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${NOMES_SEMANA[d.getUTCDay()]} ${dd}/${mm}`;
}

function rotuloTipoDia(tipo: CentralDiaDetalhe['tipo']): string {
  switch (tipo) {
    case 'FALTA':
      return 'Falta';
    case 'FALTA_DEBITO':
      return 'Falta (débito)';
    case 'ATESTADO':
      return 'Atestado';
    case 'INCOMPLETO':
      return 'Incompleto';
    default:
      return 'Trabalho';
  }
}

export function CentralJornadaScreen(): React.ReactElement {
  const { podeAcessar } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const podeMarcarDebito = podeAcessar('OPERADORES_AUSENCIAS');

  const [ciclo, setCiclo] = useState(0);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [verComparativo, setVerComparativo] = useState(false);

  const resumo = useRequisicao<CentralResumo>(
    () => centralJornadaService.resumo(ciclo),
    [ciclo],
  );
  const detalhe = useRequisicao<{
    periodo: unknown;
    dias: CentralDiaDetalhe[];
  } | null>(
    () =>
      expandido
        ? centralJornadaService.pessoa(expandido, ciclo)
        : Promise.resolve(null),
    [expandido, ciclo],
  );
  const comparativo = useRequisicao<CentralComparativo[]>(
    () => (verComparativo ? centralJornadaService.comparativos(6) : Promise.resolve([])),
    [verComparativo],
  );

  async function alternarDebito(dia: CentralDiaDetalhe): Promise<void> {
    if (!dia.ausenciaId) return;
    try {
      await centralJornadaService.marcarDebito(dia.ausenciaId, !dia.debito);
      detalhe.recarregar();
      resumo.recarregar();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao salvar.');
    }
  }

  // Todos os colaboradores não-gerentes aparecem (mesmo sem movimento), em
  // ordem alfabética por nome.
  const pessoas = (resumo.dados?.pessoas ?? [])
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <Tela aoAtualizar={resumo.recarregar} atualizando={resumo.atualizando}>
      {/* Seletor de ciclo (26→25) */}
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
            {resumo.dados?.periodo.rotulo ?? '—'}
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

      {/* Atalho para gerenciar feriados (contam como domingo/100%). */}
      <Pressable
        onPress={() => navigation.navigate('Feriados')}
        style={styles.feriadosBtn}
      >
        <Ionicons name="calendar-outline" size={16} color={cores.primaria} />
        <Text style={styles.feriadosBtnTexto}>Gerenciar feriados</Text>
      </Pressable>

      {resumo.carregando ? (
        <Carregando />
      ) : resumo.erro ? (
        <MensagemErro mensagem={resumo.erro} aoTentarNovamente={resumo.recarregar} />
      ) : (
        <>
          {/* Resumo do time */}
          {resumo.dados && (
            <Cartao style={styles.cardResumo}>
              <Text style={styles.secaoTitulo}>Resumo do time</Text>
              <View style={styles.gridResumo}>
                <Metrica rotulo="Extras 50%" valor={formatarDuracao(resumo.dados.totais.extras50Ms)} cor={AZUL} />
                <Metrica rotulo="Extras 100%" valor={formatarDuracao(resumo.dados.totais.extras100Ms)} cor={AZUL} />
                <Metrica rotulo="Deve" valor={formatarDuracao(resumo.dados.totais.horasDevidasMs)} cor={VERMELHO} />
                <Metrica rotulo="Atestado" valor={formatarDuracao(resumo.dados.totais.horasAtestadoMs)} cor={cores.texto} />
                <Metrica rotulo="Faltas" valor={String(resumo.dados.totais.faltas)} cor={VERMELHO} />
                <Metrica rotulo="TAC" valor={String(resumo.dados.totais.diasTac)} cor={AMARELO} />
                {resumo.dados.totais.conflitos > 0 && (
                  <Metrica
                    rotulo="Conflitos"
                    valor={String(resumo.dados.totais.conflitos)}
                    cor={VERMELHO}
                  />
                )}
                <Metrica
                  rotulo="Saldo"
                  valor={formatarSaldo(resumo.dados.totais.saldoMs)}
                  cor={resumo.dados.totais.saldoMs >= 0 ? VERDE : VERMELHO}
                />
              </View>
            </Cartao>
          )}

          {/* Lista por pessoa */}
          {pessoas.length === 0 ? (
            <EstadoVazio
              icone="people-outline"
              titulo="Sem movimento"
              descricao="Ninguém bateu ponto nem teve falta neste ciclo."
            />
          ) : (
            pessoas.map((p) => (
              <PessoaCartao
                key={p.colaboradorId}
                pessoa={p}
                expandido={expandido === p.colaboradorId}
                aoTocar={() =>
                  setExpandido((atual) =>
                    atual === p.colaboradorId ? null : p.colaboradorId,
                  )
                }
                detalheCarregando={
                  expandido === p.colaboradorId && detalhe.carregando
                }
                dias={
                  expandido === p.colaboradorId ? detalhe.dados?.dias ?? [] : []
                }
                podeMarcarDebito={podeMarcarDebito}
                aoAlternarDebito={alternarDebito}
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
              {verComparativo ? 'Ocultar comparativo' : 'Ver comparativo por ciclo'}
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
                      <Text style={[styles.compItem, { color: VERMELHO }]}>
                        Faltas: {c.totais.faltas}
                      </Text>
                      <Text style={[styles.compItem, { color: AMARELO }]}>
                        TAC: {c.totais.diasTac}
                      </Text>
                      <Text
                        style={[
                          styles.compItem,
                          { color: c.totais.saldoMs >= 0 ? VERDE : VERMELHO },
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

function Metrica({
  rotulo,
  valor,
  cor,
}: {
  rotulo: string;
  valor: string;
  cor: string;
}): React.ReactElement {
  return (
    <View style={styles.metrica}>
      <Text style={[styles.metricaValor, { color: cor }]}>{valor}</Text>
      <Text style={styles.metricaRotulo}>{rotulo}</Text>
    </View>
  );
}

function PessoaCartao({
  pessoa,
  expandido,
  aoTocar,
  detalheCarregando,
  dias,
  podeMarcarDebito,
  aoAlternarDebito,
}: {
  pessoa: CentralPessoaResumo;
  expandido: boolean;
  aoTocar: () => void;
  detalheCarregando: boolean;
  dias: CentralDiaDetalhe[];
  podeMarcarDebito: boolean;
  aoAlternarDebito: (dia: CentralDiaDetalhe) => void;
}): React.ReactElement {
  const diasComMovimento = dias.filter((d) => d.tipo !== 'SEM_REGISTRO');
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
              { color: pessoa.saldoMs >= 0 ? VERDE : VERMELHO },
            ]}
          >
            {formatarSaldo(pessoa.saldoMs)}
          </Text>
          <Text style={styles.pessoaSaldoLabel}>saldo</Text>
        </View>
        <Ionicons
          name={expandido ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={cores.textoSecundario}
        />
      </Pressable>

      <View style={styles.pessoaChips}>
        <Selo texto={`Carga ${formatarDuracao(pessoa.cargaTrabalhadaMs)}`} cor={cores.texto} fundo={cores.fundo} />
        {pessoa.extras50Ms > 0 && (
          <Selo texto={`+50% ${formatarDuracao(pessoa.extras50Ms)}`} cor={AZUL} fundo="#EFF6FF" />
        )}
        {pessoa.extras100Ms > 0 && (
          <Selo texto={`+100% ${formatarDuracao(pessoa.extras100Ms)}`} cor={AZUL} fundo="#EFF6FF" />
        )}
        {pessoa.horasDevidasMs > 0 && (
          <Selo texto={`Deve ${formatarDuracao(pessoa.horasDevidasMs)}`} cor={VERMELHO} fundo="#FEECEC" />
        )}
        {pessoa.horasAtestadoMs > 0 && (
          <Selo texto={`Atestado ${formatarDuracao(pessoa.horasAtestadoMs)}`} cor={cores.texto} fundo={cores.fundo} />
        )}
        {pessoa.faltas > 0 && (
          <Selo texto={`${pessoa.faltas} falta(s)`} cor={VERMELHO} fundo="#FEECEC" />
        )}
        {pessoa.diasTac > 0 && (
          <Selo texto={`TAC: ${pessoa.diasTac}`} cor={AMARELO} fundo="#FBF3DA" />
        )}
        {pessoa.conflitos > 0 && (
          <Selo texto={`Conflito: ${pessoa.conflitos}`} cor={VERMELHO} fundo="#FEECEC" />
        )}
      </View>

      {expandido && (
        <View style={styles.detalhe}>
          {detalheCarregando ? (
            <Carregando />
          ) : diasComMovimento.length === 0 ? (
            <Text style={styles.detalheVazio}>Sem dias com movimento no ciclo.</Text>
          ) : (
            diasComMovimento.map((d) => (
              <View key={d.data} style={styles.diaLinha}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.diaData}>
                    {dataCurta(d.data)}
                    {d.ehFeriado ? ' • Feriado' : ''}
                  </Text>
                  <Text style={styles.diaInfo}>
                    {rotuloTipoDia(d.tipo)}
                    {d.tipo === 'TRABALHO'
                      ? ` • ${formatarDuracao(d.trabalhadoMs)} de ${formatarDuracao(d.baseMs)}`
                      : ''}
                    {d.extras50Ms > 0 ? ` • +50% ${formatarDuracao(d.extras50Ms)}` : ''}
                    {d.extras100Ms > 0 ? ` • +100% ${formatarDuracao(d.extras100Ms)}` : ''}
                    {d.devidasMs > 0 ? ` • deve ${formatarDuracao(d.devidasMs)}` : ''}
                  </Text>
                  {d.tipo === 'INCOMPLETO' && d.faltando.length > 0 && (
                    <Text style={styles.diaIncompleto}>
                      Falta registrar: {d.faltando.join(', ')}
                    </Text>
                  )}
                  {d.tac && (
                    <Text style={styles.diaTac}>TAC: {d.motivosTac.join('; ')}</Text>
                  )}
                  {d.conflitoAusencia && (
                    <Text style={styles.diaConflito}>
                      ⚠️ Também há falta/atestado marcado neste dia. Verifique qual está correto.
                    </Text>
                  )}
                </View>
                {podeMarcarDebito &&
                  (d.tipo === 'FALTA' || d.tipo === 'FALTA_DEBITO') &&
                  d.ausenciaId && (
                    <Pressable
                      onPress={() => aoAlternarDebito(d)}
                      style={[
                        styles.debitoBtn,
                        d.debito && styles.debitoBtnAtivo,
                      ]}
                    >
                      <Text
                        style={[
                          styles.debitoBtnTexto,
                          d.debito && styles.debitoBtnTextoAtivo,
                        ]}
                      >
                        {d.debito ? 'Débito ✓' : 'Débito'}
                      </Text>
                    </Pressable>
                  )}
              </View>
            ))
          )}
        </View>
      )}
    </Cartao>
  );
}

const styles = StyleSheet.create({
  cardCiclo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: espacamento.md,
  },
  setaBtn: { padding: espacamento.xs },
  setaDesabilitada: { opacity: 0.4 },
  cicloCentro: { alignItems: 'center', flex: 1 },
  cicloLabel: { ...tipografia.legenda, color: cores.textoSecundario },
  cicloRotulo: { ...tipografia.rotulo, color: cores.texto, fontWeight: '700', marginTop: 2 },
  cardResumo: { marginBottom: espacamento.md },
  secaoTitulo: { ...tipografia.rotulo, color: cores.texto, fontWeight: '700', marginBottom: espacamento.sm },
  gridResumo: { flexDirection: 'row', flexWrap: 'wrap', gap: espacamento.sm },
  metrica: {
    minWidth: '28%',
    flexGrow: 1,
    backgroundColor: cores.fundo,
    borderRadius: raio.md,
    paddingVertical: espacamento.sm,
    alignItems: 'center',
  },
  metricaValor: { ...tipografia.rotulo, fontWeight: '700' },
  metricaRotulo: { ...tipografia.legenda, color: cores.textoSecundario, marginTop: 2 },
  cardPessoa: { marginBottom: espacamento.sm },
  pessoaTopo: { flexDirection: 'row', alignItems: 'center', gap: espacamento.sm },
  pessoaNome: { ...tipografia.rotulo, color: cores.texto, fontWeight: '700' },
  pessoaFuncao: { ...tipografia.legenda, color: cores.textoSecundario, marginTop: 2 },
  pessoaSaldoBox: { alignItems: 'flex-end', marginRight: espacamento.xs },
  pessoaSaldo: { ...tipografia.rotulo, fontWeight: '700' },
  pessoaSaldoLabel: { ...tipografia.legenda, color: cores.textoSecundario },
  pessoaChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.xs,
    marginTop: espacamento.sm,
  },
  detalhe: {
    marginTop: espacamento.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
    paddingTop: espacamento.sm,
  },
  detalheVazio: { ...tipografia.legenda, color: cores.textoSecundario, paddingVertical: espacamento.sm },
  diaLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    paddingVertical: espacamento.xs,
  },
  diaData: { ...tipografia.rotulo, color: cores.texto },
  diaInfo: { ...tipografia.legenda, color: cores.textoSecundario, marginTop: 2 },
  diaIncompleto: { ...tipografia.legenda, color: VERMELHO, marginTop: 2, fontWeight: '600' },
  diaTac: { ...tipografia.legenda, color: AMARELO, marginTop: 2, fontWeight: '600' },
  diaConflito: { ...tipografia.legenda, color: VERMELHO, marginTop: 2, fontWeight: '600' },
  debitoBtn: {
    paddingHorizontal: espacamento.sm,
    paddingVertical: 6,
    borderRadius: raio.pill,
    borderWidth: 1,
    borderColor: VERMELHO,
  },
  debitoBtnAtivo: { backgroundColor: VERMELHO },
  debitoBtnTexto: { ...tipografia.legenda, color: VERMELHO, fontWeight: '700' },
  debitoBtnTextoAtivo: { color: '#fff' },
  feriadosBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacamento.xs,
    paddingVertical: espacamento.sm,
    marginBottom: espacamento.sm,
  },
  feriadosBtnTexto: { ...tipografia.rotulo, color: cores.primaria, fontWeight: '600' },
  comparativoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacamento.xs,
    paddingVertical: espacamento.md,
  },
  comparativoBtnTexto: { ...tipografia.rotulo, color: cores.primaria, fontWeight: '600' },
  compLinha: { paddingVertical: espacamento.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: cores.divisor },
  compRotulo: { ...tipografia.rotulo, color: cores.texto, fontWeight: '700', marginBottom: 4 },
  compValores: { flexDirection: 'row', flexWrap: 'wrap', gap: espacamento.sm },
  compItem: { ...tipografia.legenda, color: cores.textoSecundario },
});

export default CentralJornadaScreen;
