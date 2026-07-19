/**
 * Detalhe da jornada de um colaborador no ciclo (aberto ao tocar numa pessoa da
 * Central de Jornada). Mostra o resumo da pessoa (chips) e o detalhe dia a dia
 * (batidas/incidências/extras/atestados), com a ação de marcar falta como
 * débito. Fica em tela própria para não pesar a Central: o backend carrega
 * apenas os dados desta pessoa.
 */
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { centralJornadaService } from '../../api/services';
import { CentralDiaDetalhe } from '../../api/services/centralJornada';
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

export function DetalheJornadaScreen(): React.ReactElement {
  const route = useRoute<RouteProp<RootStackParamList, 'DetalheJornada'>>();
  const { podeAcessar } = useAuth();
  const podeMarcarDebito = podeAcessar('OPERADORES_AUSENCIAS');
  const { colaboradorId, ciclo, pessoa } = route.params;

  const detalhe = useRequisicao<{ dias: CentralDiaDetalhe[] } | null>(
    () => centralJornadaService.pessoa(colaboradorId, ciclo),
    [colaboradorId, ciclo],
  );

  async function alternarDebito(dia: CentralDiaDetalhe): Promise<void> {
    if (!dia.ausenciaId) return;
    try {
      await centralJornadaService.marcarDebito(dia.ausenciaId, !dia.debito);
      detalhe.recarregar();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao salvar.');
    }
  }

  const dias = (detalhe.dados?.dias ?? []).filter(
    (d) => d.tipo !== 'SEM_REGISTRO',
  );

  return (
    <Tela aoAtualizar={detalhe.recarregar} atualizando={detalhe.atualizando}>
      {/* Cabeçalho da pessoa (resumo do ciclo) */}
      <Cartao>
        <View style={styles.topo}>
          <View style={{ flex: 1 }}>
            <Text style={styles.nome}>{pessoa.nome}</Text>
            <Text style={styles.funcao}>{rotuloFuncao(pessoa.funcao)}</Text>
          </View>
          <View style={styles.saldoBox}>
            <Text
              style={[
                styles.saldo,
                { color: pessoa.saldoMs >= 0 ? cores.verde : cores.vermelho },
              ]}
            >
              {formatarSaldo(pessoa.saldoMs)}
            </Text>
            <Text style={styles.saldoLabel}>saldo</Text>
          </View>
        </View>

        <View style={styles.chips}>
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

      <Text style={styles.secaoTitulo}>Detalhe por dia</Text>

      {detalhe.carregando ? (
        <Carregando />
      ) : detalhe.erro ? (
        <MensagemErro
          mensagem={detalhe.erro}
          aoTentarNovamente={detalhe.recarregar}
        />
      ) : dias.length === 0 ? (
        <EstadoVazio
          icone="time-outline"
          titulo="Sem movimento"
          descricao={`${pessoa.primeiroNome} não tem batidas nem faltas neste ciclo.`}
        />
      ) : (
        <Cartao>
          {dias.map((d) => (
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
                  {d.extras50Ms > 0
                    ? ` • +50% ${formatarDuracao(d.extras50Ms)}`
                    : ''}
                  {d.extras100Ms > 0
                    ? ` • +100% ${formatarDuracao(d.extras100Ms)}`
                    : ''}
                  {d.devidasMs > 0
                    ? ` • deve ${formatarDuracao(d.devidasMs)}`
                    : ''}
                </Text>
                {d.tipo === 'INCOMPLETO' && d.faltando.length > 0 && (
                  <Text style={styles.diaIncompleto}>
                    Falta registrar: {d.faltando.join(', ')}
                  </Text>
                )}
                {d.tac && (
                  <Text style={styles.diaTac}>
                    TAC: {d.motivosTac.join('; ')}
                  </Text>
                )}
                {d.conflitoAusencia && (
                  <Text style={styles.diaConflito}>
                    ⚠️ Também há falta/atestado marcado neste dia. Verifique qual
                    está correto.
                  </Text>
                )}
                {d.atrasoMinutos != null && (
                  <Text style={styles.diaAtraso}>
                    Atraso de {d.atrasoMinutos} min na entrada
                    {d.entradaPrevista ? ` (turno ${d.entradaPrevista})` : ''}.
                  </Text>
                )}
              </View>
              {podeMarcarDebito &&
                (d.tipo === 'FALTA' || d.tipo === 'FALTA_DEBITO') &&
                d.ausenciaId && (
                  <Pressable
                    onPress={() => alternarDebito(d)}
                    style={[styles.debitoBtn, d.debito && styles.debitoBtnAtivo]}
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
          ))}
        </Cartao>
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  topo: { flexDirection: 'row', alignItems: 'center', gap: espacamento.sm },
  nome: { ...tipografia.subtitulo, color: cores.texto, fontWeight: '700' },
  funcao: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  saldoBox: { alignItems: 'flex-end' },
  saldo: { ...tipografia.rotulo, fontWeight: '700' },
  saldoLabel: { ...tipografia.legenda, color: cores.textoSecundario },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.xs,
    marginTop: espacamento.sm,
  },
  secaoTitulo: {
    ...tipografia.secao,
    color: cores.texto,
    marginTop: espacamento.md,
    marginBottom: espacamento.sm,
  },
  diaLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    paddingVertical: espacamento.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  diaData: { ...tipografia.rotulo, color: cores.texto },
  diaInfo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  diaIncompleto: {
    ...tipografia.legenda,
    color: cores.vermelho,
    marginTop: 2,
    fontWeight: '600',
  },
  diaTac: {
    ...tipografia.legenda,
    color: cores.amarelo,
    marginTop: 2,
    fontWeight: '600',
  },
  diaConflito: {
    ...tipografia.legenda,
    color: cores.vermelho,
    marginTop: 2,
    fontWeight: '600',
  },
  diaAtraso: {
    ...tipografia.legenda,
    color: cores.amarelo,
    marginTop: 2,
    fontWeight: '600',
  },
  debitoBtn: {
    paddingHorizontal: espacamento.sm,
    paddingVertical: 6,
    borderRadius: raio.pill,
    borderWidth: 1,
    borderColor: cores.vermelho,
  },
  debitoBtnAtivo: { backgroundColor: cores.vermelho },
  debitoBtnTexto: {
    ...tipografia.legenda,
    color: cores.vermelho,
    fontWeight: '700',
  },
  debitoBtnTextoAtivo: { color: cores.textoInverso },
});

export default DetalheJornadaScreen;
