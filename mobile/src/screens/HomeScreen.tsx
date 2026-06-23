/**
 * Tela inicial (dashboard) após o login.
 *
 * Exibe, em forma de grade, **apenas** as áreas que o perfil do usuário pode
 * acessar (Req 7.2.2–7.2.4): o gerente vê todas; o fiscal vê apenas as áreas
 * operacionais. Mostra também a identidade do usuário e a ação de sair.
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../auth/AuthContext';
import { AREAS } from '../navigation/areas';
import { useNotificacoes } from '../notificacoes/NotificacoesContext';
import { PropsTela } from '../navigation/types';
import { cores, espacamento, raio, sombra, tipografia } from '../theme';

export function HomeScreen({
  navigation,
}: PropsTela<'Home'>): React.ReactElement {
  const { usuario, perfil, podeAcessar, sair } = useAuth();
  const { naoLidas } = useNotificacoes();
  // Áreas visíveis no menu: precisa ter acesso pela funcionalidade E não estar
  // marcada como "em breve" (em construção). Áreas `emBreve` ficam ocultas até
  // serem concluídas, inclusive para o gerente desenvolvedor.
  const areasVisiveis = AREAS.filter(
    (a) => !a.emBreve && podeAcessar(a.funcionalidade),
  );

  // Nome a exibir: usa o nome do usuário (quando houver); senão, deriva do
  // login. Exibe apenas o PRIMEIRO nome.
  const derivadoDoLogin = (usuario?.login ?? '')
    .split(/[._-]+/)
    .filter(Boolean)
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1).toLowerCase())
    .join(' ');
  const nomeCompleto =
    usuario?.nome && usuario.nome.trim().length > 0
      ? usuario.nome.trim()
      : derivadoDoLogin;
  const primeiroNome = nomeCompleto.split(/\s+/)[0] ?? nomeCompleto;
  const rotuloPerfil =
    perfil === 'GERENTE'
      ? 'Gerente'
      : perfil === 'GERENTE_DESENVOLVEDOR'
        ? 'Gerente Desenvolvedor'
        : perfil === 'SUPERVISOR'
          ? 'Supervisor'
          : perfil === 'IMPORTADOR'
            ? 'Importador'
            : 'Fiscal';
  const nome = primeiroNome;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="light" />
      <View style={styles.topo}>
        <View>
          <Text style={styles.marca}>Check-out Pro</Text>
          <Text style={styles.saudacao}>
            {nome} · {rotuloPerfil}
          </Text>
        </View>
        <Pressable
          onPress={() => void sair()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Sair"
        >
          <Ionicons name="log-out-outline" size={24} color={cores.textoInverso} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.conteudo}>
        <Text style={styles.secao}>Áreas</Text>
        <View style={styles.grade}>
          {areasVisiveis.map((area) => (
            <Pressable
              key={area.rota}
              style={({ pressed }) => [
                styles.cartao,
                pressed && styles.cartaoPressionado,
              ]}
              onPress={() => navigation.navigate(area.rota)}
            >
              <View style={styles.iconeWrapper}>
                <Ionicons name={area.icone} size={24} color={cores.primaria} />
              </View>
              {area.rota === 'Notificacoes' && naoLidas > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeTexto}>
                    {naoLidas > 99 ? '99+' : naoLidas}
                  </Text>
                </View>
              )}
              <Text style={styles.cartaoTitulo}>{area.titulo}</Text>
              <Text style={styles.cartaoDescricao}>{area.descricao}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: cores.primaria,
  },
  topo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: espacamento.lg,
    paddingBottom: espacamento.lg,
  },
  marca: {
    fontSize: 22,
    fontWeight: '800',
    color: cores.textoInverso,
  },
  saudacao: {
    ...tipografia.legenda,
    color: cores.primariaClara,
    marginTop: 2,
  },
  conteudo: {
    backgroundColor: cores.fundo,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: espacamento.lg,
    minHeight: '100%',
  },
  secao: {
    ...tipografia.secao,
    color: cores.texto,
    marginBottom: espacamento.md,
  },
  grade: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  cartao: {
    width: '48%',
    backgroundColor: cores.superficie,
    borderRadius: raio.lg,
    padding: espacamento.lg,
    marginBottom: espacamento.md,
    ...sombra.cartao,
  },
  cartaoPressionado: {
    opacity: 0.7,
  },
  iconeWrapper: {
    width: 44,
    height: 44,
    borderRadius: raio.md,
    backgroundColor: cores.primariaClara,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: espacamento.sm,
  },
  badge: {
    position: 'absolute',
    top: espacamento.md,
    right: espacamento.md,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: cores.primaria,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTexto: {
    color: cores.textoInverso,
    fontSize: 12,
    fontWeight: '800',
  },
  cartaoTitulo: {
    ...tipografia.rotulo,
    fontSize: 15,
    color: cores.texto,
  },
  cartaoDescricao: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
});

export default HomeScreen;
