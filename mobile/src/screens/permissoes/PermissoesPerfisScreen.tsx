/**
 * Central de Permissões — Padrões por perfil (lista).
 *
 * Lista os perfis ajustáveis (Fiscal, Supervisor, Gerente); tocar em um abre o
 * editor do padrão daquele perfil. Alterar um padrão afeta TODOS os usuários do
 * perfil. Uso exclusivo do Administrador (PERMISSOES_GERENCIAR).
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { permissoesService } from '../../api/services';
import {
  Aviso,
  Cartao,
  Carregando,
  MensagemErro,
  Selo,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { PropsTela } from '../../navigation/types';
import { cores, espacamento, tipografia } from '../../theme';

const ROTULO_PERFIL: Record<string, string> = {
  GERENTE: 'Gerente',
  SUPERVISOR: 'Supervisor',
  FISCAL: 'Fiscal',
};

export function PermissoesPerfisScreen({
  navigation,
}: PropsTela<'PermissoesPerfis'>): React.ReactElement {
  const perfis = useRequisicao(() => permissoesService.perfis(), []);

  return (
    <Tela aoAtualizar={perfis.recarregar} atualizando={perfis.atualizando}>
      <Aviso
        tom="alerta"
        texto="Alterar o padrão de um perfil afeta TODOS os usuários dele. As pessoas desse perfil precisarão entrar novamente para valer."
      />

      {perfis.carregando ? (
        <Carregando />
      ) : perfis.erro ? (
        <MensagemErro mensagem={perfis.erro} aoTentarNovamente={perfis.recarregar} />
      ) : (
        (perfis.dados ?? []).map((p) => {
          const rotulo = ROTULO_PERFIL[p.perfil] ?? p.perfil;
          return (
            <TouchableOpacity
              key={p.perfil}
              activeOpacity={0.7}
              onPress={() =>
                navigation.navigate('PermissoesPerfil', {
                  perfil: p.perfil,
                  rotulo,
                })
              }
            >
              <Cartao>
                <View style={styles.linha}>
                  <View style={styles.info}>
                    <Text style={styles.nome}>{rotulo}</Text>
                    <Text style={styles.detalhe}>
                      {p.personalizados > 0
                        ? `${p.personalizados} ajuste(s) sobre o padrão`
                        : 'Padrão original'}
                    </Text>
                  </View>
                  {p.personalizados > 0 ? (
                    <Selo
                      texto="personalizado"
                      cor={cores.info}
                      fundo={cores.primariaClara}
                    />
                  ) : (
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color={cores.textoSecundario}
                    />
                  )}
                </View>
              </Cartao>
            </TouchableOpacity>
          );
        })
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  info: { flex: 1, paddingRight: espacamento.sm },
  nome: { ...tipografia.corpo, fontWeight: '700', color: cores.texto },
  detalhe: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
});

export default PermissoesPerfisScreen;
