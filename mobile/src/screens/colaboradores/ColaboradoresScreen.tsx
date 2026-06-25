/**
 * Seção "Colaboradores" (somente leitura).
 *
 * Lista todos os colaboradores (busca por nome/matrícula). Tocar num item abre
 * o PERFIL do colaborador. O cadastro/edição NÃO acontece aqui — fica no
 * "Centro de Controle ▸ Colaboradores" (apenas gestor).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colaboradoresService } from '../../api/services';
import { Colaborador, FuncaoColaborador, TurnoColaborador } from '../../api/types';
import {
  Carregando,
  CampoTexto,
  EstadoVazio,
  MensagemErro,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { PropsTela } from '../../navigation/types';
import { cores, espacamento, raio, tipografia } from '../../theme';

const FUNCOES: Record<FuncaoColaborador, string> = {
  OPERADOR: 'Operador',
  FISCAL: 'Fiscal',
  SUPERVISOR: 'Supervisor',
  GESTOR: 'Gestor',
};

const TURNOS: Record<TurnoColaborador, string> = {
  ABERTURA: 'Abertura',
  INTERMEDIARIO: 'Intermediário',
  FECHAMENTO: 'Fechamento',
  APOIO: 'Apoio',
};

function rotuloTurno(t: TurnoColaborador | null): string {
  return t ? TURNOS[t] : '—';
}

export function ColaboradoresScreen({
  navigation,
}: PropsTela<'Colaboradores'>): React.ReactElement {
  const lista = useRequisicao<Colaborador[]>(
    () => colaboradoresService.listar(),
    [],
  );
  const [busca, setBusca] = useState('');

  const filtrados = useMemo(() => {
    const dados = lista.dados ?? [];
    const b = busca.trim().toLowerCase();
    if (!b) return dados;
    return dados.filter(
      (c) =>
        c.nome.toLowerCase().includes(b) ||
        c.matricula.toLowerCase().includes(b),
    );
  }, [lista.dados, busca]);

  return (
    <Tela aoAtualizar={lista.recarregar} atualizando={lista.atualizando}>
      <CampoTexto
        rotulo="Buscar"
        value={busca}
        onChangeText={setBusca}
        placeholder="Nome ou matrícula"
      />

      {lista.carregando ? (
        <Carregando />
      ) : lista.erro ? (
        <MensagemErro mensagem={lista.erro} aoTentarNovamente={lista.recarregar} />
      ) : filtrados.length === 0 ? (
        <EstadoVazio
          icone="people-outline"
          titulo="Sem colaboradores"
          descricao="Os colaboradores cadastrados aparecerão aqui."
        />
      ) : (
        filtrados.map((c) => (
          <TouchableOpacity
            key={c.id}
            activeOpacity={0.7}
            onPress={() =>
              navigation.navigate('PerfilColaborador', { colaboradorId: c.id })
            }
            style={[styles.item, !c.ativo && styles.itemInativo]}
          >
            <View style={[styles.avatar, { backgroundColor: cores.primariaClara }]}>
              <Ionicons
                name={c.genero === 'M' ? 'man' : 'woman'}
                size={20}
                color={cores.primaria}
              />
            </View>
            <View style={styles.itemInfo}>
              <Text style={styles.itemNome} numberOfLines={1}>
                {c.nome}
                {!c.ativo ? ' (inativo)' : ''}
              </Text>
              <Text style={styles.itemMeta} numberOfLines={1}>
                Mat. {c.matricula} · {FUNCOES[c.funcao]} · {rotuloTurno(c.turno)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={cores.textoSecundario} />
          </TouchableOpacity>
        ))
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: cores.superficie,
    borderRadius: raio.md,
    padding: espacamento.sm,
    marginBottom: espacamento.xs,
    borderWidth: 1,
    borderColor: cores.divisor,
  },
  itemInativo: { opacity: 0.55 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: { flex: 1, paddingHorizontal: espacamento.sm },
  itemNome: { ...tipografia.corpo, fontWeight: '600', color: cores.texto },
  itemMeta: { ...tipografia.legenda, color: cores.textoSecundario, marginTop: 1 },
});

export default ColaboradoresScreen;
