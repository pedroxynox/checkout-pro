/**
 * Tela de Escala (Req 4.3.6).
 *
 * Exibe a escala consolidada por dia da semana: para cada funcionário, mostra a
 * escala efetiva (horário de entrada/saída, intervalo e se é especial) ou
 * "Folga". O dia da semana é selecionável.
 *
 * Quando o dia selecionado é HOJE, os fiscais mostram também o seu status AO
 * VIVO (Disponível / Em intervalo / Fora de expediente), derivado das batidas
 * do ponto e atualizado em tempo real por WebSocket (Fase 3).
 *
 * Para quem gere ausências (`OPERADORES_AUSENCIAS`), cada colaborador ganha dois
 * botões diretos — **Falta** e **Sem retorno** — que marcam a ocorrência de hoje
 * com um toque (sem horário). Advertências e suspensões são lançadas no perfil.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { escalaService, fiscaisService, operadoresService } from '../../api/services';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ItemEscalaConsolidada, StatusFiscal } from '../../api/types';
import { ConexaoFiscais, conectarPainelFiscais } from '../../api/socket';
import {
  Carregando,
  Cartao,
  EstadoVazio,
  MensagemErro,
  Selo,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { RootStackParamList } from '../../navigation/types';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { confirmar, notificar } from '../../utils/dialogos';
import { ROTULO_STATUS_FISCAL } from '../../utils/rotulos';
import {
  DIAS_SEMANA,
  DIAS_SEMANA_CURTO,
  diaSemanaHoje,
  hojeISO,
} from '../../utils/formato';

const VERDE = cores.sucesso ?? '#1FA463';
const AMARELO = cores.amarelo ?? '#B7791F';

/** Cor do texto do selo de status ao vivo. */
function corStatusFiscal(status: StatusFiscal): string {
  if (status === 'DISPONIVEL') return VERDE;
  if (status === 'INTERVALO') return AMARELO;
  return cores.textoSecundario;
}

/** Cor de fundo do selo de status ao vivo. */
function corFundoStatusFiscal(status: StatusFiscal): string {
  if (status === 'DISPONIVEL') return cores.verdeFundo ?? '#E4F6EC';
  if (status === 'INTERVALO') return cores.amareloFundo ?? '#FBF3DA';
  return cores.superficieAlternativa;
}

