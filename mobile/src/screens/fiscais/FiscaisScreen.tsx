/**
 * Área de Fiscais — controle de jornada em tempo real.
 *
 * - O status do fiscal (Disponível / Intervalo / Fora de expediente) é definido
 *   AUTOMATICAMENTE pelas batidas do Registro de Ponto (Fase 2): não há mais
 *   botões manuais. O fiscal vê o seu status atual, as SUAS horas (trabalhando,
 *   intervalo e carga do dia), um atalho para registrar o ponto e pode informar
 *   falta.
 * - Painel: todos os fiscais como cards individuais com estado colorido,
 *   ordenados por status (Disponível > Intervalo > Fora) e atualizados em
 *   tempo real por WebSocket (sem recarregar).
 * - Contador de fiscais disponíveis em tempo real.
 * - Data do dia exibida no topo (não permite registros em dias passados/futuros).
 * - Gestores têm acesso ao log de jornada de toda a equipe (outra tela).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../api/client';
import { fiscaisService } from '../../api/services';
import { ConexaoFiscais, conectarPainelFiscais } from '../../api/socket';
import {
  ItemFolgaFiscal,
  ItemPainelFiscal,
  MeuResumoFiscal,
  StatusFiscal,
} from '../../api/types';
import { Carregando, Cartao, MensagemErro, Tela } from '../../components';
import { PropsTela } from '../../navigation/types';
import { confirmar, notificar } from '../../utils/dialogos';
import { formatarDuracao } from '../../utils/formato';
import { ROTULO_STATUS_FISCAL } from '../../utils/rotulos';
import { cores, espacamento, raio, tipografia } from '../../theme';

const VERDE = cores.sucesso ?? '#1FA463';
const AMARELO = cores.amarelo ?? '#B7791F';
const CINZA = cores.textoSecundario;

// Habilitar LayoutAnimation no Android.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Ordem de prioridade para ordenação do painel. */
const ORDEM_STATUS: Record<StatusFiscal, number> = {
  DISPONIVEL: 0,
  INTERVALO: 1,
  FORA_EXPEDIENTE: 2,
};

function corStatus(status: StatusFiscal): string {
  if (status === 'DISPONIVEL') return VERDE;
  if (status === 'INTERVALO') return AMARELO;
  return CINZA;
}

function corFundoStatus(status: StatusFiscal): string {
  if (status === 'DISPONIVEL') return cores.verdeFundo ?? '#E4F6EC';
  if (status === 'INTERVALO') return cores.amareloFundo ?? '#FBF3DA';
  return cores.fundo;
}

/** Formata a data de hoje em português: "Segunda-feira, 21 de junho de 2026" */
function formatarDataHoje(): string {
  const dias = [
    'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
    'Quinta-feira', 'Sexta-feira', 'Sábado',
  ];
  const meses = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];
  const hoje = new Date();
  const diaSemana = dias[hoje.getDay()];
  const dia = hoje.getDate();
  const mes = meses[hoje.getMonth()];
  const ano = hoje.getFullYear();
  return `${diaSemana}, ${dia} de ${mes} de ${ano}`;
}

/** Formata duração viva desde um timestamp ISO até agora (usa tick para forçar re-render). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function formatarDuracaoViva(emIso: string, _tick: number): string {
  const desde = new Date(emIso).getTime();
  const agora = Date.now();
  const diffMs = Math.max(0, agora - desde);
  const totalSeg = Math.floor(diffMs / 1000);
  const horas = Math.floor(totalSeg / 3600);
  const min = Math.floor((totalSeg % 3600) / 60);
  const seg = totalSeg % 60;
  if (horas > 0) {
    return `${horas}h ${min.toString().padStart(2, '0')}min ${seg.toString().padStart(2, '0')}s`;
  }
  return `${min}min ${seg.toString().padStart(2, '0')}s`;
}

/** Timer do card: desde o 'em' do fiscal (zerado se FORA_EXPEDIENTE). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function timerCard(desde: string | null, status: StatusFiscal, _tick: number): string {
  if (status === 'FORA_EXPEDIENTE' || !desde) return '00:00';
  const ms = Math.max(0, Date.now() - new Date(desde).getTime());
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/** Avatar fixo feminino para todas as fiscais. */
function avatarIcone(): keyof typeof Ionicons.glyphMap {
  return 'person-circle';
}

