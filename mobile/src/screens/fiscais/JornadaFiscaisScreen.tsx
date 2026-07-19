/**
 * Jornada de Equipe do dia (uso gerencial — funcionalidade FISCAIS_JORNADA).
 *
 * Mostra TODOS os colaboradores escalados para trabalhar hoje (fiscais,
 * operadores e supervisores) — inclusive quem ainda NÃO bateu ponto, com as
 * marcações em branco. Cada card traz, em linha: Entrada · Intervalo · Retorno
 * · Saída · Carga (tempo trabalhado em tempo real; o intervalo não conta), e o
 * estado ao lado do nome com cor:
 *   🟢 Trabalhando · 🟡 Intervalo · 🔵 Encerrado · 🔴 Sem registrar/Incompleto ·
 *   ⚫ Falta · ⚪ Aguardando.
 *
 * As faltas e os não-retornos são detectados AUTOMATICAMENTE pelo sistema (não
 * há mais marcação manual na escala): quem não bate ponto até 2h após a entrada
 * vira falta; quem passa de 3h de intervalo vira "não retorno".
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fiscaisService } from '../../api/services';
import { useAuth } from '../../auth/AuthContext';
import { ItemEquipeDiaFiscal, TipoBatida } from '../../api/types';
import {
  Carregando,
  Cartao,
  EstadoVazio,
  MensagemErro,
  SeletorData,
  Tela,
} from '../../components';
import { useConfigSistema } from '../../config/ConfigSistemaContext';
import { useRequisicao } from '../../hooks/useRequisicao';
import { RootStackParamList } from '../../navigation/types';
import {
  formatarCronometro,
  formatarData,
  formatarDuracao,
  hojeISO,
} from '../../utils/formato';
import { cores, espacamento, raio, tipografia } from '../../theme';

const VERDE = cores.sucesso ?? '#1E9E5A';
const AMARELO = cores.amarelo ?? '#C99700';
const CINZA = cores.textoSecundario;
const AZUL = '#2563EB';
const AZUL_FUNDO = '#EFF6FF';

/**
 * Intervalo máximo permitido (3h). Acima disso o backend classifica como TAC e
 * encerra o turno como "não retorno" (regra `INTERVALO_MAXIMO_MS` do ponto). O
 * cronômetro ao vivo fica VERMELHO ao ultrapassar este limite, avisando o gestor
 * de um possível não retorno enquanto o card ainda não virou "Encerrado".
 */
const INTERVALO_MAXIMO_MS = 10_800_000;

/** Rótulo curto do papel (chip ao lado do nome dos não-fiscais). */
const ROTULO_FUNCAO: Record<string, string> = {
  FISCAL: 'Fiscal',
  OPERADOR: 'Operador',
  SUPERVISOR: 'Supervisor',
  GESTOR: 'Gestor',
};

/** Aparência do estado exibido ao lado do nome (cor + fundo + rótulo + ícone). */
interface Aparencia {
  cor: string;
  fundo: string;
  rotulo: string;
  icone: keyof typeof Ionicons.glyphMap;
}

/**
 * Estado visual de um colaborador na equipe do dia, na ordem de prioridade:
 * falta (⚫) > sem registrar/incompleto (🔴) > intervalo (🟡) > encerrado (🔵) >
 * trabalhando (🟢) > aguardando (⚪).
 */
function aparenciaDe(item: ItemEquipeDiaFiscal): Aparencia {
  if (item.falta) {
    return {
      cor: cores.texto,
      fundo: cores.divisor,
      rotulo: 'Falta',
      icone: 'close-circle',
    };
  }
  if (item.alertaAtraso) {
    return {
      cor: cores.vermelho,
      fundo: cores.vermelhoFundo,
      rotulo: 'Sem registrar',
      icone: 'alert-circle',
    };
  }
  if (item.jornadaStatus === 'INCOMPLETO') {
    return {
      cor: cores.vermelho,
      fundo: cores.vermelhoFundo,
      rotulo: 'Incompleto',
      icone: 'alert-circle',
    };
  }
  if (item.jornadaStatus === 'TRABALHANDO') {
    return {
      cor: VERDE,
      fundo: cores.verdeFundo ?? '#E4F6EC',
      rotulo: 'Trabalhando',
      icone: 'checkmark-circle',
    };
  }
  if (item.jornadaStatus === 'EM_INTERVALO') {
    return {
      cor: AMARELO,
      fundo: cores.amareloFundo ?? '#FBF3DA',
      rotulo: 'Intervalo',
      icone: 'cafe',
    };
  }
  if (item.jornadaStatus === 'ENCERRADO') {
    return {
      cor: AZUL,
      fundo: AZUL_FUNDO,
      rotulo: 'Encerrado',
      icone: 'flag',
    };
  }
  // SEM_REGISTRO sem falta nem alerta: escalado, ainda dentro da tolerância.
  return {
    cor: CINZA,
    fundo: cores.fundo,
    rotulo: 'Aguardando',
    icone: 'time-outline',
  };
}

