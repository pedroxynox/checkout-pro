/**
 * Perfil do colaborador (somente leitura).
 *
 * Mostra os dados cadastrais (matrícula, função, turno, horários, folga). As
 * estatísticas de movimentos (troco, recargas, cancelamentos, devoluções,
 * faltas) serão ligadas após a vinculação da arrecadação (Fases 2/3 do spec).
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colaboradoresService } from '../../api/services';
import { Colaborador, FuncaoColaborador, TurnoColaborador } from '../../api/types';
import { Carregando, Cartao, MensagemErro, Tela } from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { PropsTela } from '../../navigation/types';
import { cores, espacamento, tipografia } from '../../theme';

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
const NOMES_DIA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function Linha({ rotulo, valor }: { rotulo: string; valor: string }): React.ReactElement {
  return (
    <View style={styles.linha}>
      <Text style={styles.linhaRotulo}>{rotulo}</Text>
      <Text style={styles.linhaValor}>{valor}</Text>
    </View>
  );
}

export function PerfilColaboradorScreen({
  route,
}: PropsTela<'PerfilColaborador'>): React.ReactElement {
  const { colaboradorId } = route.params;
  const req = useRequisicao<Colaborador>(
    () => colaboradoresService.obter(colaboradorId),
    [colaboradorId],
  );
  const c = req.dados;

  return (
    <Tela aoAtualizar={req.recarregar} atualizando={req.atualizando}>
      {req.carregando ? (
        <Carregando />
      ) : req.erro || !c ? (
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
                  name={c.genero === 'M' ? 'man' : 'woman'}
                  size={28}
                  color={cores.primaria}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nome} numberOfLines={1}>
                  {c.nome}
                </Text>
                <Text style={styles.sub}>
                  {FUNCOES[c.funcao]}
                  {c.ativo ? '' : ' · inativo'}
                </Text>
              </View>
            </View>
          </Cartao>

          {/* Dados cadastrais */}
          <Cartao titulo="Dados">
            <Linha rotulo="Matrícula" valor={c.matricula} />
            <Linha rotulo="Função" valor={FUNCOES[c.funcao]} />
            <Linha rotulo="Turno" valor={c.turno ? TURNOS[c.turno] : '—'} />
            <Linha
              rotulo="Seg–Qui"
              valor={
                c.entradaSemana && c.saidaSemana
                  ? `${c.entradaSemana} – ${c.saidaSemana}`
                  : '—'
              }
            />
            <Linha
              rotulo="Sex–Sáb"
              valor={
                c.entradaFds && c.saidaFds
                  ? `${c.entradaFds} – ${c.saidaFds}`
                  : '—'
              }
            />
            <Linha
              rotulo="Folga"
              valor={
                c.folgaDiaSemana != null && c.folgaDiaSemana >= 0
                  ? NOMES_DIA[c.folgaDiaSemana]
                  : '—'
              }
            />
          </Cartao>

          {/* Estatísticas (em breve) */}
          <Cartao titulo="Estatísticas">
            <Text style={styles.emBreve}>
              Em breve: troco solidário, recargas, cancelamentos, cupons,
              devoluções e faltas deste colaborador — assim que a arrecadação for
              vinculada por matrícula/login.
            </Text>
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
  nome: { ...tipografia.titulo, color: cores.texto },
  sub: { ...tipografia.legenda, color: cores.textoSecundario, marginTop: 2 },
  linha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: espacamento.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  linhaRotulo: { ...tipografia.corpo, color: cores.textoSecundario },
  linhaValor: { ...tipografia.corpo, color: cores.texto, fontWeight: '600' },
  emBreve: {
    ...tipografia.corpo,
    color: cores.textoSecundario,
    fontStyle: 'italic',
    lineHeight: 20,
  },
});

export default PerfilColaboradorScreen;
