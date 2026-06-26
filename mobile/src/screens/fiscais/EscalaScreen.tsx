/**
 * Tela de Escala (Req 4.3.6).
 *
 * Exibe a escala consolidada por dia da semana: para cada funcionário, mostra a
 * escala efetiva (horário de entrada/saída, intervalo e se é especial) ou
 * "Folga". O dia da semana é selecionável.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { escalaService } from '../../api/services';
import { useAuth } from '../../auth/AuthContext';
import { ItemEscalaConsolidada } from '../../api/types';
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
import { DIAS_SEMANA, DIAS_SEMANA_CURTO, diaSemanaHoje } from '../../utils/formato';

export function EscalaScreen(): React.ReactElement {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { podeAcessar } = useAuth();
  const podeVerPerfil = podeAcessar('OPERADORES_AUSENCIAS');
  const hoje = diaSemanaHoje();
  const [dia, setDia] = useState<number>(hoje);

  const escala = useRequisicao<ItemEscalaConsolidada[]>(
    () => escalaService.consolidada(dia),
    [dia],
  );

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
              </Cartao>
            </Pressable>
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
});

export default EscalaScreen;
