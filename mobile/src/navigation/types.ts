/** Tipos das rotas do app (pilha principal autenticada). */
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { TipoArrecadacao } from '../api/types';

/** Abas da barra inferior (área autenticada). */
export type MainTabParamList = {
  Inicio: undefined;
  Tarefas: undefined;
  Mensagens: undefined;
  Notificacoes: undefined;
  Perfil: undefined;
};

export type RootStackParamList = {
  /** Contêiner das abas (Início/Tarefas/Mensagens/Perfil). */
  Tabs: undefined;
  Home: undefined;
  Importacoes: undefined;
  Fechamento: undefined;
  Indicadores: undefined;
  IndicadorDetalhe: { tipo: TipoArrecadacao };
  PainelVendas: undefined;
  LoteApae: undefined;
  Insumos: undefined;
  InsumoDetalhe: { insumoId: string; nome: string };
  Requisicoes: undefined;
  Fiscais: undefined;
  JornadaFiscais: undefined;
  Escala: undefined;
  Checklist: undefined;
  Operadores: undefined;
  Usuarios: undefined;
  AlertasFila: undefined;
  Normativas: undefined;
  IndicadorQuebra: undefined;
  Notificacoes: undefined;
  GerenciarDados: undefined;
};

export type RotaApp = keyof RootStackParamList;

export type PropsTela<T extends RotaApp> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

/**
 * Props da aba Início (Home): compõe a navegação da aba com a da pilha, para
 * que a Home possa navegar tanto para as abas quanto para as telas de módulo.
 */
export type PropsTabInicio = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Inicio'>,
  NativeStackScreenProps<RootStackParamList>
>;
