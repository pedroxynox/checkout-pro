/**
 * Modal de registro/edição/exclusão de uma incidência de escala
 * (Fase 2 — evento "não retornou do intervalo").
 *
 * Reutilizado tanto para CRIAR (com `valoresIniciais` opcionais, ex.: a partir
 * de uma sugestão auto-detectada do ponto) quanto para EDITAR (recebendo
 * `incidenciaExistente`). O tipo é fixo em `NAO_RETORNO_INTERVALO` — o backend
 * é genérico, mas a UI expõe apenas este evento por enquanto (sem seletor de
 * tipo). Erros da API são exibidos inline, no padrão do app.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { escalaService } from '../../api/services';
import {
  IncidenciaEscala,
  OrigemIncidencia,
  RegistrarIncidenciaInput,
} from '../../api/types';
import { Botao, CampoTexto } from '../../components';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { formatarData, hojeISO } from '../../utils/formato';

/** Horário "HH:mm" (00:00–23:59) — espelha a validação do backend. */
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Valores de pré-preenchimento ao criar (ex.: vindos de uma sugestão). */
export interface ValoresIniciaisIncidencia {
  data?: string;
  horaSaida?: string;
  horaEsperadaRetorno?: string;
  horaReal?: string;
  origem?: OrigemIncidencia;
}

interface RegistrarIncidenciaModalProps {
  visivel: boolean;
  aoFechar: () => void;
  /** Chamado após salvar/excluir com sucesso (para recarregar a lista). */
  aoSalvar: () => void;
  colaboradorId: string;
  /** Quando presente, o modal entra em modo de EDIÇÃO. */
  incidenciaExistente?: IncidenciaEscala | null;
  /** Pré-preenchimento no modo de CRIAÇÃO. */
  valoresIniciais?: ValoresIniciaisIncidencia;
  /** Libera o botão "Excluir" no modo de edição. */
  podeExcluir?: boolean;
}

/** Aplica uma máscara simples "HH:mm" à medida que o usuário digita. */
function mascararHora(valor: string): string {
  const digitos = valor.replace(/\D/g, '').slice(0, 4);
  if (digitos.length <= 2) return digitos;
  return `${digitos.slice(0, 2)}:${digitos.slice(2)}`;
}

/** Valida um horário opcional: vazio é válido; senão precisa casar HH:mm. */
function horaValida(valor: string): boolean {
  return valor.trim() === '' || HHMM_RE.test(valor.trim());
}

