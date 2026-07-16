/**
 * Aba "Perfil": identidade do usuário (nome, login, cargo) e ação de sair.
 * Apenas apresentação; usa o AuthContext já existente.
 */
import { LogOut } from 'lucide-react-native';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import { cores, raio, sombra, tipografia } from '../../theme';

export function PerfilScreen(): React.ReactElement {
  const { usuario, perfil, sair } = useAuth();

  const derivadoDoLogin = (usuario?.login ?? '')
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
  const nomeCompleto =
    usuario?.nome && usuario.nome.trim().length > 0
      ? usuario.nome.trim()
      : derivadoDoLogin;
  const inicial = (nomeCompleto.charAt(0) || 'U').toUpperCase();
  const rotuloPerfil =
    perfil === 'GERENTE'
      ? 'Gerente'
      : perfil === 'ADMINISTRADOR'
        ? 'Administrador'
        : perfil === 'SUPERVISOR'
          ? 'Supervisor'
          : perfil === 'IMPORTADOR'
            ? 'Importador'
            : 'Fiscal';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.conteudo}>
        <View style={styles.cabecalho}>
          <View style={styles.avatar}>
            <Text style={styles.avatarTexto}>{inicial}</Text>
          </View>
          <Text style={styles.nome}>{nomeCompleto || 'Usuário'}</Text>
          <Text style={styles.cargo}>{rotuloPerfil}</Text>
        </View>

        <View style={styles.cartao}>
          <View style={styles.linha}>
            <Text style={styles.rotulo}>Login</Text>
            <Text style={styles.valor}>{usuario?.login ?? '—'}</Text>
          </View>
          <View style={[styles.linha, styles.linhaUltima]}>
            <Text style={styles.rotulo}>Cargo</Text>
            <Text style={styles.valor}>{rotuloPerfil}</Text>
          </View>
        </View>

        <Pressable
          onPress={() => void sair()}
          style={({ pressed }) => [styles.sair, pressed && styles.sairPress]}
          accessibilityRole="button"
          accessibilityLabel="Sair"
        >
          <LogOut size={18} color={cores.vermelho} />
          <Text style={styles.sairTexto}>Sair da conta</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: cores.fundo,
  },
  conteudo: {
    padding: 16,
    paddingBottom: 28,
  },
  cabecalho: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: cores.primariaClara,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  avatarTexto: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 30,
    fontWeight: '800',
    color: cores.primaria,
  },
  nome: {
    ...tipografia.subtitulo,
    color: cores.texto,
  },
  cargo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  cartao: {
    backgroundColor: cores.superficie,
    borderRadius: raio.lg,
    paddingHorizontal: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: cores.divisor,
    ...sombra.cartao,
  },
  linha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  linhaUltima: {
    borderBottomWidth: 0,
  },
  rotulo: {
    ...tipografia.corpo,
    color: cores.textoSecundario,
  },
  valor: {
    ...tipografia.corpo,
    fontWeight: '700',
    color: cores.texto,
  },
  sair: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: cores.vermelhoFundo,
    borderRadius: raio.lg,
    paddingVertical: 14,
    marginTop: 24,
  },
  sairPress: {
    opacity: 0.85,
  },
  sairTexto: {
    ...tipografia.rotulo,
    fontSize: 15,
    fontWeight: '800',
    color: cores.vermelho,
  },
});

export default PerfilScreen;