export function EscalaScreen(): React.ReactElement {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { podeAcessar } = useAuth();
  const podeVerPerfil = podeAcessar('OPERADORES_AUSENCIAS');
  const podeRegistrar = podeAcessar('OPERADORES_AUSENCIAS');
  const hoje = diaSemanaHoje();
  const [dia, setDia] = useState<number>(hoje);
  // Colaborador com uma marcação em andamento (desabilita seus botões).
  const [enviando, setEnviando] = useState<string | null>(null);
  // Status ao vivo dos fiscais (fiscalId → status), só relevante para hoje.
  const [statusFiscais, setStatusFiscais] = useState<
    Record<string, StatusFiscal>
  >({});
  const conexaoRef = useRef<ConexaoFiscais | null>(null);
  const vendoHoje = dia === hoje;

  const escala = useRequisicao<ItemEscalaConsolidada[]>(
    () => escalaService.consolidada(dia),
    [dia],
  );

  // Carrega o status atual dos fiscais e assina atualizações em tempo real.
  // O painel reflete as batidas do ponto (ponte da Fase 1); o selo de status
  // só é exibido quando o dia selecionado é hoje.
  useEffect(() => {
    let ativo = true;
    fiscaisService
      .painel()
      .then((p) => {
        if (!ativo) return;
        const mapa: Record<string, StatusFiscal> = {};
        for (const f of p) mapa[f.fiscalId] = f.status;
        setStatusFiscais(mapa);
      })
      .catch(() => {
        /* status ao vivo é complementar; ignora falha silenciosamente */
      });

    void conectarPainelFiscais({
      aoAtualizarStatus: (ev) => {
        setStatusFiscais((prev) => ({ ...prev, [ev.fiscalId]: ev.status }));
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
  }, []);

  /** Marca uma falta (ausência) de hoje para o colaborador, com confirmação. */
  const marcarFalta = async (colaboradorId: string, nome: string): Promise<void> => {
    const ok = await confirmar(
      'Marcar falta',
      `Registrar falta de hoje para ${nome}?`,
      'Marcar falta',
    );
    if (!ok) return;
    setEnviando(colaboradorId);
    try {
      await operadoresService.registrarAusencia(colaboradorId, hojeISO());
      notificar('Falta registrada', `Falta de hoje registrada para ${nome}.`);
    } catch (e) {
      notificar(
        'Não foi possível registrar',
        e instanceof ApiError ? e.message : 'Tente novamente.',
      );
    } finally {
      setEnviando(null);
    }
  };

  /** Marca um "não retorno do intervalo" de hoje (sem horário), com confirmação. */
  const marcarSemRetorno = async (
    colaboradorId: string,
    nome: string,
  ): Promise<void> => {
    const ok = await confirmar(
      'Marcar sem retorno',
      `Registrar "não retorno do intervalo" de hoje para ${nome}?`,
      'Marcar',
    );
    if (!ok) return;
    setEnviando(colaboradorId);
    try {
      await escalaService.registrarIncidencia({
        colaboradorId,
        tipo: 'NAO_RETORNO_INTERVALO',
        data: hojeISO(),
      });
      notificar('Registrado', `"Sem retorno" de hoje registrado para ${nome}.`);
    } catch (e) {
      notificar(
        'Não foi possível registrar',
        e instanceof ApiError ? e.message : 'Tente novamente.',
      );
    } finally {
      setEnviando(null);
    }
  };

  return (
    <Tela aoAtualizar={escala.recarregar} atualizando={escala.atualizando}>
      <View style={styles.dias}>
        {DIAS_SEMANA_CURTO.map((rotulo, idx) => {
          const ativo = idx === dia;
          return (
            <Text
              key={rotulo}
              onPress={() => setDia(idx)}
              style={[styles.dia, ativo && styles.diaAtivo]}
            >
              {rotulo}
            </Text>
          );
        })}
      </View>

      <Text style={styles.titulo}>{DIAS_SEMANA[dia]}</Text>

      {escala.carregando ? (
        <Carregando />
      ) : escala.erro ? (
        <MensagemErro mensagem={escala.erro} aoTentarNovamente={escala.recarregar} />
      ) : !escala.dados || escala.dados.length === 0 ? (
        <EstadoVazio
          icone="calendar-outline"
          titulo="Sem escala"
          descricao="Nenhuma escala cadastrada para este dia."
        />
      ) : (
        escala.dados.map((item) => {
          const efetiva = item.efetiva;
          const folga = efetiva === 'FOLGA';
          const navegavel = podeVerPerfil && !!item.colaboradorId;
          const podeMarcar = podeRegistrar && !!item.colaboradorId;
          const nome = item.nome ?? item.funcionarioId;
          const ocupado = enviando === item.colaboradorId;
          return (
            <Cartao key={item.funcionarioId}>
              <Pressable
                disabled={!navegavel}
                onPress={() =>
                  item.colaboradorId &&
                  navigation.navigate('PerfilColaborador', {
                    colaboradorId: item.colaboradorId,
                  })
                }
                style={({ pressed }) => (pressed && navegavel ? { opacity: 0.6 } : null)}
              >
                <View style={styles.linhaCabecalho}>
                  <Text style={styles.func} numberOfLines={1}>
                    {nome}
                  </Text>
                  <View style={styles.direita}>
                    {/* Status ao vivo do fiscal (só hoje, e só se houver). */}
                    {vendoHoje && statusFiscais[item.funcionarioId] ? (
                      <Selo
                        texto={ROTULO_STATUS_FISCAL[statusFiscais[item.funcionarioId]]}
                        cor={corStatusFiscal(statusFiscais[item.funcionarioId])}
                        fundo={corFundoStatusFiscal(statusFiscais[item.funcionarioId])}
                      />
                    ) : null}
                    {folga ? (
                      <Selo texto="Folga" cor={cores.textoSecundario} fundo={cores.superficieAlternativa} />
                    ) : efetiva.especial ? (
                      <Selo texto="Especial" cor={cores.primaria} fundo={cores.primariaClara} />
                    ) : null}
                    {navegavel && (
                      <Ionicons name="chevron-forward" size={16} color={cores.textoSecundario} />
                    )}
                  </View>
                </View>
                {item.matricula ? (
                  <Text style={styles.matricula}>Matrícula {item.matricula}</Text>
                ) : null}
                {efetiva !== 'FOLGA' ? (
                  <Text style={styles.horario}>
                    {efetiva.entrada ?? '--'} às {efetiva.saida ?? '--'} ·
                    intervalo {efetiva.intervaloMin} min
                  </Text>
                ) : null}
              </Pressable>

              {podeMarcar ? (
                <View style={styles.acoes}>
                  <Pressable
                    disabled={ocupado}
                    onPress={() =>
                      void marcarFalta(item.colaboradorId as string, nome)
                    }
                    style={({ pressed }) => [
                      styles.botao,
                      styles.botaoFalta,
                      (pressed || ocupado) && styles.pressionado,
                    ]}
                  >
                    <Ionicons name="close-circle-outline" size={16} color={cores.vermelho} />
                    <Text style={[styles.botaoTexto, { color: cores.vermelho }]}>
                      Falta
                    </Text>
                  </Pressable>
                  <Pressable
                    disabled={ocupado}
                    onPress={() =>
                      void marcarSemRetorno(item.colaboradorId as string, nome)
                    }
                    style={({ pressed }) => [
                      styles.botao,
                      styles.botaoSemRetorno,
                      (pressed || ocupado) && styles.pressionado,
                    ]}
                  >
                    <Ionicons name="time-outline" size={16} color={cores.primaria} />
                    <Text style={[styles.botaoTexto, { color: cores.primaria }]}>
                      Sem retorno
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </Cartao>
          );
        })
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  dias: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: espacamento.md,
  },
  dia: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    paddingVertical: espacamento.sm,
    paddingHorizontal: espacamento.sm,
    borderRadius: raio.sm,
    overflow: 'hidden',
    textAlign: 'center',
    minWidth: 42,
  },
  diaAtivo: {
    backgroundColor: cores.primaria,
    color: cores.textoInverso,
  },
  titulo: {
    ...tipografia.secao,
    color: cores.texto,
    marginBottom: espacamento.md,
  },
  linhaCabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  direita: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
  },
  matricula: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  func: {
    ...tipografia.corpo,
    fontWeight: '600',
    color: cores.texto,
    flex: 1,
    paddingRight: espacamento.sm,
  },
  horario: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.xs,
  },
  // Ações rápidas por colaborador (Falta / Sem retorno).
  acoes: {
    flexDirection: 'row',
    gap: espacamento.sm,
    marginTop: espacamento.sm,
    paddingTop: espacamento.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
  },
  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    paddingVertical: espacamento.xs,
    paddingHorizontal: espacamento.md,
    borderRadius: raio.sm,
    borderWidth: 1,
  },
  botaoFalta: {
    borderColor: cores.vermelho,
    backgroundColor: cores.vermelhoFundo,
  },
  botaoSemRetorno: {
    borderColor: cores.primaria,
    backgroundColor: cores.primariaClara,
  },
  botaoTexto: {
    ...tipografia.rotulo,
    fontWeight: '700',
  },
  pressionado: {
    opacity: 0.6,
  },
});

export default EscalaScreen;