export function RegistrarIncidenciaModal({
  visivel,
  aoFechar,
  aoSalvar,
  colaboradorId,
  incidenciaExistente,
  valoresIniciais,
  podeExcluir = false,
}: RegistrarIncidenciaModalProps): React.ReactElement {
  const edicao = !!incidenciaExistente;

  const [data, setData] = useState<string>(hojeISO());
  const [horaSaida, setHoraSaida] = useState('');
  const [horaEsperadaRetorno, setHoraEsperadaRetorno] = useState('');
  const [horaReal, setHoraReal] = useState('');
  const [motivo, setMotivo] = useState('');
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erroCampo, setErroCampo] = useState<string | null>(null);

  // Sincroniza os campos ao abrir (ou ao trocar a incidência/pré-preenchimento).
  useEffect(() => {
    if (!visivel) return;
    setErro(null);
    setErroCampo(null);
    if (incidenciaExistente) {
      setData(incidenciaExistente.data.slice(0, 10));
      setHoraSaida(incidenciaExistente.horaSaida ?? '');
      setHoraEsperadaRetorno(incidenciaExistente.horaEsperadaRetorno ?? '');
      setHoraReal(incidenciaExistente.horaReal ?? '');
      setMotivo(incidenciaExistente.motivo ?? '');
      setObservacao(incidenciaExistente.observacao ?? '');
    } else {
      setData(valoresIniciais?.data ?? hojeISO());
      setHoraSaida(valoresIniciais?.horaSaida ?? '');
      setHoraEsperadaRetorno(valoresIniciais?.horaEsperadaRetorno ?? '');
      setHoraReal(valoresIniciais?.horaReal ?? '');
      setMotivo('');
      setObservacao('');
    }
  }, [visivel, incidenciaExistente, valoresIniciais]);

  const ocupado = salvando || excluindo;

  const salvar = async (): Promise<void> => {
    setErro(null);
    // Validação dos horários informados (todos opcionais).
    if (
      !horaValida(horaSaida) ||
      !horaValida(horaEsperadaRetorno) ||
      !horaValida(horaReal)
    ) {
      setErroCampo('Use o formato HH:mm (00:00–23:59).');
      return;
    }
    setErroCampo(null);
    setSalvando(true);
    try {
      const limpo = (v: string): string | undefined =>
        v.trim() === '' ? undefined : v.trim();
      if (edicao && incidenciaExistente) {
        await escalaService.editarIncidencia(incidenciaExistente.id, {
          horaSaida: limpo(horaSaida),
          horaEsperadaRetorno: limpo(horaEsperadaRetorno),
          horaReal: limpo(horaReal),
          motivo: limpo(motivo),
          observacao: limpo(observacao),
        });
      } else {
        const dto: RegistrarIncidenciaInput = {
          colaboradorId,
          tipo: 'NAO_RETORNO_INTERVALO',
          data,
          horaSaida: limpo(horaSaida),
          horaEsperadaRetorno: limpo(horaEsperadaRetorno),
          horaReal: limpo(horaReal),
          motivo: limpo(motivo),
          observacao: limpo(observacao),
        };
        await escalaService.registrarIncidencia(dto);
      }
      aoSalvar();
      aoFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (): Promise<void> => {
    if (!incidenciaExistente) return;
    setErro(null);
    setExcluindo(true);
    try {
      await escalaService.removerIncidencia(incidenciaExistente.id);
      aoSalvar();
      aoFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível excluir.');
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <Modal
      visible={visivel}
      animationType="slide"
      transparent
      onRequestClose={aoFechar}
    >
      <KeyboardAvoidingView
        style={styles.fundo}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.folha}>
          <View style={styles.topo}>
            <Text style={styles.titulo}>
              {edicao ? 'Editar incidência' : 'Registrar não retorno'}
            </Text>
            <Pressable onPress={aoFechar} hitSlop={12} accessibilityLabel="Fechar">
              <Ionicons name="close" size={24} color={cores.texto} />
            </Pressable>
          </View>

          <Text style={styles.subtitulo}>Não retorno do intervalo</Text>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.linhaData}>
              <Text style={styles.dataRotulo}>Data</Text>
              <Text style={styles.dataValor}>{formatarData(data)}</Text>
            </View>

            <View style={styles.linhaCampos}>
              <CampoTexto
                rotulo="Saída"
                value={horaSaida}
                onChangeText={(v) => setHoraSaida(mascararHora(v))}
                placeholder="HH:mm"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                containerStyle={styles.campoMeio}
              />
              <CampoTexto
                rotulo="Esperado"
                value={horaEsperadaRetorno}
                onChangeText={(v) => setHoraEsperadaRetorno(mascararHora(v))}
                placeholder="HH:mm"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                containerStyle={styles.campoMeio}
              />
              <CampoTexto
                rotulo="Retorno real"
                value={horaReal}
                onChangeText={(v) => setHoraReal(mascararHora(v))}
                placeholder="HH:mm"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                containerStyle={styles.campoMeio}
              />
            </View>
            {erroCampo ? <Text style={styles.erroCampo}>{erroCampo}</Text> : null}

            <CampoTexto
              rotulo="Motivo"
              value={motivo}
              onChangeText={setMotivo}
              placeholder="Motivo (opcional)"
            />
            <CampoTexto
              rotulo="Observação"
              value={observacao}
              onChangeText={setObservacao}
              placeholder="Observação (opcional)"
              multiline
              numberOfLines={3}
              style={styles.multiline}
            />

            {erro ? (
              <View style={styles.erroBox}>
                <Ionicons
                  name="alert-circle-outline"
                  size={18}
                  color={cores.erro}
                />
                <Text style={styles.erroTexto}>{erro}</Text>
              </View>
            ) : null}

            <Botao
              titulo={edicao ? 'Salvar alterações' : 'Salvar'}
              aoPressionar={() => void salvar()}
              carregando={salvando}
              desabilitado={ocupado}
              estilo={styles.acao}
            />
            {edicao && podeExcluir ? (
              <Botao
                titulo="Excluir"
                variante="perigo"
                aoPressionar={() => void excluir()}
                carregando={excluindo}
                desabilitado={ocupado}
                estilo={styles.acao}
              />
            ) : null}
            <Botao
              titulo="Cancelar"
              variante="texto"
              aoPressionar={aoFechar}
              desabilitado={ocupado}
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fundo: {
    flex: 1,
    backgroundColor: 'rgba(10, 37, 64, 0.45)',
    justifyContent: 'flex-end',
  },
  folha: {
    backgroundColor: cores.fundo,
    borderTopLeftRadius: raio.lg,
    borderTopRightRadius: raio.lg,
    paddingHorizontal: espacamento.lg,
    paddingTop: espacamento.lg,
    paddingBottom: espacamento.xl,
    maxHeight: '88%',
  },
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titulo: {
    ...tipografia.subtitulo,
    color: cores.texto,
  },
  subtitulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.md,
  },
  linhaData: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: espacamento.sm,
    marginBottom: espacamento.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  dataRotulo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
  },
  dataValor: {
    ...tipografia.corpo,
    color: cores.texto,
    fontWeight: '600',
  },
  linhaCampos: {
    flexDirection: 'row',
    gap: espacamento.sm,
  },
  campoMeio: {
    flex: 1,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: espacamento.sm,
  },
  erroCampo: {
    ...tipografia.legenda,
    color: cores.erro,
    marginBottom: espacamento.sm,
  },
  erroBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    backgroundColor: cores.vermelhoFundo,
    borderRadius: raio.md,
    padding: espacamento.md,
    marginBottom: espacamento.md,
  },
  erroTexto: {
    ...tipografia.legenda,
    color: cores.erro,
    flex: 1,
  },
  acao: {
    marginBottom: espacamento.sm,
  },
});

export default RegistrarIncidenciaModal;
