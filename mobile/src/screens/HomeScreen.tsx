/**
 * Tela inicial (dashboard) após o login.
 *
 * Exibe, em forma de lista, **apenas** as áreas que o perfil do usuário pode
 * acessar (Req 7.2.2–7.2.4): o gerente vê todas; o fiscal vê apenas as áreas
 * operacionais. Mostra também a identidade do usuário e a ação de sair.
 *
 * Visual: identidade SaaS executiva — header com degradê, saudação inteligente
 * por horário, e módulos premium (ícone circular colorido + chevron). A LÓGICA
 * (áreas visíveis, permissões, navegação) permanece exatamente a mesma.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../auth/AuthContext';
import { AREAS } from '../navigation/areas';
import { ResumoDoDia } from './centroDeMando/ResumoDoDia';
import { useNotificacoes } from '../notificacoes/NotificacoesContext';
import { PropsTela } from '../navigation/types';
import {
  cores,
  coresModulos,
  espacamento,
  gradientes,
  raio,
  sombra,
  tipografia,
} from '../theme';

/** Saudação inteligente conforme o horário do dispositivo. */
function saudacaoPorHora(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

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
  const inicial = (nome.charAt(0) || 'U').toUpperCase();

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Header premium com degradê */}
      <LinearGradient
        colors={gradientes.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <SafeAreaView edges={['top']}>
          <Text style={styles.marca}>Check-out Pro</Text>
          <Text style={styles.tagline}>Legado de Gestão Inteligente</Text>

          <View style={styles.headerRow}>
            <View style={styles.usuarioBox}>
              <View style={styles.avatar}>
                <Text style={styles.avatarTexto}>{inicial}</Text>
              </View>
              <View style={styles.usuarioInfo}>
                <Text style={styles.saudacao} numberOfLines={1}>
                  {saudacaoPorHora()}, {nome}
                </Text>
                <Text style={styles.cargo}>{rotuloPerfil}</Text>
              </View>
            </View>

            <View style={styles.acoesTopo}>
              {podeAcessar('NOTIFICACOES') && (
                <Pressable
                  onPress={() => navigation.navigate('Notificacoes')}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Notificações"
                  style={styles.iconeAcao}
                >
                  <Ionicons
                    name="notifications-outline"
                    size={20}
                    color={cores.textoInverso}
                  />
                  {naoLidas > 0 && (
                    <View style={styles.sinoBadge}>
                      <Text style={styles.sinoBadgeTexto}>
                        {naoLidas > 99 ? '99+' : naoLidas}
                      </Text>
                    </View>
                  )}
                </Pressable>
              )}
              <Pressable
                onPress={() => void sair()}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Sair"
                style={styles.iconeAcao}
              >
                <Ionicons
                  name="log-out-outline"
                  size={20}
                  color={cores.textoInverso}
                />
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.conteudo}>
        <ResumoDoDia aoNavegar={(rota) => navigation.navigate(rota as never)} />
        <Text style={styles.secao}>Áreas</Text>
        <View style={styles.lista}>
          {areasVisiveis.map((area) => {
            const corModulo = coresModulos[area.rota] ?? cores.primaria;
            return (
              <Pressable
                key={area.rota}
                style={({ pressed }) => [
                  styles.modulo,
                  pressed && styles.moduloPressionado,
                ]}
                onPress={() => navigation.navigate(area.rota)}
              >
                <View
                  style={[styles.moduloIcone, { backgroundColor: `${corModulo}1A` }]}
                >
                  <Ionicons name={area.icone} size={22} color={corModulo} />
                </View>
                <View style={styles.moduloTexto}>
                  <Text style={styles.moduloTitulo}>{area.titulo}</Text>
                  <Text style={styles.moduloDescricao}>{area.descricao}</Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={cores.textoSecundario}
                />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: cores.primaria,
  },
  header: {
    paddingHorizontal: espacamento.lg,
    paddingBottom: espacamento.xl,
  },
  marca: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 20,
    fontWeight: '800',
    color: cores.textoInverso,
    letterSpacing: -0.3,
  },
  tagline: {
    ...tipografia.legenda,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
    letterSpacing: 0.2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: espacamento.lg,
  },
  usuarioBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.md,
    flex: 1,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTexto: {
    fontFamily: 'Inter_800ExtraBold',
    color: cores.textoInverso,
    fontSize: 18,
    fontWeight: '800',
  },
  usuarioInfo: {
    flex: 1,
  },
  saudacao: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    fontWeight: '700',
    color: cores.textoInverso,
    letterSpacing: -0.2,
  },
  cargo: {
    ...tipografia.legenda,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 1,
  },
  acoesTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
  },
  iconeAcao: {
    width: 38,
    height: 38,
    borderRadius: raio.md,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  sinoBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: cores.vermelho,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sinoBadgeTexto: {
    color: cores.textoInverso,
    fontSize: 10,
    fontWeight: '800',
  },
  scroll: {
    flex: 1,
  },
  conteudo: {
    backgroundColor: cores.fundo,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: espacamento.lg,
    paddingTop: espacamento.xl,
    paddingBottom: espacamento.xxl,
    minHeight: '100%',
  },
  secao: {
    ...tipografia.subtitulo,
    color: cores.texto,
    marginBottom: espacamento.md,
  },
  lista: {
    gap: espacamento.md,
  },
  modulo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.md,
    backgroundColor: cores.superficie,
    borderRadius: raio.lg,
    padding: espacamento.lg,
    borderWidth: 1,
    borderColor: cores.divisor,
    ...sombra.cartao,
  },
  moduloPressionado: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  moduloIcone: {
    width: 48,
    height: 48,
    borderRadius: raio.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduloTexto: {
    flex: 1,
  },
  moduloTitulo: {
    ...tipografia.rotulo,
    fontSize: 15,
    color: cores.texto,
  },
  moduloDescricao: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
});

export default HomeScreen;
