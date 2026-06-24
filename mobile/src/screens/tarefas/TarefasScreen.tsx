/**
 * Aba "Tarefas": lista as pendências do dia (o que precisa de atenção), por
 * REGRAS e de forma defensiva, reaproveitando o hook usePulsoDoDia. Cada item
 * leva direto ao módulo correspondente. Sem pendências, mostra "tudo em ordem".
 *
 * Apenas apresentação; nenhuma lógica de negócio/permissão muda.
 */
import { useNavigation } from '@react-navigation/native';
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  DollarSign,
  type LucideIcon,
  Package,
  UploadCloud,
} from 'lucide-react-native';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import { usePulsoDoDia } from '../centroDeMando/usePulsoDoDia';
import { coresModulos, cores, raio, sombra, tipografia } from '../../theme';

/** Rótulo + ícone de cada módulo que pode ter pendência. */
const ITENS_INFO: Record<string, { label: string; Icone: LucideIcon }> = {
  Importacoes: { label: 'Importações', Icone: UploadCloud },
  Insumos: { label: 'Insumos', Icone: Package },
  Checklist: { label: 'Checklist', Icone: ClipboardCheck },
  Indicadores: { label: 'Indicadores', Icone: BarChart3 },
  Operadores: { label: 'Escalas', Icone: Calendar },
  PainelVendas: { label: 'Painel de Vendas', Icone: DollarSign },
};

export function TarefasScreen(): React.ReactElement {
  const { perfil, podeAcessar } = useAuth();
  const navigation = useNavigation();
  const { pendenciasPorModulo } = usePulsoDoDia(perfil, podeAcessar);

  const itens = Object.keys(pendenciasPorModulo)
    .filter((rota) => ITENS_INFO[rota])
    .map((rota) => ({ rota, count: pendenciasPorModulo[rota] }))
    .sort((a, b) => b.count - a.count);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.conteudo}>
        <Text style={styles.titulo}>Tarefas de hoje</Text>
        <Text style={styles.subtitulo}>O que precisa da sua atenção agora.</Text>

        {itens.length === 0 ? (
          <View style={styles.vazio}>
            <CheckCircle2 size={44} color={cores.verde} />
            <Text style={styles.vazioTitulo}>Tudo em ordem 🎉</Text>
            <Text style={styles.vazioTexto}>Sem pendências para hoje.</Text>
          </View>
        ) : (
          <View style={styles.lista}>
            {itens.map(({ rota, count }) => {
              const info = ITENS_INFO[rota];
              const cor = coresModulos[rota] ?? cores.primaria;
              const Icone = info.Icone;
              return (
                <Pressable
                  key={rota}
                  style={({ pressed }) => [styles.linha, pressed && styles.linhaPress]}
                  onPress={() => navigation.navigate(rota as never)}
                >
                  <View style={[styles.icone, { backgroundColor: `${cor}1A` }]}>
                    <Icone size={22} color={cor} />
                  </View>
                  <View style={styles.linhaInfo}>
                    <Text style={styles.linhaTitulo}>{info.label}</Text>
                    <Text style={styles.linhaSub}>{count} pendência(s)</Text>
                  </View>
                  <View style={styles.badge}>
                    <Text style={styles.badgeTexto}>{count}</Text>
                  </View>
                  <ChevronRight size={18} color={cores.textoSecundario} />
                </Pressable>
              );
            })}
          </View>
        )}
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
    padding: 14,
    paddingBottom: 28,
  },
  titulo: {
    ...tipografia.titulo,
    fontSize: 20,
    color: cores.texto,
  },
  subtitulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
    marginBottom: 14,
  },
  lista: {
    gap: 9,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: cores.superficie,
    borderRadius: raio.lg,
    padding: 13,
    borderWidth: 1,
    borderColor: cores.divisor,
    ...sombra.cartao,
  },
  linhaPress: {
    opacity: 0.85,
  },
  icone: {
    width: 42,
    height: 42,
    borderRadius: raio.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linhaInfo: {
    flex: 1,
  },
  linhaTitulo: {
    ...tipografia.rotulo,
    fontSize: 15,
    color: cores.texto,
  },
  linhaSub: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 1,
  },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: cores.vermelho,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTexto: {
    fontFamily: 'Inter_800ExtraBold',
    color: cores.textoInverso,
    fontSize: 12,
    fontWeight: '800',
  },
  vazio: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 8,
  },
  vazioTitulo: {
    ...tipografia.subtitulo,
    color: cores.texto,
  },
  vazioTexto: {
    ...tipografia.corpo,
    color: cores.textoSecundario,
  },
});

export default TarefasScreen;
