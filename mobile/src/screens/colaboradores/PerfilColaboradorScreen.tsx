/**
 * Perfil Inteligente do Colaborador (somente leitura).
 *
 * Mostra, para o período (mês corrente por padrão), o Score de Saúde, os
 * indicadores do papel (com ranking, tendência, média da equipe e gráfico de
 * evolução), o controle de faltas com gráficos, o resumo automático em
 * linguagem natural e as insígnias. Tudo vem pronto do backend
 * (`GET /colaboradores/:id/perfil`) — determinístico, sem IA.
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colaboradoresService } from '../../api/services';
import {
  FuncaoColaborador,
  IndicadorPerfil,
  NivelSaude,
  PerfilColaborador,
} from '../../api/types';
import {
  Carregando,
  Cartao,
  GraficoBarrasVerticais,
  GraficoPizza,
  MensagemErro,
  montarFatias,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { PropsTela } from '../../navigation/types';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { formatarDuracao } from '../../utils/formato';
import { ROTULO_STATUS_FISCAL } from '../../utils/rotulos';

const FUNCOES: Record<FuncaoColaborador, string> = {
  OPERADOR: 'Operador',
  FISCAL: 'Fiscal',
  SUPERVISOR: 'Supervisor',
  GESTOR: 'Gestor',
};
const NOMES_DIA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/** Cor (texto/fundo) do semáforo a partir do nível de saúde. */
function coresNivel(nivel: NivelSaude): { cor: string; fundo: string } {
  if (nivel === 'BOM') return { cor: cores.verde, fundo: cores.verdeFundo };
  if (nivel === 'ATENCAO') return { cor: cores.amarelo, fundo: cores.amareloFundo };
  return { cor: cores.vermelho, fundo: cores.vermelhoFundo };
}

/** Cor do semáforo de risco de faltas. */
function coresRisco(risco: string): { cor: string; fundo: string; rotulo: string } {
  if (risco === 'ALTO')
    return { cor: cores.vermelho, fundo: cores.vermelhoFundo, rotulo: 'Risco alto' };
  if (risco === 'MEDIO')
    return { cor: cores.amarelo, fundo: cores.amareloFundo, rotulo: 'Risco médio' };
  return { cor: cores.verde, fundo: cores.verdeFundo, rotulo: 'Risco baixo' };
}