export function FiscaisScreen({
  navigation,
}: PropsTela<'Fiscais'>): React.ReactElement {
  const { podeAcessar } = useAuth();
  const [painel, setPainel] = useState<ItemPainelFiscal[]>([]);
  const [meu, setMeu] = useState<MeuResumoFiscal | null>(null);
  const [folgas, setFolgas] = useState<ItemFolgaFiscal[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // Live timer tick
  const conexaoRef = useRef<ConexaoFiscais | null>(null);

  // Live timer: atualiza a cada segundo para cronômetro visual.
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const carregar = useCallback(async () => {
    const [p, m, f] = await Promise.all([
      fiscaisService.painel(),
      fiscaisService.meuResumo().catch(() => null),
      fiscaisService.folgaHoje().catch(() => [] as ItemFolgaFiscal[]),
    ]);
    setPainel(p);
    setMeu(m);
    setFolgas(f);
  }, []);

  useEffect(() => {
    carregar()
      .catch((e) =>
        setErro(e instanceof ApiError ? e.message : 'Falha ao carregar.'),
      )
      .finally(() => setCarregando(false));

    let ativo = true;
    void conectarPainelFiscais({
      aoAtualizarStatus: (ev) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setPainel((lista) =>
          lista.map((p) =>
            p.fiscalId === ev.fiscalId
              ? { ...p, status: ev.status, desde: ev.em }
              : p,
          ),
        );
        setMeu((m) =>
          m && m.fiscalId === ev.fiscalId ? { ...m, status: ev.status, em: ev.em } : m,
        );
      },
    }).then((c) => {
      if (ativo) {
        conexaoRef.current = c;
      } else {
        c.desconectar();
      }
    });
    return () => {
      ativo = false;
      conexaoRef.current?.desconectar();
      conexaoRef.current = null;
    };
  }, [carregar]);

  /** Painel ordenado por status: Disponível → Intervalo → Fora de expediente */
  const painelOrdenado = useMemo(
    () =>
      [...painel].sort(
        (a, b) => ORDEM_STATUS[a.status] - ORDEM_STATUS[b.status],
      ),
    [painel],
  );

  /** Contador de fiscais disponíveis em tempo real */
  const totalDisponivel = useMemo(
    () => painel.filter((f) => f.status === 'DISPONIVEL').length,
    [painel],
  );

  const aoAtualizar = async () => {
    setAtualizando(true);
    try {
      await carregar();
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar.');
    } finally {
      setAtualizando(false);
    }
  };

  const informarFalta = async () => {
    const ok = await confirmar(
      'Informar falta',
      'Deseja informar sua falta de hoje? Os gestores serão avisados.',
      'Confirmar',
    );
    if (!ok) return;
    try {
      await fiscaisService.informarFalta();
      setMeu((prev) => (prev ? { ...prev, faltaHoje: true } : prev));
      notificar('Falta registrada', 'Os gestores foram avisados.');
    } catch (e) {
      notificar(
        'Erro',
        e instanceof ApiError ? e.message : 'Não foi possível registrar.',
      );
    }
  };

  if (carregando) {
    return (
      <Tela>
        <Carregando />
      </Tela>
    );
  }

  return (
    <Tela aoAtualizar={aoAtualizar} atualizando={atualizando}>
      {erro && <MensagemErro mensagem={erro} aoTentarNovamente={aoAtualizar} />}

      {/* Data de hoje */}
      <View style={styles.cabecalhoData}>
        <Ionicons name="calendar-outline" size={18} color={cores.textoSecundario} />
        <Text style={styles.dataTexto}>{formatarDataHoje()}</Text>
      </View>

      {/* Minha jornada (só para fiscais) */}
      {meu && (
        <Cartao>
          <View style={styles.linhaTopo}>
            <Text style={styles.titulo}>Minha jornada</Text>
            {meu.folgaHoje ? (
              <View style={[styles.badge, { backgroundColor: '#6366F1' }]}>
                <Text style={styles.badgeTexto}>Folga</Text>
              </View>
            ) : meu.faltaHoje ? (
              <View style={[styles.badge, { backgroundColor: cores.vermelho }]}>  
                <Text style={styles.badgeTexto}>Falta informada</Text>
              </View>
            ) : (
              <View style={[styles.badge, { backgroundColor: corStatus(meu.status) }]}>
                <Text style={styles.badgeTexto}>
                  {ROTULO_STATUS_FISCAL[meu.status]}
                </Text>
              </View>
            )}
          </View>

          {/* Se está de folga: aviso e sem botões */}
          {meu.folgaHoje ? (
            <View style={styles.avisoFolga}>
              <Ionicons name="bed-outline" size={20} color="#6366F1" />
              <Text style={styles.avisoFolgaTexto}>
                Hoje é seu dia de folga. Descanse e aproveite!
              </Text>
            </View>
          ) : meu.faltaHoje ? (
            <View style={styles.avisoFalta}>
              <Ionicons name="information-circle" size={20} color={cores.vermelho} />
              <Text style={styles.avisoFaltaTexto}>
                Você informou falta hoje. Não é possível registrar ponto.
              </Text>
            </View>
          ) : (
            <>
              {/* Status automático pelas batidas do ponto (Fase 2). */}
              <View style={styles.avisoAuto}>
                <Ionicons name="sync-outline" size={18} color={cores.primaria} />
                <Text style={styles.avisoAutoTexto}>
                  Seu status é definido automaticamente pelas batidas do ponto.
                </Text>
              </View>

              <Pressable
                onPress={() => navigation.navigate('RegistroPonto')}
                style={styles.botaoPonto}
              >
                <Ionicons name="time-outline" size={20} color={cores.textoInverso} />
                <Text style={styles.botaoPontoTexto}>Registrar ponto</Text>
              </Pressable>

              <View style={styles.tempos}>
                <Tempo rotulo="Trabalhando" valor={formatarDuracao(meu.tempoTrabalhandoMs)} />
                <Tempo rotulo="Intervalo" valor={formatarDuracao(meu.tempoIntervaloMs)} />
                <Tempo rotulo="Carga do dia" valor={formatarDuracao(meu.cargaHorariaMs)} />
              </View>

              {/* Timer em vivo: tempo no status atual */}
              {meu.status !== 'FORA_EXPEDIENTE' && (
                <View style={styles.timerVivo}>
                  <Ionicons
                    name={meu.status === 'DISPONIVEL' ? 'timer-outline' : 'cafe-outline'}
                    size={16}
                    color={corStatus(meu.status)}
                  />
                  <Text style={[styles.timerVivoTexto, { color: corStatus(meu.status) }]}>
                    {formatarDuracaoViva(meu.em, tick)}
                    {' '}no status atual
                  </Text>
                </View>
              )}

              {/* Botão de falta: apenas se NÃO iniciou a jornada (status FORA_EXPEDIENTE e sem tempo) */}
              {meu.status === 'FORA_EXPEDIENTE' && meu.tempoTrabalhandoMs === 0 && meu.tempoIntervaloMs === 0 && (
                <Pressable onPress={() => void informarFalta()} style={styles.linkFalta}>
                  <Ionicons name="alert-circle-outline" size={18} color={cores.primaria} />
                  <Text style={styles.linkFaltaTexto}>Informar falta de hoje</Text>
                </Pressable>
              )}
            </>
          )}
        </Cartao>
      )}

      {/* Log de jornada da equipe (só gestores) */}
      {podeAcessar('FISCAIS_JORNADA') && (
        <Pressable
          onPress={() => navigation.navigate('JornadaFiscais')}
          style={styles.linkJornada}
        >
          <Ionicons name="time-outline" size={20} color={cores.primaria} />
          <Text style={styles.linkJornadaTexto}>Ver jornada da equipe</Text>
          <Ionicons name="chevron-forward" size={18} color={cores.textoSecundario} />
        </Pressable>
      )}

      {/* Contador de disponíveis + título da seção */}
      <View style={styles.secaoCabecalho}>
        <Text style={styles.secao}>Equipe</Text>
        <View style={[
          styles.contadorDisponivel,
          totalDisponivel < 2 && { backgroundColor: cores.vermelhoFundo },
        ]}>
          <Ionicons
            name={totalDisponivel < 2 ? 'warning' : 'people'}
            size={16}
            color={totalDisponivel < 2 ? cores.vermelho : VERDE}
          />
          <Text style={[
            styles.contadorTexto,
            totalDisponivel < 2 && { color: cores.vermelho },
          ]}>
            {totalDisponivel} disponíve{totalDisponivel === 1 ? 'l' : 'is'}
            {totalDisponivel < 2 ? ' ⚠️' : ''}
          </Text>
        </View>
      </View>

      {/* Card de folga do dia */}
      {folgas.length > 0 && (
        <View style={styles.cardFolga}>
          <View style={styles.cardFolgaIcone}>
            <Ionicons name="bed-outline" size={20} color="#6366F1" />
          </View>
          <View style={styles.cardFolgaInfo}>
            <Text style={styles.cardFolgaTitulo}>Folga hoje</Text>
            <Text style={styles.cardFolgaNomes}>
              {folgas.map((f) => f.primeiroNome).join(', ')}
            </Text>
          </View>
        </View>
      )}

      {/* Painel de todos os fiscais — cards individuais ordenados por status */}
      {painelOrdenado.map((f) => {
        const navegavel = podeAcessar('OPERADORES_AUSENCIAS') && !!f.colaboradorId;
        return (
          <Pressable
            key={f.fiscalId}
            disabled={!navegavel}
            onPress={() =>
              f.colaboradorId &&
              navigation.navigate('PerfilColaborador', {
                colaboradorId: f.colaboradorId,
              })
            }
            style={({ pressed }) => [
              styles.cardFiscal,
              { borderLeftColor: corStatus(f.status) },
              pressed && navegavel && { opacity: 0.6 },
            ]}
          >
            {/* Avatar femenino */}
            <View style={[styles.avatar, { backgroundColor: corFundoStatus(f.status) }]}>
              <Ionicons
                name={avatarIcone()}
                size={24}
                color={corStatus(f.status)}
              />
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.cardNome}>{f.primeiroNome}</Text>
              <Text style={[styles.cardStatus, { color: corStatus(f.status) }]}>
                {ROTULO_STATUS_FISCAL[f.status]}
              </Text>
            </View>
            {/* Timer do card (relógio correndo ou zerado) */}
            <View style={styles.cardTimerContainer}>
              <Ionicons
                name="time-outline"
                size={14}
                color={f.status === 'FORA_EXPEDIENTE' ? cores.textoSecundario : corStatus(f.status)}
              />
              <Text style={[
                styles.cardTimerTexto,
                { color: f.status === 'FORA_EXPEDIENTE' ? cores.textoSecundario : corStatus(f.status) },
              ]}>
                {timerCard(f.desde, f.status, tick)}
              </Text>
            </View>
            {navegavel && (
              <Ionicons
                name="chevron-forward"
                size={16}
                color={cores.textoSecundario}
                style={{ marginLeft: espacamento.xs }}
              />
            )}
          </Pressable>
        );
      })}
    </Tela>
  );
}

