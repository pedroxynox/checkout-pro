/**
 * Área de Fiscais — controle de jornada em tempo real.
 *
 * - O fiscal logado é identificado automaticamente: marca Disponível ao entrar,
 *   Intervalo ao pausar, e Fora de expediente ao encerrar. Vê apenas as SUAS
 *   horas (trabalhando, intervalo e carga do dia) e pode informar falta.
 * - Painel: todos os fiscais com o primeiro nome e o status, atualizado em
 *   tempo real por WebSocket (sem recarregar).
 * - Gestores têm acesso ao log de jornada de toda a equipe (outra tela).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../api/client';
import { fiscaisService } from '../../api/services';
import { ConexaoFiscais, conectarPainelFiscais } from '../../api/socket';
import {
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

const ACOES: {
  status: StatusFiscal;
  rotulo: string;
  icone: keyof typeof Ionicons.glyphMap;
}[] = [
  { status: 'DISPONIVEL', rotulo: 'Disponível', icone: 'checkmark-circle' },
  { status: 'INTERVALO', rotulo: 'Intervalo', icone: 'cafe' },
  { status: 'FORA_EXPEDIENTE', rotulo: 'Encerrar', icone: 'exit-outline' },
];

function corStatus(status: StatusFiscal): string {
  if (status === 'DISPONIVEL') return VERDE;
  if (status === 'INTERVALO') return AMARELO;
  return cores.textoSecundario;
}

export function FiscaisScreen({
  navigation,
}: PropsTela<'Fiscais'>): React.ReactElement {
  const { podeAcessar } = useAuth();
  const [painel, setPainel] = useState<ItemPainelFiscal[]>([]);
  const [meu, setMeu] = useState<MeuResumoFiscal | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [enviando, setEnviando] = useState<StatusFiscal | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const conexaoRef = useRef<ConexaoFiscais | null>(null);

  const carregar = useCallback(async () => {
    const [p, m] = await Promise.all([
      fiscaisService.painel(),
      fiscaisService.meuResumo().catch(() => null),
    ]);
    setPainel(p);
    setMeu(m);
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
        setPainel((lista) =>
          lista.map((p) =>
            p.fiscalId === ev.fiscalId
              ? { ...p, status: ev.status, desde: ev.em }
              : p,
          ),
        );
        setMeu((m) =>
          m && m.fiscalId === ev.fiscalId ? { ...m, status: ev.status } : m,
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

  const definir = async (status: StatusFiscal) => {
    if (enviando) return;
    setEnviando(status);
    try {
      const r = await fiscaisService.definirStatus(status);
      setMeu((prev) => (prev ? { ...prev, ...r } : prev));
      setPainel((lista) =>
        lista.map((p) =>
          p.fiscalId === r.fiscalId
            ? { ...p, status: r.status, desde: r.em }
            : p,
        ),
      );
    } catch (e) {
      notificar(
        'Erro',
        e instanceof ApiError ? e.message : 'Não foi possível atualizar.',
      );
    } finally {
      setEnviando(null);
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

      {/* Minha jornada (só para fiscais) */}
      {meu && (
        <Cartao>
          <View style={styles.linhaTopo}>
            <Text style={styles.titulo}>Minha jornada</Text>
            <View style={[styles.badge, { backgroundColor: corStatus(meu.status) }]}>
              <Text style={styles.badgeTexto}>
                {ROTULO_STATUS_FISCAL[meu.status]}
              </Text>
            </View>
          </View>

          <View style={styles.acoes}>
            {ACOES.map((a) => {
              const ativo = meu.status === a.status;
              return (
                <Pressable
                  key={a.status}
                  onPress={() => void definir(a.status)}
                  disabled={enviando !== null}
                  style={[styles.botaoAcao, ativo && styles.botaoAcaoAtivo]}
                >
                  {enviando === a.status ? (
                    <ActivityIndicator color={ativo ? cores.textoInverso : cores.primaria} />
                  ) : (
                    <>
                      <Ionicons
                        name={a.icone}
                        size={22}
                        color={ativo ? cores.textoInverso : cores.primaria}
                      />
                      <Text
                        style={[styles.botaoAcaoTexto, ativo && styles.botaoAcaoTextoAtivo]}
                      >
                        {a.rotulo}
                      </Text>
                    </>
                  )}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.tempos}>
            <Tempo rotulo="Trabalhando" valor={formatarDuracao(meu.tempoTrabalhandoMs)} />
            <Tempo rotulo="Intervalo" valor={formatarDuracao(meu.tempoIntervaloMs)} />
            <Tempo rotulo="Carga do dia" valor={formatarDuracao(meu.cargaHorariaMs)} />
          </View>

          <Pressable onPress={() => void informarFalta()} style={styles.linkFalta}>
            <Ionicons name="alert-circle-outline" size={18} color={cores.primaria} />
            <Text style={styles.linkFaltaTexto}>Informar falta de hoje</Text>
          </Pressable>
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

      {/* Painel de todos os fiscais (tempo real) */}
      <Text style={styles.secao}>Fiscais</Text>
      {painel.map((f) => (
        <View key={f.fiscalId} style={styles.itemPainel}>
          <View style={[styles.pontinho, { backgroundColor: corStatus(f.status) }]} />
          <Text style={styles.nome}>{f.primeiroNome}</Text>
          <Text style={[styles.statusTexto, { color: corStatus(f.status) }]}>
            {ROTULO_STATUS_FISCAL[f.status]}
          </Text>
        </View>
      ))}
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
  acoes: {
    flexDirection: 'row',
    gap: espacamento.sm,
    marginTop: espacamento.md,
  },
  botaoAcao: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: espacamento.md,
    borderRadius: raio.md,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.fundo,
    minHeight: 64,
  },
  botaoAcaoAtivo: {
    backgroundColor: cores.primaria,
    borderColor: cores.primaria,
  },
  botaoAcaoTexto: {
    ...tipografia.legenda,
    color: cores.primaria,
    fontWeight: '700',
  },
  botaoAcaoTextoAtivo: {
    color: cores.textoInverso,
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
  secao: {
    ...tipografia.secao,
    color: cores.texto,
    marginTop: espacamento.xl,
    marginBottom: espacamento.sm,
  },
  itemPainel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    backgroundColor: cores.superficie,
    borderRadius: raio.md,
    paddingHorizontal: espacamento.lg,
    paddingVertical: espacamento.md,
    marginBottom: espacamento.sm,
  },
  pontinho: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  nome: {
    ...tipografia.rotulo,
    color: cores.texto,
    flex: 1,
  },
  statusTexto: {
    ...tipografia.legenda,
    fontWeight: '700',
  },
});

export default FiscaisScreen;
