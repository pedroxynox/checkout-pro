/**
 * Tela de Pessoas e Acessos (uso do gerente).
 *
 * Permite cadastrar novas pessoas (login por matrícula), listar os usuários,
 * redefinir senha e remover. Funcionalidade restrita ao gerente
 * (`USUARIOS_CRUD`); a autorização definitiva é aplicada no backend.
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
  Segmentado,
  Tela,
} from '../../components';
import { useAuth } from '../../auth/AuthContext';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, tipografia } from '../../theme';
import { confirmar, notificar } from '../../utils/dialogos';

const ROTULO_PERFIL: Record<Perfil, string> = {
  GERENTE: 'Gerente',
  GERENTE_DESENVOLVEDOR: 'Gerente Dev',
  SUPERVISOR: 'Supervisor',
  FISCAL: 'Fiscal',
  IMPORTADOR: 'Importador',
};

export function UsuariosScreen(): React.ReactElement {
  const { usuario } = useAuth();
  const usuarios = useRequisicao(() => usuariosService.listar(), []);

  // Formulário de cadastro
  const [matricula, setMatricula] = useState('');
  const [nome, setNome] = useState('');
  const [perfil, setPerfil] = useState<Perfil>('FISCAL');
  const [senha, setSenha] = useState('');
  const [salvando, setSalvando] = useState(false);

  // Redefinição de senha inline
  const [redefinindoId, setRedefinindoId] = useState<string | null>(null);
  const [novaSenha, setNovaSenha] = useState('');

  const cadastrar = async () => {
    if (!matricula.trim() || !nome.trim() || !senha.trim()) {
      notificar('Campos obrigatórios', 'Informe matrícula, nome e senha.');
      return;
    }
    setSalvando(true);
    try {
      await usuariosService.cadastrar({
        matricula: matricula.trim(),
        nome: nome.trim(),
        perfil,
        senha: senha.trim(),
      });
      setMatricula('');
      setNome('');
      setSenha('');
      setPerfil('FISCAL');
      usuarios.recarregar();
      notificar('Pronto', 'Pessoa cadastrada com sucesso.');
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao cadastrar.');
    } finally {
      setSalvando(false);
    }
  };

  const salvarNovaSenha = async (id: string) => {
    if (!novaSenha.trim()) return;
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
      <Cartao titulo="Cadastrar pessoa">
        <CampoTexto
          rotulo="Matrícula (login)"
          value={matricula}
          onChangeText={setMatricula}
          placeholder="Ex.: 232152"
          keyboardType="number-pad"
          autoCapitalize="none"
        />
        <CampoTexto
          rotulo="Nome completo"
          value={nome}
          onChangeText={setNome}
          placeholder="Ex.: Ana Silva"
        />
        <Text style={styles.rotulo}>Cargo</Text>
        <Segmentado
          opcoes={[
            { valor: 'FISCAL', rotulo: 'Fiscal' },
            { valor: 'SUPERVISOR', rotulo: 'Supervisor' },
            { valor: 'GERENTE', rotulo: 'Gerente' },
            { valor: 'GERENTE_DESENVOLVEDOR', rotulo: 'Gerente Dev' },
            { valor: 'IMPORTADOR', rotulo: 'Importador' },
          ]}
          selecionado={perfil}
          aoSelecionar={setPerfil}
        />
        <CampoTexto
          rotulo="Senha inicial"
          value={senha}
          onChangeText={setSenha}
          placeholder="Mínimo 4 caracteres"
          autoCapitalize="none"
        />
        <Botao titulo="Cadastrar pessoa" aoPressionar={cadastrar} carregando={salvando} />
      </Cartao>

      <Text style={styles.tituloSecao}>Pessoas cadastradas</Text>
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
                    placeholder="Mínimo 4 caracteres"
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
