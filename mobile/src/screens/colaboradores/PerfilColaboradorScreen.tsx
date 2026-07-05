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
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colaboradoresService, escalaService } from '../../api/services';
import { useAuth } from '../../auth/AuthContext';
import {
  FuncaoColaborador,
  IncidenciaEscala,
  IndicadorPerfil,
  NivelSaude,
  PerfilColaborador,
  TimelineItem,
} from '../../api/types';
import {
  Carregando,
  Cartao,
  GraficoBarrasVerticais,
  GraficoPizza,
  MensagemErro,
  montarFatias,
  Segmentado,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { PropsTela } from '../../navigation/types';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { formatarData, formatarDuracao, hojeISO } from '../../utils/formato';
import { ROTULO_STATUS_FISCAL } from '../../utils/rotulos';
import {
  RegistrarIncidenciaModal,
  ValoresIniciaisIncidencia,
} from '../fiscais/RegistrarIncidenciaModal';

const FUNCOES: Record<FuncaoColaborador, string> = {
  OPERADOR: 'Operador',
  FISCAL: 'Fiscal',
  SUPERVISOR: 'Supervisor',
  GESTOR: 'Gestor',
};
const NOMES_DIA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/** Rótulo do marco do contrato. */
const ROTULO_MARCO_CONTRATO: Record<'MARCO_45' | 'MARCO_90', string> = {
  MARCO_45: '45 dias',
  MARCO_90: '90 dias',
};

/** Pílula (cor/fundo/rótulo) da etiqueta do contrato. */
function pilulaContrato(
  c: PerfilColaborador['contrato'],
): { cor: string; fundo: string; rotulo: string } {
  if (c.etiqueta === 'efetivado')
    return { cor: cores.verde, fundo: cores.verdeFundo, rotulo: 'Efetivado' };
  if (c.etiqueta === 'experiencia')
    return {
      cor: cores.amarelo,
      fundo: cores.amareloFundo,
      rotulo: 'Experiência',
    };
  if (c.etiqueta === 'encerrado')
    return {
      cor: cores.textoSecundario,
      fundo: cores.superficieAlternativa,
      rotulo: 'Encerrado',
    };
  return {
    cor: cores.textoSecundario,
    fundo: cores.superficieAlternativa,
    rotulo: 'Sem admissão',
  };
}

/** Rótulo de uma decisão de marco. */
function rotuloDecisao(d: 'APROVADO' | 'REPROVADO' | null): string {
  if (d === 'APROVADO') return 'Aprovado';
  if (d === 'REPROVADO') return 'Reprovado';
  return 'Pendente';
}

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

/** Rótulos e ícones da linha do tempo unificada (faltas + incidências). */
const ROTULO_KIND: Record<TimelineItem['kind'], string> = {
  FALTA: 'Falta',
  NAO_RETORNO_INTERVALO: 'Não retorno do intervalo',
};
const ICONE_KIND: Record<TimelineItem['kind'], keyof typeof Ionicons.glyphMap> = {
  FALTA: 'close-circle-outline',
  NAO_RETORNO_INTERVALO: 'time-outline',
};

type FiltroTimeline = 'TODAS' | 'FALTA' | 'NAO_RETORNO_INTERVALO';

/**
 * Histórico unificado de incidências (faltas + não retorno do intervalo) do
 * colaborador. O resumo e a linha do tempo vêm do perfil; os registros
 * completos (para editar/excluir) são buscados à parte quando há permissão.
 */
function HistoricoIncidencias({
  incidencias,
  registros,
  podeEditar,
  colaboradorId,
  aoMudar,
}: {
  incidencias: PerfilColaborador['incidencias'];
  registros: IncidenciaEscala[];
  podeEditar: boolean;
  colaboradorId: string;
  aoMudar: () => void;
}): React.ReactElement {
  const [filtro, setFiltro] = useState<FiltroTimeline>('TODAS');
  const [editando, setEditando] = useState<IncidenciaEscala | null>(null);
  // Pré-preenchimento no modo de CRIAÇÃO (null enquanto editando/fechado).
  const [valoresCriar, setValoresCriar] =
    useState<ValoresIniciaisIncidencia | null>(null);
  const [modalVisivel, setModalVisivel] = useState(false);

  const risco = coresRisco(incidencias.risco);
  const temDiaSemana = incidencias.porDiaSemana.some((d) => d.valor > 0);
  const timeline = incidencias.timeline.filter((t) =>
    filtro === 'TODAS' ? true : t.kind === filtro,
  );

  /** Abre o modal em modo criar (mesmo fluxo manual da EscalaScreen). */
  const registrarNaoRetorno = (): void => {
    if (!podeEditar) return;
    setEditando(null);
    setValoresCriar({ data: hojeISO(), origem: 'MANUAL' });
    setModalVisivel(true);
  };

  /** Abre o modal de edição para uma incidência da linha do tempo. */
  const editarDaTimeline = (item: TimelineItem): void => {
    if (!podeEditar || item.kind !== 'NAO_RETORNO_INTERVALO') return;
    const registro = registros.find(
      (r) => r.data.slice(0, 10) === item.data && r.tipo === item.kind,
    );
    if (!registro) return;
    setValoresCriar(null);
    setEditando(registro);
    setModalVisivel(true);
  };

  return (
    <Cartao titulo="Histórico de incidências">
      <View style={styles.incResumoTopo}>
        <View style={styles.faltaBox}>
          <Text style={styles.faltaNumero}>{incidencias.totalNaoRetorno}</Text>
          <Text style={styles.faltaRotulo}>não retornos</Text>
        </View>
        <View style={styles.faltaBox}>
          <Text style={styles.faltaNumero}>
            {incidencias.diasConsecutivosSemIncidencia}
          </Text>
          <Text style={styles.faltaRotulo}>dias sem incidência</Text>
        </View>
        <Pilula texto={risco.rotulo} cor={risco.cor} fundo={risco.fundo} />
      </View>

      {podeEditar ? (
        <Pressable
          onPress={registrarNaoRetorno}
          style={({ pressed }) => [
            styles.acaoRegistrar,
            pressed && { opacity: 0.6 },
          ]}
        >
          <Ionicons name="time-outline" size={15} color={cores.primaria} />
          <Text style={styles.acaoRegistrarTexto}>Registrar não retorno</Text>
        </Pressable>
      ) : null}

      <View style={styles.escalaLinha}>
        <Text style={styles.escalaRotulo}>Último não retorno</Text>
        <Text style={styles.escalaValor}>
          {incidencias.ultimoNaoRetorno
            ? formatarData(incidencias.ultimoNaoRetorno)
            : '—'}
        </Text>
      </View>

      {temDiaSemana ? (
        <>
          <Text style={styles.graficoLegenda}>Não retornos por dia da semana</Text>
          <GraficoBarrasVerticais dados={incidencias.porDiaSemana} altura={120} />
        </>
      ) : null}

      <View style={{ marginTop: espacamento.md }}>
        <Segmentado<FiltroTimeline>
          opcoes={[
            { valor: 'TODAS', rotulo: 'Todas' },
            { valor: 'FALTA', rotulo: 'Faltas' },
            { valor: 'NAO_RETORNO_INTERVALO', rotulo: 'Não retorno' },
          ]}
          selecionado={filtro}
          aoSelecionar={setFiltro}
        />
      </View>

      {timeline.length === 0 ? (
        <Text style={styles.semDados}>Sem incidências no período.</Text>
      ) : (
        timeline.map((item, i) => {
          const editavel = podeEditar && item.kind === 'NAO_RETORNO_INTERVALO';
          const conteudo = (
            <View style={styles.timelineLinha}>
              <Ionicons
                name={ICONE_KIND[item.kind]}
                size={18}
                color={
                  item.kind === 'FALTA' ? cores.vermelho : cores.amarelo
                }
              />
              <Text style={styles.timelineTexto}>{ROTULO_KIND[item.kind]}</Text>
              <Text style={styles.timelineData}>{formatarData(item.data)}</Text>
              {editavel ? (
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={cores.textoSecundario}
                />
              ) : null}
            </View>
          );
          if (editavel) {
            return (
              <Pressable
                key={`${item.data}-${item.kind}-${i}`}
                onPress={() => editarDaTimeline(item)}
                style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
              >
                {conteudo}
              </Pressable>
            );
          }
          return (
            <View key={`${item.data}-${item.kind}-${i}`}>{conteudo}</View>
          );
        })
      )}

      {modalVisivel ? (
        <RegistrarIncidenciaModal
          visivel={modalVisivel}
          aoFechar={() => setModalVisivel(false)}
          aoSalvar={aoMudar}
          colaboradorId={colaboradorId}
          incidenciaExistente={editando}
          valoresIniciais={valoresCriar ?? undefined}
          podeExcluir={podeEditar}
        />
      ) : null}
    </Cartao>
  );
}

export function PerfilColaboradorScreen({
  route,
}: PropsTela<'PerfilColaborador'>): React.ReactElement {
  const { colaboradorId } = route.params;
  const { podeAcessar } = useAuth();
  const podeEditarIncidencia = podeAcessar('OPERADORES_AUSENCIAS');
  const req = useRequisicao<PerfilColaborador>(
    () => colaboradoresService.perfil(colaboradorId),
    [colaboradorId],
  );
  // Registros completos das incidências (para editar/excluir). Só buscamos
  // quando há permissão de gestão; a linha do tempo do perfil basta para exibir.
  const incidenciasReq = useRequisicao<IncidenciaEscala[]>(
    () =>
      podeEditarIncidencia
        ? escalaService.listarIncidencias({ colaboradorId })
        : Promise.resolve<IncidenciaEscala[]>([]),
    [colaboradorId, podeEditarIncidencia],
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
                <Text style={styles.faltaRotulo}>
                  faltas no período
                  {p.faltas.justificadas > 0
                    ? ` (${p.faltas.justificadas} justif.)`
                    : ''}
                </Text>
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

          {/* Histórico unificado de incidências (faltas + não retorno) */}
          <HistoricoIncidencias
            incidencias={p.incidencias}
            registros={incidenciasReq.dados ?? []}
            podeEditar={podeEditarIncidencia}
            colaboradorId={colaboradorId}
            aoMudar={() => {
              req.recarregar();
              incidenciasReq.recarregar();
            }}
          />

          {/* Tempo de casa / Contrato de experiência (informativo) */}
          {p.contrato.temAdmissao && (
            <Cartao titulo="Tempo de casa">
              <View style={styles.faltasTopo}>
                <View style={styles.faltaBox}>
                  <Text style={styles.faltaNumero}>{p.contrato.diasDeCasa}</Text>
                  <Text style={styles.faltaRotulo}>dias de casa</Text>
                </View>
                <Pilula
                  texto={pilulaContrato(p.contrato).rotulo}
                  cor={pilulaContrato(p.contrato).cor}
                  fundo={pilulaContrato(p.contrato).fundo}
                />
              </View>

              <View style={styles.escalaLinha}>
                <Text style={styles.escalaRotulo}>Admissão</Text>
                <Text style={styles.escalaValor}>
                  {p.contrato.dataAdmissao
                    ? formatarData(p.contrato.dataAdmissao)
                    : '—'}
                </Text>
              </View>
              <View style={styles.escalaLinha}>
                <Text style={styles.escalaRotulo}>Marco de 45 dias</Text>
                <Text style={styles.escalaValor}>
                  {p.contrato.dataMarco45
                    ? `${formatarData(p.contrato.dataMarco45)} · ${rotuloDecisao(p.contrato.decisao45)}`
                    : '—'}
                </Text>
              </View>
              <View style={styles.escalaLinha}>
                <Text style={styles.escalaRotulo}>Marco de 90 dias</Text>
                <Text style={styles.escalaValor}>
                  {p.contrato.dataMarco90
                    ? `${formatarData(p.contrato.dataMarco90)} · ${rotuloDecisao(p.contrato.decisao90)}`
                    : '—'}
                </Text>
              </View>
              {p.contrato.marcoEmAtraso ? (
                <Text style={[styles.semDados, { color: cores.vermelho }]}>
                  Decisão do marco de{' '}
                  {ROTULO_MARCO_CONTRATO[p.contrato.marcoEmAtraso]} em atraso.
                </Text>
              ) : p.contrato.proximoMarco &&
                p.contrato.diasParaProximoMarco !== null ? (
                <Text style={styles.semDados}>
                  Próximo marco (
                  {ROTULO_MARCO_CONTRATO[p.contrato.proximoMarco]}) em{' '}
                  {p.contrato.diasParaProximoMarco} dia
                  {p.contrato.diasParaProximoMarco === 1 ? '' : 's'}.
                </Text>
              ) : null}
              {p.contrato.efetivadoPorDecurso ? (
                <Text style={styles.semDados}>
                  Efetivado por decurso de prazo (passou de 90 dias).
                </Text>
              ) : null}
              <Text style={[styles.semDados, { fontStyle: 'italic' }]}>
                Informativo — não afeta o score.
              </Text>
            </Cartao>
          )}

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

  // Histórico de incidências
  incResumoTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.md,
    marginBottom: espacamento.sm,
  },
  acaoRegistrar: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: espacamento.xs,
    marginBottom: espacamento.sm,
    paddingVertical: espacamento.xs,
    paddingHorizontal: espacamento.sm,
    borderRadius: raio.sm,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  acaoRegistrarTexto: {
    ...tipografia.legenda,
    color: cores.primaria,
    fontWeight: '600',
  },
  timelineLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    paddingVertical: espacamento.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  timelineTexto: {
    ...tipografia.corpo,
    color: cores.texto,
    flex: 1,
  },
  timelineData: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },

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
