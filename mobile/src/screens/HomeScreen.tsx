/**
 * Tela inicial (dashboard) após o login.
 *
 * Exibe o resumo inteligente do dia no topo e, abaixo, **apenas** as áreas que
 * o perfil do usuário pode acessar (Req 7.2.2–7.2.4) em forma de **grade**
 * ("Acessos rápidos"): o gerente vê todas; o fiscal vê apenas as operacionais.
 * Mostra também a identidade do usuário e a ação de sair.
 *
 * Visual: identidade SaaS executiva — header com degradê, saudação inteligente
 * por horário, e módulos em grade (ícone colorido + rótulo), ordenados por
 * relevância (os com pendência sobem e ganham um selo). A LÓGICA (áreas
 * visíveis, permissões, navegação) permanece exatamente a mesma.
 */
import { LinearGradient } from 'expo-linear-gradient';
import {
  AlertCircle,
  BadgeCheck,
  BarChart3,
  Bell,
  Calendar,
  ClipboardCheck,
  DollarSign,
  FileText,
  LayoutGrid,
  LogOut,
  type LucideIcon,
  Package,
  Settings,
  ShoppingBag,
  TrendingDown,
  UploadCloud,
  UserPlus,
  Users,
} from 'lucide-react-native';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../auth/AuthContext';
import { AREAS } from '../navigation/areas';
import { ResumoDoDia } from './centroDeMando/ResumoDoDia';
import { usePulsoDoDia } from './centroDeMando/usePulsoDoDia';
import { useNotificacoes } from '../notificacoes/NotificacoesContext';
import { PropsTela } from '../navigation/types';
import { cores, coresModulos, gradientes, raio, sombra, tipografia } from '../theme';

/** Saudação inteligente conforme o horário do dispositivo. */
function saudacaoPorHora(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/**
 * Ícone (Lucide) de cada módulo, por rota. Mantém `areas.ts` intacto: o ícone
 * é resolvido aqui pela rota. Rotas sem mapa usam um ícone padrão.
 */
const ICONES_MODULO: Record<string, LucideIcon> = {
  Fechamento: BadgeCheck,
  Importacoes: UploadCloud,
  Indicadores: BarChart3,
  PainelVendas: DollarSign,
  LoteApae: ShoppingBag,
  Insumos: Package,
  Fiscais: Users,
  Escala: Calendar,
  Checklist: ClipboardCheck,
  Operadores: Calendar,
  Usuarios: UserPlus,
  AlertasFila: AlertCircle,
  Normativas: FileText,
  IndicadorQuebra: TrendingDown,
  GerenciarDados: Settings,
};

export function HomeScreen({
  navigation,
}: PropsTela<'Home'>): React.ReactElement {
  const { usuario, perfil, podeAcessar, sair } = useAuth();
  const { naoLidas } = useNotificacoes();
  // Pulso do dia: pendências por módulo (para ordenar por relevância e marcar
  // um selo). Defensivo e por regras; não muda nenhuma lógica de negócio.
  const { pendenciasPorModulo } = usePulsoDoDia(perfil, podeAcessar);
  // Áreas visíveis no menu: precisa ter acesso pela funcionalidade E não estar
  // marcada como "em breve" (em construção). Áreas `emBreve` ficam ocultas até
  // serem concluídas, inclusive para o gerente desenvolvedor.
  const areasVisiveis = AREAS.filter(
    (a) => !a.emBreve && podeAcessar(a.funcionalidade),
  );
  // Ordena por relevância: módulos com mais pendências primeiro; em empate,
  // mantém a ordem original (sort estável). Apenas reordena a exibição.
  const areasOrdenadas = [...areasVisiveis].sort(
    (a, b) =>
      (pendenciasPorModulo[b.rota] ?? 0) - (pendenciasPorModulo[a.rota] ?? 0),
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
                  <Bell size={14} color={cores.textoInverso} />
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
                <LogOut size={14} color={cores.textoInverso} />
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.conteudo}>
        {/* Resumo inteligente do dia (mantido no topo) */}
        <ResumoDoDia aoNavegar={(rota) => navigation.navigate(rota as never)} />

        {/* Acessos rápidos (áreas) em grade */}
        <Text style={styles.secao}>Acessos rápidos</Text>
        <View style={styles.grade}>
          {areasOrdenadas.map((area) => {
            const corModulo = coresModulos[area.rota] ?? cores.primaria;
            const Icone = ICONES_MODULO[area.rota] ?? LayoutGrid;
            const pendencias = pendenciasPorModulo[area.rota] ?? 0;
            return (
              <Pressable
                key={area.rota}
                style={({ pressed }) => [
                  styles.tile,
                  pressed && styles.tilePressionado,
                ]}
                onPress={() => navigation.navigate(area.rota)}
              >
                <View
                  style={[styles.tileIcone, { backgroundColor: `${corModulo}1A` }]}
                >
                  <Icone size={24} color={corModulo} />
                  {pendencias > 0 && (
                    <View style={styles.tileBadge}>
                      <Text style={styles.tileBadgeTexto}>{pendencias}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.tileTitulo} numberOfLines={2}>
                  {area.titulo}
                </Text>
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
    paddingHorizontal: 12,
    paddingBottom: 18,
  },
  marca: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 15,
    fontWeight: '800',
    color: cores.textoInverso,
    letterSpacing: -0.3,
  },
  tagline: {
    ...tipografia.legenda,
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
    letterSpacing: 0.2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  usuarioBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flex: 1,
  },
  avatar: {
    width: 33,
    height: 33,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTexto: {
    fontFamily: 'Inter_800ExtraBold',
    color: cores.textoInverso,
    fontSize: 14,
    fontWeight: '800',
  },
  usuarioInfo: {
    flex: 1,
  },
  saudacao: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    fontWeight: '700',
    color: cores.textoInverso,
    letterSpacing: -0.2,
  },
  cargo: {
    ...tipografia.legenda,
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 1,
  },
  acoesTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  iconeAcao: {
    width: 30,
    height: 30,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  sinoBadge: {
    position: 'absolute',
    top: 1,
    right: 1,
    minWidth: 13,
    height: 13,
    paddingHorizontal: 2,
    borderRadius: 7,
    backgroundColor: cores.vermelho,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sinoBadgeTexto: {
    color: cores.textoInverso,
    fontSize: 8,
    fontWeight: '800',
  },
  scroll: {
    flex: 1,
  },
  conteudo: {
    backgroundColor: cores.fundo,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 12,
    paddingTop: 18,
    paddingBottom: 24,
    minHeight: '100%',
  },
  secao: {
    ...tipografia.subtitulo,
    fontSize: 14,
    color: cores.texto,
    marginBottom: 10,
  },
  grade: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tile: {
    width: '31%',
    backgroundColor: cores.superficie,
    borderRadius: raio.lg,
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'flex-start',
    borderWidth: 1,
    borderColor: cores.divisor,
    ...sombra.cartao,
  },
  tilePressionado: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  tileIcone: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    position: 'relative',
  },
  tileBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: cores.vermelho,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: cores.superficie,
  },
  tileBadgeTexto: {
    fontFamily: 'Inter_800ExtraBold',
    color: cores.textoInverso,
    fontSize: 10,
    fontWeight: '800',
  },
  tileTitulo: {
    ...tipografia.rotulo,
    fontSize: 12,
    color: cores.texto,
    textAlign: 'center',
  },
});

export default HomeScreen;