function formatar(valor: number, formato: 'MOEDA' | 'NUMERO'): string {
  if (formato === 'MOEDA') {
    return `R$ ${valor.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return valor.toLocaleString('pt-BR');
}

/** Pílula colorida (rótulo curto com fundo suave). */
function Pilula({
  texto,
  cor,
  fundo,
}: {
  texto: string;
  cor: string;
  fundo: string;
}): React.ReactElement {
  return (
    <View style={[styles.pilula, { backgroundColor: fundo }]}>
      <Text style={[styles.pilulaTexto, { color: cor }]}>{texto}</Text>
    </View>
  );
}

/** Linha de tendência (seta + delta) já colorida pelo sentido do indicador. */
function Tendencia({
  delta,
  sentido,
  formato,
}: {
  delta: number;
  sentido: 'MAIOR_MELHOR' | 'MENOR_MELHOR';
  formato: 'MOEDA' | 'NUMERO';
}): React.ReactElement {
  if (delta === 0) {
    return (
      <View style={styles.tendLinha}>
        <Ionicons name="remove" size={14} color={cores.textoSecundario} />
        <Text style={styles.tendNeutro}>estável</Text>
      </View>
    );
  }
  const subiu = delta > 0;
  // "Maior melhor": subir é bom. "Menor melhor": subir é ruim.
  const bom = sentido === 'MAIOR_MELHOR' ? subiu : !subiu;
  const cor = bom ? cores.verde : cores.vermelho;
  return (
    <View style={styles.tendLinha}>
      <Ionicons name={subiu ? 'arrow-up' : 'arrow-down'} size={14} color={cor} />
      <Text style={[styles.tendTexto, { color: cor }]}>
        {`${subiu ? '+' : ''}${formatar(delta, formato)} vs período anterior`}
      </Text>
    </View>
  );
}

/** Cartão de um indicador: valor, ranking, tendência, média e gráfico. */
function CartaoIndicador({ ind }: { ind: IndicadorPerfil }): React.ReactElement {
  const temSerie = ind.serie.some((p) => p.valor > 0);
  return (
    <Cartao titulo={ind.titulo}>
      <View style={styles.indTopo}>
        <View style={{ flex: 1 }}>
          <Text style={styles.indValor}>{formatar(ind.valor, ind.formato)}</Text>
          {ind.quantidade != null && (
            <Text style={styles.indSub}>
              {ind.quantidade.toLocaleString('pt-BR')}{' '}
              {ind.quantidade === 1 ? 'item' : 'itens'}
            </Text>
          )}
        </View>
        {ind.posicao != null ? (
          <Pilula
            texto={`${ind.posicao}º de ${ind.totalParticipantes}`}
            cor={ind.posicao === 1 ? cores.verde : cores.primaria}
            fundo={ind.posicao === 1 ? cores.verdeFundo : cores.primariaClara}
          />
        ) : (
          <Pilula texto="Sem ranking" cor={cores.textoSecundario} fundo={cores.superficieAlternativa} />
        )}
      </View>

      <Tendencia delta={ind.tendencia} sentido={ind.sentido} formato={ind.formato} />

      <View style={styles.indMediaLinha}>
        <Text style={styles.indMediaRotulo}>Média da equipe</Text>
        <Text style={styles.indMediaValor}>
          {formatar(ind.mediaEquipe, ind.formato)}
        </Text>
      </View>

      <Text style={styles.graficoLegenda}>Evolução (últimos meses)</Text>
      {temSerie ? (
        <GraficoBarrasVerticais dados={ind.serie} altura={130} />
      ) : (
        <Text style={styles.semDados}>Sem movimento no período.</Text>
      )}
    </Cartao>
  );
}

export function PerfilColaboradorScreen({
  route,
}: PropsTela<'PerfilColaborador'>): React.ReactElement {
  const { colaboradorId } = route.params;
  const req = useRequisicao<PerfilColaborador>(
    () => colaboradoresService.perfil(colaboradorId),
    [colaboradorId],
  );
  const p = req.dados;

  return (
    <Tela aoAtualizar={req.recarregar} atualizando={req.atualizando}>
      {req.carregando ? (
        <Carregando />
      ) : req.erro || !p ? (
        <MensagemErro
          mensagem={req.erro ?? 'Colaborador não encontrado.'}
          aoTentarNovamente={req.recarregar}
        />
      ) : (
        <>
          {/* Cabeçalho */}
          <Cartao>
            <View style={styles.cabecalho}>
              <View style={styles.avatar}>
                <Ionicons
                  name={p.colaborador.genero === 'M' ? 'man' : 'woman'}
                  size={28}
                  color={cores.primaria}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nome} numberOfLines={1}>
                  {p.colaborador.nome}
                </Text>
                <Text style={styles.sub}>
                  {FUNCOES[p.colaborador.funcao]}
                  {p.colaborador.ativo ? '' : ' · inativo'}
                </Text>
                <Text style={styles.subLeve}>
                  Matrícula {p.colaborador.matricula}
                  {p.colaborador.login ? ` · login ${p.colaborador.login}` : ''}
                </Text>
              </View>
            </View>
          </Cartao>

          {/* Acesso ao app: login vinculado + status online/offline + jornada */}
          {p.vinculoApp && (
            <Cartao titulo="Acesso ao app">
              <View style={styles.escalaLinha}>
                <Text style={styles.escalaRotulo}>Login</Text>
                <Text style={styles.escalaValor}>
                  {p.vinculoApp.login ?? '—'}
                </Text>
              </View>
              {p.vinculoApp.ehFiscal ? (
                <>
                  <View style={styles.escalaLinha}>
                    <Text style={styles.escalaRotulo}>Status agora</Text>
                    <View style={styles.statusLinha}>
                      <View
                        style={[
                          styles.pontoStatus,
                          {
                            backgroundColor: p.vinculoApp.online
                              ? cores.verde
                              : cores.textoSecundario,
                          },
                        ]}
                      />
                      <Text style={styles.escalaValor}>
                        {ROTULO_STATUS_FISCAL[p.vinculoApp.status ?? 'FORA_EXPEDIENTE']}
                      </Text>
                    </View>
                  </View>
                  {p.vinculoApp.jornada && (
                    <>
                      <View style={styles.escalaLinha}>
                        <Text style={styles.escalaRotulo}>Carga de hoje</Text>
                        <Text style={styles.escalaValor}>
                          {formatarDuracao(p.vinculoApp.jornada.cargaHorariaMs)}
                        </Text>
                      </View>
                      <View style={styles.escalaLinha}>
                        <Text style={styles.escalaRotulo}>Intervalo de hoje</Text>
                        <Text style={styles.escalaValor}>
                          {formatarDuracao(p.vinculoApp.jornada.tempoIntervaloMs)}
                        </Text>
                      </View>
                    </>
                  )}
                </>
              ) : (
                <Text style={styles.semDados}>
                  Conta sem registro de fiscal — sem status/jornada.
                </Text>
              )}
            </Cartao>
          )}

          {/* Score de Saúde */}
          <Cartao titulo="Saúde do colaborador">
            <View style={styles.scoreTopo}>
              <View
                style={[
                  styles.scoreCirculo,
                  { backgroundColor: coresNivel(p.score.nivel).fundo },
                ]}
              >
                <Text
                  style={[styles.scoreNumero, { color: coresNivel(p.score.nivel).cor }]}
                >
                  {p.score.valor}
                </Text>
                <Text style={styles.scoreEscala}>/100</Text>
              </View>
              <View style={{ flex: 1, gap: espacamento.xs }}>
                <Pilula
                  texto={
                    p.score.nivel === 'BOM'
                      ? 'Ótimo'
                      : p.score.nivel === 'ATENCAO'
                        ? 'Atenção'
                        : 'Crítico'
                  }
                  cor={coresNivel(p.score.nivel).cor}
                  fundo={coresNivel(p.score.nivel).fundo}
                />
                {p.score.componentes.map((c) => (
                  <View key={c.chave} style={styles.compLinha}>
                    <Text style={styles.compRotulo}>{c.rotulo}</Text>
                    <View style={styles.compBarraFundo}>
                      <View
                        style={[
                          styles.compBarra,
                          {
                            width: `${Math.max(2, Math.min(100, c.valor))}%`,
                            backgroundColor: coresNivel(p.score.nivel).cor,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.compValor}>{c.valor}</Text>
                  </View>
                ))}
              </View>
            </View>
          </Cartao>

          {/* Resumo automático */}
          {p.resumo.length > 0 && (
            <Cartao titulo="Resumo">
              {p.resumo.map((frase, i) => (
                <View key={i} style={styles.resumoLinha}>
                  <Ionicons
                    name="ellipse"
                    size={6}
                    color={cores.primaria}
                    style={{ marginTop: 7 }}
                  />
                  <Text style={styles.resumoTexto}>{frase}</Text>
                </View>
              ))}
            </Cartao>
          )}

          {/* Insígnias */}
          {p.insignias.length > 0 && (
            <Cartao titulo="Destaques">
              <View style={styles.insigniasWrap}>
                {p.insignias.map((ins) => (
                  <View key={ins.id} style={styles.insignia}>
                    <View style={styles.insigniaIcone}>
                      <Ionicons
                        name={ins.icone as keyof typeof Ionicons.glyphMap}
                        size={18}
                        color={cores.amarelo}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.insigniaTitulo}>{ins.titulo}</Text>
                      <Text style={styles.insigniaDesc}>{ins.descricao}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </Cartao>
          )}

          {/* Indicadores */}
          {p.indicadores.map((ind) => (
            <CartaoIndicador key={ind.chave} ind={ind} />
          ))}

          {/* Motivos de cancelamento de cupom (operador) */}
          {p.motivosCancelamento.length > 0 && (
            <Cartao titulo="Motivos de cancelamento de cupom">
              <GraficoPizza
                fatias={montarFatias(p.motivosCancelamento)}
                mostrarValor
                formatarValor={(v) => `${v}`}
              />
            </Cartao>
          )}

          {/* Controle de faltas */}
          <Cartao titulo="Controle de faltas">
            <View style={styles.faltasTopo}>
              <View style={styles.faltaBox}>
                <Text style={styles.faltaNumero}>{p.faltas.total}</Text>
                <Text style={styles.faltaRotulo}>faltas no período</Text>
              </View>
              <View style={styles.faltaBox}>
                <Text style={styles.faltaNumero}>{p.faltas.taxa}%</Text>
                <Text style={styles.faltaRotulo}>absenteísmo</Text>
              </View>
              <Pilula
                texto={coresRisco(p.faltas.risco).rotulo}
                cor={coresRisco(p.faltas.risco).cor}
                fundo={coresRisco(p.faltas.risco).fundo}
              />
            </View>

            <Text style={styles.graficoLegenda}>Faltas por mês</Text>
            {p.faltas.porMes.some((m) => m.valor > 0) ? (
              <GraficoBarrasVerticais dados={p.faltas.porMes} altura={130} />
            ) : (
              <Text style={styles.semDados}>Sem faltas nos últimos meses.</Text>
            )}

            <Text style={[styles.graficoLegenda, { marginTop: espacamento.md }]}>
              Faltas por dia da semana
            </Text>
            {p.faltas.porDiaSemana.some((d) => d.valor > 0) ? (
              <GraficoBarrasVerticais dados={p.faltas.porDiaSemana} altura={130} />
            ) : (
              <Text style={styles.semDados}>Sem padrão por dia da semana.</Text>
            )}
          </Cartao>

          {/* Escala / folga */}
          <Cartao titulo="Escala">
            <View style={styles.escalaLinha}>
              <Text style={styles.escalaRotulo}>Seg–Qui</Text>
              <Text style={styles.escalaValor}>
                {p.colaborador.entradaSemana && p.colaborador.saidaSemana
                  ? `${p.colaborador.entradaSemana} – ${p.colaborador.saidaSemana}`
                  : '—'}
              </Text>
            </View>
            <View style={styles.escalaLinha}>
              <Text style={styles.escalaRotulo}>Sex–Sáb</Text>
              <Text style={styles.escalaValor}>
                {p.colaborador.entradaFds && p.colaborador.saidaFds
                  ? `${p.colaborador.entradaFds} – ${p.colaborador.saidaFds}`
                  : '—'}
              </Text>
            </View>
            <View style={styles.escalaLinha}>
              <Text style={styles.escalaRotulo}>Folga</Text>
              <Text style={styles.escalaValor}>
                {p.colaborador.folgaDiaSemana != null &&
                p.colaborador.folgaDiaSemana >= 0
                  ? NOMES_DIA[p.colaborador.folgaDiaSemana]
                  : '—'}
              </Text>
            </View>
          </Cartao>
        </>
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: espacamento.md },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: cores.primariaClara,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nome: { ...tipografia.subtitulo, color: cores.texto },
  sub: { ...tipografia.rotulo, color: cores.textoSecundario, marginTop: 2 },
  subLeve: { ...tipografia.legenda, color: cores.textoSecundario, marginTop: 2 },

  // Score
  scoreTopo: { flexDirection: 'row', alignItems: 'center', gap: espacamento.lg },
  scoreCirculo: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreNumero: { ...tipografia.titulo, fontSize: 32 },
  scoreEscala: { ...tipografia.legenda, color: cores.textoSecundario, marginTop: -4 },
  compLinha: { flexDirection: 'row', alignItems: 'center', gap: espacamento.sm },
  compRotulo: { ...tipografia.legenda, color: cores.textoSecundario, width: 84 },
  compBarraFundo: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: cores.superficieAlternativa,
    overflow: 'hidden',
  },
  compBarra: { height: 8, borderRadius: 4 },
  compValor: { ...tipografia.legenda, color: cores.texto, width: 26, textAlign: 'right' },

  // Pílula
  pilula: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: raio.pill,
  },
  pilulaTexto: { ...tipografia.legenda, fontWeight: '700' },

  // Resumo
  resumoLinha: { flexDirection: 'row', gap: espacamento.sm, marginBottom: espacamento.xs },
  resumoTexto: { ...tipografia.corpo, color: cores.texto, flex: 1, lineHeight: 20 },

  // Insígnias
  insigniasWrap: { gap: espacamento.sm },
  insignia: { flexDirection: 'row', alignItems: 'center', gap: espacamento.sm },
  insigniaIcone: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: cores.amareloFundo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insigniaTitulo: { ...tipografia.rotulo, color: cores.texto },
  insigniaDesc: { ...tipografia.legenda, color: cores.textoSecundario },

  // Indicador
  indTopo: { flexDirection: 'row', alignItems: 'flex-start', gap: espacamento.sm },
  indValor: { ...tipografia.subtitulo, color: cores.texto },
  indSub: { ...tipografia.legenda, color: cores.textoSecundario, marginTop: 2 },
  tendLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: espacamento.xs,
  },
  tendTexto: { ...tipografia.legenda, fontWeight: '600' },
  tendNeutro: { ...tipografia.legenda, color: cores.textoSecundario },
  indMediaLinha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: espacamento.sm,
    paddingTop: espacamento.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
  },
  indMediaRotulo: { ...tipografia.legenda, color: cores.textoSecundario },
  indMediaValor: { ...tipografia.rotulo, color: cores.texto },
  graficoLegenda: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
    marginBottom: espacamento.xs,
  },
  semDados: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    fontStyle: 'italic',
    paddingVertical: espacamento.sm,
  },

  // Faltas
  faltasTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.md,
    marginBottom: espacamento.xs,
  },
  faltaBox: { alignItems: 'center' },
  faltaNumero: { ...tipografia.subtitulo, color: cores.texto },
  faltaRotulo: { ...tipografia.legenda, color: cores.textoSecundario },

  // Escala
  escalaLinha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: espacamento.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  escalaRotulo: { ...tipografia.corpo, color: cores.textoSecundario },
  escalaValor: { ...tipografia.corpo, color: cores.texto, fontWeight: '600' },
  statusLinha: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pontoStatus: { width: 9, height: 9, borderRadius: 5 },
});

export default PerfilColaboradorScreen;
