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
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../auth/AuthContext';
import { AREAS } from '../navigation/areas';
import { ResumoDoDia } from './centroDeMando/ResumoDoDia';
import { usePulsoDoDia } from './centroDeMando/usePulsoDoDia';
import { PropsTabInicio } from '../navigation/types';
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
}: PropsTabInicio): React.ReactElement {
  const { usuario, perfil, podeAcessar, sair } = useAuth();
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
          <View style={styles.marcaRow}>
            <Image
              source={require('../../assets/LogoElemento.png')}
              style={styles.marcaLogo}
              resizeMode="contain"
              accessibilityLabel="Check-out Pro"
            />
          </View>

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
              <Pressable
                onPress={() => void sair()}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Sair"
                style={styles.iconeAcao}
              >
                <LogOut size={15} color={cores.textoInverso} />
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
                  <Icone size={26} color={corModulo} />
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
    paddingHorizontal: 13,
    paddingBottom: 19,
  },
  marcaLogo: {
    width: 46,
    height: 46,
  },
  marcaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 13,
  },
  usuarioBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTexto: {
    fontFamily: 'Inter_800ExtraBold',
    color: cores.textoInverso,
    fontSize: 15,
    fontWeight: '800',
  },
  usuarioInfo: {
    flex: 1,
  },
  saudacao: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    fontWeight: '700',
    color: cores.textoInverso,
    letterSpacing: -0.2,
  },
  cargo: {
    ...tipografia.legenda,
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 1,
  },
  acoesTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconeAcao: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  sinoBadge: {
    position: 'absolute',
    top: 1,
    right: 1,
    minWidth: 14,
    height: 14,
    paddingHorizontal: 2,
    borderRadius: 7,
    backgroundColor: cores.vermelho,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sinoBadgeTexto: {
    color: cores.textoInverso,
    fontSize: 9,
    fontWeight: '800',
  },
  scroll: {
    flex: 1,
    // Essencial na web: permite que o ScrollView ENCOLHA e role internamente
    // (sem isto, ele cresce com o conteúdo e a página inteira rola, levando o
    // header junto).
    minHeight: 0,
  },
  conteudo: {
    backgroundColor: cores.fundo,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 13,
    paddingTop: 19,
    paddingBottom: 26,
    minHeight: '100%',
  },
  secao: {
    ...tipografia.subtitulo,
    fontSize: 15,
    color: cores.texto,
    marginBottom: 11,
  },
  grade: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  tile: {
    width: '31%',
    backgroundColor: cores.superficie,
    borderRadius: raio.lg,
    paddingVertical: 15,
    paddingHorizontal: 7,
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
    width: 50,
    height: 50,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 9,
    position: 'relative',
  },
  tileBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: cores.vermelho,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: cores.superficie,
  },
  tileBadgeTexto: {
    fontFamily: 'Inter_800ExtraBold',
    color: cores.textoInverso,
    fontSize: 11,
    fontWeight: '800',
  },
  tileTitulo: {
    ...tipografia.rotulo,
    fontSize: 13,
    color: cores.texto,
    textAlign: 'center',
  },
});

export default HomeScreen;
