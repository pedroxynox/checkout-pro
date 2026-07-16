/**
 * Tela "Acesso" (uso do gerente) — Centro de Controle ▸ Acesso.
 *
 * Lista todas as pessoas que têm acesso ao app (login), permite redefinir a
 * senha e revogar o acesso. O cadastro de pessoas (e a criação do login) é
 * feito no cadastro de Colaboradores. Restrita ao gerente (`USUARIOS_CRUD`).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { usuariosService } from '../../api/services';
import { Perfil } from '../../api/types';
import {
  Botao,
  Cartao,
  Carregando,
  CampoTexto,
  EstadoVazio,
  MensagemErro,
  Tela,
} from '../../components';
import { useAuth } from '../../auth/AuthContext';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, tipografia } from '../../theme';
import { confirmar, notificar } from '../../utils/dialogos';

const ROTULO_PERFIL: Record<Perfil, string> = {
  GERENTE: 'Gerente',
  ADMINISTRADOR: 'Administrador',
  SUPERVISOR: 'Supervisor',
  FISCAL: 'Fiscal',
  IMPORTADOR: 'Importador',
};

export function UsuariosScreen(): React.ReactElement {
  const { usuario } = useAuth();
  const usuarios = useRequisicao(() => usuariosService.listar(), []);

  // Redefinição de senha inline
  const [redefinindoId, setRedefinindoId] = useState<string | null>(null);
  const [novaSenha, setNovaSenha] = useState('');

  const salvarNovaSenha = async (id: string) => {
    if (novaSenha.trim().length < 6) {
      notificar('Senha muito curta', 'A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }
    try {
      await usuariosService.redefinirSenha(id, novaSenha.trim());
      setRedefinindoId(null);
      setNovaSenha('');
      notificar('Pronto', 'Senha redefinida.');
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao redefinir senha.');
    }
  };

  const remover = async (id: string, nomePessoa: string) => {
    const ok = await confirmar(
      'Excluir pessoa',
      `Remover "${nomePessoa}" do sistema? Esta ação não pode ser desfeita.`,
      'Excluir',
    );
    if (!ok) {
      return;
    }
    try {
      await usuariosService.remover(id);
      usuarios.recarregar();
      notificar('Pronto', `"${nomePessoa}" foi removido.`);
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao excluir.');
    }
  };

  return (
    <Tela aoAtualizar={usuarios.recarregar} atualizando={usuarios.atualizando}>
      <Text style={styles.intro}>
        Pessoas com acesso ao app. O cadastro e a criação do login são feitos em
        Colaboradores; aqui você redefine a senha ou revoga o acesso.
      </Text>

      <Text style={styles.tituloSecao}>Pessoas com acesso</Text>
      {usuarios.carregando ? (
        <Carregando />
      ) : usuarios.erro ? (
        <MensagemErro mensagem={usuarios.erro} aoTentarNovamente={usuarios.recarregar} />
      ) : !usuarios.dados || usuarios.dados.length === 0 ? (
        <EstadoVazio icone="people-outline" titulo="Nenhuma pessoa cadastrada" />
      ) : (
        usuarios.dados.map((u) => {
          const ehEu = usuario?.sub === u.id;
          const redefinindo = redefinindoId === u.id;
          return (
            <Cartao key={u.id}>
              <View style={styles.cabecalho}>
                <View style={styles.info}>
                  <Text style={styles.nome} numberOfLines={1}>
                    {u.nome ?? u.matricula}
                  </Text>
                  <Text style={styles.detalhe}>
                    Matrícula {u.matricula} · {ROTULO_PERFIL[u.perfil]}
                    {ehEu ? ' · você' : ''}
                  </Text>
                </View>
                <View style={styles.acoes}>
                  <Ionicons
                    name="key-outline"
                    size={22}
                    color={cores.primaria}
                    onPress={() => {
                      setRedefinindoId(redefinindo ? null : u.id);
                      setNovaSenha('');
                    }}
                  />
                  {!ehEu ? (
                    <Ionicons
                      name="trash-outline"
                      size={22}
                      color={cores.erro}
                      onPress={() => void remover(u.id, u.nome ?? u.matricula)}
                    />
                  ) : null}
                </View>
              </View>

              {redefinindo ? (
                <View style={styles.redefinir}>
                  <CampoTexto
                    rotulo="Nova senha"
                    value={novaSenha}
                    onChangeText={setNovaSenha}
                    placeholder="Mínimo 6 caracteres"
                    autoCapitalize="none"
                  />
                  <View style={styles.botoesLinha}>
                    <Botao
                      titulo="Salvar senha"
                      aoPressionar={() => void salvarNovaSenha(u.id)}
                      estilo={styles.botaoFlex}
                    />
                    <Botao
                      titulo="Cancelar"
                      variante="texto"
                      aoPressionar={() => setRedefinindoId(null)}
                      estilo={styles.botaoFlex}
                    />
                  </View>
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
  intro: {
    ...tipografia.corpo,
    color: cores.textoSecundario,
    marginBottom: espacamento.sm,
  },
  rotulo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginBottom: espacamento.xs,
  },
  tituloSecao: {
    ...tipografia.secao,
    color: cores.texto,
    marginTop: espacamento.sm,
    marginBottom: espacamento.md,
  },
  cabecalho: {
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
  acoes: { flexDirection: 'row', gap: espacamento.md, alignItems: 'center' },
  redefinir: { marginTop: espacamento.md },
  botoesLinha: { flexDirection: 'row', gap: espacamento.sm },
  botaoFlex: { flex: 1 },
});

export default UsuariosScreen;
