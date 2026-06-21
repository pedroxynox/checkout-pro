/** Tipos das rotas do app (pilha principal autenticada). */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { TipoArrecadacao } from '../api/types';

export type RootStackParamList = {
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
