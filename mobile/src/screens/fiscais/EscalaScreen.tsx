/**
 * Tela de Escala (Req 4.3.6).
 *
 * Exibe a escala consolidada por dia da semana: para cada funcionário, mostra a
 * escala efetiva (horário de entrada/saída, intervalo e se é especial) ou
 * "Folga". O dia da semana é selecionável.
 *
 * Para quem gere ausências (`OPERADORES_AUSENCIAS`), a tela também traz as
 * incidências de "não retorno do intervalo" (Fase 2): um cartão com as
 * sugestões auto-detectadas do ponto de hoje e uma ação por colaborador para
 * registrar a incidência (modal de registro/edição).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { escalaService } from '../../api/services';
import { useAuth } from '../../auth/AuthContext';
import { ItemEscalaConsolidada, SugestaoIncidencia } from '../../api/types';
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
import {
  DIAS_SEMANA,
  DIAS_SEMANA_CURTO,
  diaSemanaHoje,
  hojeISO,
} from '../../utils/formato';
import {
  RegistrarIncidenciaModal,
  ValoresIniciaisIncidencia,
} from './RegistrarIncidenciaModal';

/** Alvo do modal de registro: quem e com quais valores pré-preenchidos. */
interface AlvoRegistro {
  colaboradorId: string;
  nome: string;
  valoresIniciais?: ValoresIniciaisIncidencia;
  /** Permite escolher o tipo (lançamento manual); falso no fluxo de sugestão. */
  permitirEscolherTipo?: boolean;
}

export function EscalaScreen(): React.ReactElement {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { podeAcessar } = useAuth();
  const podeVerPerfil = podeAcessar('OPERADORES_AUSENCIAS');
  const podeRegistrar = podeAcessar('OPERADORES_AUSENCIAS');
  const hoje = diaSemanaHoje();
  const [dia, setDia] = useState<number>(hoje);
  const [alvo, setAlvo] = useState<AlvoRegistro | null>(null);
  const [modalVisivel, setModalVisivel] = useState(false);

  const escala = useRequisicao<ItemEscalaConsolidada[]>(
    () => escalaService.consolidada(dia),
    [dia],
  );

  // Sugestões auto-detectadas do ponto de hoje (só para quem gere ausências).
  // Quando não há permissão, evitamos a chamada resolvendo uma lista vazia.
  const sugestoes = useRequisicao<SugestaoIncidencia[]>(
    () =>
      podeRegistrar
        ? escalaService.sugestoesIncidencias(hojeISO())
        : Promise.resolve<SugestaoIncidencia[]>([]),
    [podeRegistrar],
  );

  const abrirRegistro = (novoAlvo: AlvoRegistro): void => {
    setAlvo(novoAlvo);
    setModalVisivel(true);
  };

  return (
    <Tela aoAtualizar={escala.recarregar} atualizando={escala.atualizando}>
      {podeRegistrar ? (
        <Cartao titulo="Não retorno do intervalo — hoje">
          {sugestoes.carregando ? (
            <Carregando texto="Detectando..." />
          ) : sugestoes.erro ? (
            <MensagemErro
              mensagem={sugestoes.erro}
              aoTentarNovamente={sugestoes.recarregar}
            />
          ) : !sugestoes.dados || sugestoes.dados.length === 0 ? (
            <Text style={styles.vazioInline}>
              Nenhum não retorno detectado hoje.
            </Text>
          ) : (
            sugestoes.dados.map((s) => (
              <View key={s.colaboradorId} style={styles.sugestaoLinha}>
                <View style={styles.sugestaoTextos}>
                  <Text style={styles.sugestaoNome} numberOfLines={1}>
                    {s.nome}
                  </Text>
                  <Text style={styles.sugestaoDetalhe}>
                    saiu {s.horaSaida ?? '--'} · esperado{' '}
                    {s.horaEsperadaRetorno ?? '--'}
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    abrirRegistro({
                      colaboradorId: s.colaboradorId,
                      nome: s.nome,
                      valoresIniciais: {
                        data: hojeISO(),
                        horaSaida: s.horaSaida,
                        horaEsperadaRetorno: s.horaEsperadaRetorno,
                        origem: 'DETECTADO_PONTO',
                      },
                    })
                  }
                  style={({ pressed }) => [
                    styles.botaoRegistrar,
                    pressed && styles.pressionado,
                  ]}
                >
                  <Ionicons
                    name="add-circle-outline"
                    size={16}
                    color={cores.primaria}
                  />
                  <Text style={styles.botaoRegistrarTexto}>Registrar</Text>
                </Pressable>
              </View>
            ))
          )}
        </Cartao>
      ) : null}

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
          return (
            <Pressable
              key={item.funcionarioId}
              disabled={!navegavel}
              onPress={() =>
                item.colaboradorId &&
                navigation.navigate('PerfilColaborador', {
                  colaboradorId: item.colaboradorId,
                })
              }
              style={({ pressed }) => (pressed && navegavel ? { opacity: 0.6 } : null)}
            >
              <Cartao>
                <View style={styles.linhaCabecalho}>
                  <Text style={styles.func} numberOfLines={1}>
                    {item.nome ?? item.funcionarioId}
                  </Text>
                  <View style={styles.direita}>
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
                {podeRegistrar && item.colaboradorId ? (
                  <Pressable
                    onPress={() =>
                      abrirRegistro({
                        colaboradorId: item.colaboradorId as string,
                        nome: item.nome ?? item.funcionarioId,
                        valoresIniciais: { data: hojeISO(), origem: 'MANUAL' },
                        permitirEscolherTipo: true,
                      })
                    }
                    style={({ pressed }) => [
                      styles.acaoCartao,
                      pressed && styles.pressionado,
                    ]}
                  >
                    <Ionicons
                      name="time-outline"
                      size={15}
                      color={cores.primaria}
                    />
                    <Text style={styles.acaoCartaoTexto}>
                      Registrar ocorrência
                    </Text>
                  </Pressable>
                ) : null}
              </Cartao>
            </Pressable>
          );
        })
      )}

      {alvo ? (
        <RegistrarIncidenciaModal
          visivel={modalVisivel}
          aoFechar={() => setModalVisivel(false)}
          aoSalvar={() => sugestoes.recarregar()}
          colaboradorId={alvo.colaboradorId}
          valoresIniciais={alvo.valoresIniciais}
          permitirEscolherTipo={alvo.permitirEscolherTipo}
        />
      ) : null}
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
  // Sugestões auto-detectadas
  vazioInline: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    fontStyle: 'italic',
  },
  sugestaoLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: espacamento.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  sugestaoTextos: {
    flex: 1,
    paddingRight: espacamento.sm,
  },
  sugestaoNome: {
    ...tipografia.corpo,
    color: cores.texto,
    fontWeight: '600',
  },
  sugestaoDetalhe: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  botaoRegistrar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    paddingVertical: espacamento.xs,
    paddingHorizontal: espacamento.sm,
    borderRadius: raio.sm,
    borderWidth: 1,
    borderColor: cores.primaria,
    backgroundColor: cores.primariaClara,
  },
  botaoRegistrarTexto: {
    ...tipografia.rotulo,
    color: cores.primaria,
  },
  acaoCartao: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: espacamento.xs,
    marginTop: espacamento.sm,
    paddingVertical: espacamento.xs,
    paddingHorizontal: espacamento.sm,
    borderRadius: raio.sm,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  acaoCartaoTexto: {
    ...tipografia.legenda,
    color: cores.primaria,
    fontWeight: '600',
  },
  pressionado: {
    opacity: 0.6,
  },
});

export default EscalaScreen;
