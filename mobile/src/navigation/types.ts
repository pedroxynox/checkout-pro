/** Tipos das rotas do app (pilha principal autenticada). */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Home: undefined;
  Importacoes: undefined;
  Indicadores: undefined;
  PainelVendas: undefined;
  LoteApae: undefined;
  Insumos: undefined;
  InsumoDetalhe: { insumoId: string; nome: string };
  Fiscais: undefined;
  Escala: undefined;
  Checklist: undefined;
  Operadores: undefined;
  Notificacoes: undefined;
};

export type RotaApp = keyof RootStackParamList;

export type PropsTela<T extends RotaApp> = NativeStackScreenProps<
  RootStackParamList,
  T
>;
