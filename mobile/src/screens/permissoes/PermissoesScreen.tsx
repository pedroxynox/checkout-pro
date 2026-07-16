/**
 * Central de Permissões — lista de logins (Centro de Controle ▸ Permissões).
 *
 * Uso exclusivo do Administrador (funcionalidade PERMISSOES_GERENCIAR). Mostra
 * todas as pessoas com acesso ao app; tocar em uma abre o ajuste de permissões
 * por login. O próprio Administrador tem acesso total e não é ajustável.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { usuariosService } from '../../api/services';
import { Perfil } from '../../api/types';
import {
  Aviso,
  Botao,
  CampoTexto,
  Cartao,
  Carregando,
  EstadoVazio,
  MensagemErro,
  Selo,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { PropsTela } from '../../navigation/types';
import { cores, espacamento, tipografia } from '../../theme';

const ROTULO_PERFIL: Record<Perfil, string> = {
  GERENTE: 'Gerente',
  ADMINISTRADOR: 'Administrador',
  SUPERVISOR: 'Supervisor',
  FISCAL: 'Fiscal',
  IMPORTADOR: 'Importador',
};

/** Normaliza texto para busca (minúsculas, sem acentos). */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function PermissoesScreen({
  navigation,
}: PropsTela<'Permissoes'>): React.ReactElement {
  const usuarios = useRequisicao(() => usuariosService.listar(), []);
  const [busca, setBusca] = useState('');

  const filtrados = useMemo(() => {
    const lista = usuarios.dados ?? [];
    const termo = normalizar(busca.trim());
    if (!termo) {
      return lista;
    }
    return lista.filter((u) => {
      const alvo = normalizar(
        `${u.nome ?? ''} ${u.matricula} ${ROTULO_PERFIL[u.perfil]}`,
      );
      return alvo.includes(termo);
    });
  }, [usuarios.dados, busca]);

  return (
    <Tela aoAtualizar={usuarios.recarregar} atualizando={usuarios.atualizando}>
      <Aviso texto="Ajuste o que cada login pode acessar. O perfil define o padrão; aqui você concede ou remove permissões pontuais. O Administrador tem acesso total." />

      <View style={styles.atalhos}>
        <Botao
          titulo="Padrões por perfil"
          variante="secundario"
          aoPressionar={() => navigation.navigate('PermissoesPerfis')}
          estilo={styles.atalhoBotao}
        />
        <Botao
          titulo="Histórico"
          variante="secundario"
          aoPressionar={() => navigation.navigate('PermissoesHistorico')}
          estilo={styles.atalhoBotao}
        />
      </View>

      {usuarios.carregando ? (
        <Carregando />
      ) : usuarios.erro ? (
        <MensagemErro
          mensagem={usuarios.erro}
          aoTentarNovamente={usuarios.recarregar}
        />
      ) : !usuarios.dados || usuarios.dados.length === 0 ? (
        <EstadoVazio icone="people-outline" titulo="Nenhuma pessoa com acesso" />
      ) : (
        <>
          <CampoTexto
            rotulo="Buscar"
            value={busca}
            onChangeText={setBusca}
            placeholder="Nome, matrícula ou perfil"
            autoCapitalize="none"
          />
          {filtrados.length === 0 ? (
            <EstadoVazio
              icone="search-outline"
              titulo="Nenhum login encontrado"
              descricao="Tente outro termo de busca."
            />
          ) : (
            filtrados.map((u) => {
              const ehAdmin = u.perfil === 'ADMINISTRADOR';
              return (
                <TouchableOpacity
                  key={u.id}
                  activeOpacity={ehAdmin ? 1 : 0.7}
                  disabled={ehAdmin}
                  onPress={() =>
                    navigation.navigate('PermissoesUsuario', {
                      usuarioId: u.id,
                      login: u.matricula,
                      nome: u.nome ?? null,
                    })
                  }
                >
                  <Cartao>
                    <View style={styles.linha}>
                      <View style={styles.info}>
                        <Text style={styles.nome} numberOfLines={1}>
                          {u.nome ?? u.matricula}
                        </Text>
                        <Text style={styles.detalhe}>
                          Matrícula {u.matricula} · {ROTULO_PERFIL[u.perfil]}
                        </Text>
                      </View>
                      {ehAdmin ? (
                        <Selo
                          texto="Acesso total"
                          cor={cores.primaria}
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
        </>
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  atalhos: {
    flexDirection: 'row',
    gap: espacamento.sm,
    marginBottom: espacamento.md,
  },
  atalhoBotao: { flex: 1 },
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

export default PermissoesScreen;