function Tempo({ rotulo, valor }: { rotulo: string; valor: string }): React.ReactElement {
  return (
    <View style={styles.tempo}>
      <Text style={styles.tempoValor}>{valor}</Text>
      <Text style={styles.tempoRotulo}>{rotulo}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cabecalhoData: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    marginBottom: espacamento.lg,
  },
  dataTexto: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
  },
  linhaTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titulo: {
    ...tipografia.subtitulo,
    color: cores.texto,
  },
  badge: {
    paddingHorizontal: espacamento.sm,
    paddingVertical: 4,
    borderRadius: raio.md,
  },
  badgeTexto: {
    color: cores.textoInverso,
    fontWeight: '700',
    fontSize: 12,
  },
  avisoAuto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    marginTop: espacamento.md,
    backgroundColor: cores.fundo,
    borderRadius: raio.md,
    padding: espacamento.md,
  },
  avisoAutoTexto: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    flex: 1,
  },
  botaoPonto: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacamento.sm,
    marginTop: espacamento.md,
    paddingVertical: espacamento.md,
    borderRadius: raio.md,
    backgroundColor: cores.primaria,
    minHeight: 52,
  },
  botaoPontoTexto: {
    ...tipografia.rotulo,
    color: cores.textoInverso,
    fontWeight: '700',
  },
  tempos: {
    flexDirection: 'row',
    marginTop: espacamento.lg,
    gap: espacamento.sm,
  },
  tempo: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: cores.fundo,
    borderRadius: raio.md,
    paddingVertical: espacamento.md,
  },
  tempoValor: {
    ...tipografia.subtitulo,
    color: cores.texto,
  },
  tempoRotulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  timerVivo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    marginTop: espacamento.sm,
    paddingVertical: espacamento.xs,
    paddingHorizontal: espacamento.sm,
    backgroundColor: cores.fundo,
    borderRadius: raio.pill,
    alignSelf: 'center',
  },
  timerVivoTexto: {
    ...tipografia.legenda,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  linkFalta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    marginTop: espacamento.lg,
    alignSelf: 'flex-start',
  },
  linkFaltaTexto: {
    ...tipografia.rotulo,
    color: cores.primaria,
  },
  avisoFalta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    marginTop: espacamento.md,
    backgroundColor: cores.vermelhoFundo,
    borderRadius: raio.md,
    padding: espacamento.md,
  },
  avisoFaltaTexto: {
    ...tipografia.rotulo,
    color: cores.vermelho,
    flex: 1,
  },
  avisoFolga: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    marginTop: espacamento.md,
    backgroundColor: '#EEF2FF',
    borderRadius: raio.md,
    padding: espacamento.md,
  },
  avisoFolgaTexto: {
    ...tipografia.rotulo,
    color: '#6366F1',
    flex: 1,
  },
  cardFolga: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.md,
    backgroundColor: '#EEF2FF',
    borderRadius: raio.md,
    paddingHorizontal: espacamento.lg,
    paddingVertical: espacamento.md,
    marginBottom: espacamento.md,
    borderLeftWidth: 4,
    borderLeftColor: '#6366F1',
  },
  cardFolgaIcone: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E0E7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardFolgaInfo: {
    flex: 1,
  },
  cardFolgaTitulo: {
    ...tipografia.rotulo,
    color: '#6366F1',
  },
  cardFolgaNomes: {
    ...tipografia.legenda,
    color: '#4338CA',
    marginTop: 2,
  },
  linkJornada: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    backgroundColor: cores.superficie,
    borderRadius: raio.lg,
    padding: espacamento.lg,
    marginTop: espacamento.md,
  },
  linkJornadaTexto: {
    ...tipografia.rotulo,
    color: cores.texto,
    flex: 1,
  },
  secaoCabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: espacamento.xl,
    marginBottom: espacamento.sm,
  },
  secao: {
    ...tipografia.secao,
    color: cores.texto,
  },
  contadorDisponivel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    backgroundColor: cores.verdeFundo ?? '#E4F6EC',
    paddingHorizontal: espacamento.sm,
    paddingVertical: 4,
    borderRadius: raio.pill,
  },
  contadorTexto: {
    ...tipografia.legenda,
    color: VERDE,
    fontWeight: '700',
  },
  cardFiscal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.md,
    backgroundColor: cores.superficie,
    borderRadius: raio.md,
    paddingHorizontal: espacamento.lg,
    paddingVertical: espacamento.md,
    marginBottom: espacamento.sm,
    borderLeftWidth: 4,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
  },
  cardNome: {
    ...tipografia.rotulo,
    color: cores.texto,
  },
  cardStatus: {
    ...tipografia.legenda,
    fontWeight: '600',
    marginTop: 2,
  },
  cardTimerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: cores.fundo,
    paddingHorizontal: espacamento.sm,
    paddingVertical: 4,
    borderRadius: raio.pill,
  },
  cardTimerTexto: {
    ...tipografia.legenda,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});

export default FiscaisScreen;