/** Ordem e rótulos das marcações exibidas em linha no card. */
const SLOTS: { tipo: TipoBatida; rotulo: string }[] = [
  { tipo: 'ENTRADA', rotulo: 'Entrada' },
  { tipo: 'SAIDA_INTERVALO', rotulo: 'Intervalo' },
  { tipo: 'RETORNO_INTERVALO', rotulo: 'Retorno' },
  { tipo: 'ENCERRAMENTO', rotulo: 'Saída' },
];

/** "HH:mm" a partir do ISO gravado (hora de parede, sem fuso). */
function horaLabel(iso: string): string {
  return iso.slice(11, 16);
}

export function JornadaFiscaisScreen(): React.ReactElement {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { podeAcessar } = useAuth();
  const { dataInicial } = useConfigSistema();
  const podeVerPerfil = podeAcessar('OPERADORES_AUSENCIAS');

  // Dia selecionado (padrão: hoje). Permite ver a equipe de dias anteriores.
  const [data, setData] = React.useState(hojeISO());
  const ehHoje = data === hojeISO();

  const equipe = useRequisicao<ItemEquipeDiaFiscal[]>(
    () => fiscaisService.equipeDia(data),
    [data],
  );

  // Cronômetro AO VIVO do intervalo. O backend devolve `tempoIntervaloMs`
  // calculado "até agora" no instante do carregamento; somando o tempo
  // decorrido desde então (`carregadoEm`) temos o valor atual exato, sem
  // desvio. Recalcula a cada segundo enquanto houver alguém EM_INTERVALO hoje.
  const carregadoEm = React.useRef(Date.now());
  React.useEffect(() => {
    carregadoEm.current = Date.now();
  }, [equipe.dados]);

  const temIntervalo = (equipe.dados ?? []).some(
    (i) => i.jornadaStatus === 'EM_INTERVALO',
  );
  const [, setTique] = React.useState(0);
  React.useEffect(() => {
    if (!ehHoje || !temIntervalo) return;
    const id = setInterval(() => setTique((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [ehHoje, temIntervalo]);

  // Reconsulta periódica (60s) para re-sincronizar a base e capturar transições
  // (retorno do intervalo, encerramento). Só faz sentido para o dia de hoje.
  const recarregarRef = React.useRef(equipe.recarregar);
  recarregarRef.current = equipe.recarregar;
  React.useEffect(() => {
    if (!ehHoje) return;
    const id = setInterval(() => recarregarRef.current(), 60_000);
    return () => clearInterval(id);
  }, [ehHoje]);

  /** Contagem por estado (resumo no topo da lista). */
  const resumo = React.useMemo(() => {
    const r = { trabalhando: 0, intervalo: 0, faltas: 0, semRegistrar: 0 };
    for (const i of equipe.dados ?? []) {
      if (i.falta) r.faltas += 1;
      else if (i.alertaAtraso) r.semRegistrar += 1;
      else if (i.jornadaStatus === 'TRABALHANDO') r.trabalhando += 1;
      else if (i.jornadaStatus === 'EM_INTERVALO') r.intervalo += 1;
    }
    return r;
  }, [equipe.dados]);

  return (
    <Tela aoAtualizar={equipe.recarregar} atualizando={equipe.atualizando}>
      {/* Card com a data selecionada + resumo por estado */}
      <Cartao style={styles.cardData}>
        <View style={styles.dataRow}>
          <View style={styles.dataIcone}>
            <Ionicons name="calendar" size={22} color={cores.primaria} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.dataLabel}>
              Jornada de equipe{ehHoje ? ' · hoje' : ''}
            </Text>
            <Text style={styles.dataTexto}>{formatarData(data)}</Text>
          </View>
        </View>
        <View style={styles.resumoRow}>
          <ResumoChip cor={VERDE} valor={resumo.trabalhando} rotulo="Trabalhando" />
          <ResumoChip cor={AMARELO} valor={resumo.intervalo} rotulo="Intervalo" />
          {ehHoje ? (
            <ResumoChip
              cor={cores.vermelho}
              valor={resumo.semRegistrar}
              rotulo="Sem registrar"
            />
          ) : null}
          <ResumoChip cor={CINZA} valor={resumo.faltas} rotulo="Faltas" />
        </View>
      </Cartao>

      {/* Selector de dia: permite ver a equipe de dias anteriores. */}
      <SeletorData
        valor={data}
        aoMudar={setData}
        rotulo="Dia"
        dataMinima={dataInicial}
      />

      <Text style={styles.secaoTitulo}>Equipe do dia</Text>
      <Text style={styles.secaoDica}>
        {ehHoje
          ? 'Todos os escalados para hoje. Faltas e não-retornos são detectados automaticamente pelo ponto.'
          : 'Todos os escalados para o dia selecionado, com as batidas registradas.'}
      </Text>

      {equipe.carregando ? (
        <Carregando />
      ) : equipe.erro ? (
        <MensagemErro mensagem={equipe.erro} aoTentarNovamente={equipe.recarregar} />
      ) : !equipe.dados || equipe.dados.length === 0 ? (
        <EstadoVazio
          icone="people-outline"
          titulo="Sem escalados"
          descricao={
            ehHoje
              ? 'Ninguém está escalado para trabalhar hoje.'
              : 'Ninguém estava escalado nesse dia.'
          }
        />
      ) : (
        equipe.dados.map((item) => {
          const ap = aparenciaDe(item);
          const navegavel = podeVerPerfil && !!item.colaboradorId;
          return (
            <Pressable
              key={item.pessoaId}
              disabled={!navegavel}
              onPress={() =>
                item.colaboradorId &&
                navigation.navigate('PerfilColaborador', {
                  colaboradorId: item.colaboradorId,
                })
              }
              style={({ pressed }) =>
                pressed && navegavel ? { opacity: 0.6 } : null
              }
            >
              <Cartao style={styles.cartao}>
                <View style={[styles.bordaLateral, { backgroundColor: ap.cor }]} />

                {/* Cabeçalho: ícone + nome + papel + estado */}
                <View style={styles.topo}>
                  <View style={[styles.iconeContainer, { backgroundColor: ap.fundo }]}>
                    <Ionicons name={ap.icone} size={18} color={ap.cor} />
                  </View>
                  <Text style={styles.nome} numberOfLines={1}>
                    {item.primeiroNome}
                  </Text>
                  {item.tipoPessoa === 'OPERADOR' ? (
                    <Text style={styles.papelTag}>
                      {ROTULO_FUNCAO[item.funcao] ?? 'Colaborador'}
                    </Text>
                  ) : null}
                  <View style={[styles.badgeStatus, { backgroundColor: ap.fundo }]}>
                    <View style={[styles.pontinho, { backgroundColor: ap.cor }]} />
                    <Text style={[styles.statusTexto, { color: ap.cor }]}>
                      {ap.rotulo}
                    </Text>
                  </View>
                </View>

                {/* Entrada prevista (quando definida) */}
                {item.entradaPrevista ? (
                  <Text style={styles.entradaPrevista}>
                    Entrada prevista: {item.entradaPrevista}
                  </Text>
                ) : null}

                {/* Intervalo em curso AO VIVO (corre a cada segundo, só hoje).
                    Fica VERMELHO ao ultrapassar o máximo de 3h (possível não
                    retorno), antes mesmo do card virar "Encerrado". */}
                {item.jornadaStatus === 'EM_INTERVALO'
                  ? (() => {
                      const msIntervalo =
                        item.tempoIntervaloMs +
                        (ehHoje ? Date.now() - carregadoEm.current : 0);
                      const excedido = msIntervalo >= INTERVALO_MAXIMO_MS;
                      return (
                        <View
                          style={[
                            styles.intervaloVivo,
                            excedido && styles.intervaloVivoExcedido,
                          ]}
                        >
                          <Ionicons
                            name={excedido ? 'alert-circle' : 'cafe'}
                            size={14}
                            color={excedido ? cores.vermelho : AMARELO}
                          />
                          <Text
                            style={[
                              styles.intervaloVivoTexto,
                              excedido && styles.intervaloVivoTextoExcedido,
                            ]}
                          >
                            {excedido
                              ? `Intervalo acima do máximo · ${formatarCronometro(msIntervalo)}`
                              : `Em intervalo há ${formatarCronometro(msIntervalo)}`}
                          </Text>
                        </View>
                      );
                    })()
                  : null}

                {/* Marcações do dia + carga (em linha) */}
                <View style={styles.slots}>
                  {SLOTS.map(({ tipo, rotulo }) => {
                    const m = (item.marcacoes ?? []).find((x) => x.tipo === tipo);
                    return (
                      <View key={tipo} style={styles.slot}>
                        <Text style={styles.slotRotulo}>{rotulo}</Text>
                        <Text style={styles.slotHora}>
                          {m ? horaLabel(m.hora) : '—'}
                        </Text>
                      </View>
                    );
                  })}
                  <View style={styles.slot}>
                    <Text style={styles.slotRotulo}>Carga</Text>
                    <Text style={[styles.slotHora, { color: VERDE }]}>
                      {formatarDuracao(item.cargaHorariaMs)}
                    </Text>
                  </View>
                </View>

                {item.jornadaStatus === 'INCOMPLETO' && item.faltando.length > 0 ? (
                  <Text style={styles.incompletoTexto}>
                    Falta registrar: {item.faltando.join(', ')}
                  </Text>
                ) : null}
              </Cartao>
            </Pressable>
          );
        })
      )}
    </Tela>
  );
}

function ResumoChip({
  cor,
  valor,
  rotulo,
}: {
  cor: string;
  valor: number;
  rotulo: string;
}): React.ReactElement {
  return (
    <View style={styles.resumoChip}>
      <Text style={[styles.resumoValor, { color: cor }]}>{valor}</Text>
      <Text style={styles.resumoRotulo}>{rotulo}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cardData: { marginBottom: 0 },
  dataRow: { flexDirection: 'row', alignItems: 'center', gap: espacamento.md },
  dataIcone: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: cores.primariaClara,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dataLabel: { ...tipografia.legenda, color: cores.textoSecundario },
  dataTexto: { ...tipografia.rotulo, color: cores.texto, marginTop: 2 },
  resumoRow: {
    flexDirection: 'row',
    gap: espacamento.xs,
    marginTop: espacamento.md,
  },
  resumoChip: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: cores.fundo,
    borderRadius: raio.md,
    paddingVertical: espacamento.sm,
  },
  resumoValor: { ...tipografia.subtitulo, fontWeight: '700' },
  resumoRotulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
    textAlign: 'center',
  },
  secaoTitulo: {
    ...tipografia.secao,
    color: cores.texto,
    marginTop: espacamento.lg,
    marginBottom: espacamento.xs,
  },
  secaoDica: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    fontStyle: 'italic',
    marginBottom: espacamento.sm,
  },
  cartao: { overflow: 'hidden', position: 'relative' },
  bordaLateral: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: raio.lg,
    borderBottomLeftRadius: raio.lg,
  },
  topo: { flexDirection: 'row', alignItems: 'center', gap: espacamento.sm },
  iconeContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nome: { ...tipografia.rotulo, color: cores.texto, flex: 1 },
  papelTag: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    backgroundColor: cores.fundo,
    paddingHorizontal: espacamento.sm,
    paddingVertical: 2,
    borderRadius: raio.pill,
    overflow: 'hidden',
  },
  badgeStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    paddingHorizontal: espacamento.sm,
    paddingVertical: 4,
    borderRadius: raio.pill,
  },
  pontinho: { width: 8, height: 8, borderRadius: 4 },
  statusTexto: { ...tipografia.legenda, fontWeight: '700' },
  entradaPrevista: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
  },
  intervaloVivo: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: espacamento.sm,
    backgroundColor: cores.amareloFundo,
    borderRadius: raio.md,
    paddingVertical: espacamento.xs,
    paddingHorizontal: espacamento.sm,
  },
  intervaloVivoExcedido: {
    backgroundColor: cores.vermelhoFundo,
  },
  intervaloVivoTexto: {
    ...tipografia.legenda,
    color: AMARELO,
    fontWeight: '700',
    marginLeft: espacamento.xs,
  },
  intervaloVivoTextoExcedido: {
    color: cores.vermelho,
  },
  slots: {
    flexDirection: 'row',
    marginTop: espacamento.sm,
    backgroundColor: cores.fundo,
    borderRadius: raio.md,
    paddingVertical: espacamento.sm,
  },
  slot: { flex: 1, alignItems: 'center' },
  slotRotulo: { ...tipografia.legenda, color: cores.textoSecundario },
  slotHora: {
    ...tipografia.rotulo,
    fontWeight: '700',
    color: cores.texto,
    marginTop: 2,
  },
  incompletoTexto: {
    ...tipografia.legenda,
    color: cores.vermelho,
    fontWeight: '600',
    marginTop: espacamento.sm,
  },
});

export default JornadaFiscaisScreen;
