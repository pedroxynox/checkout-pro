/** Tipos das rotas do app (pilha principal autenticada). */
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { TipoArrecadacao } from '../api/types';
import type { CentralPessoaResumo } from '../api/services/centralJornada';

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
  IndicadorDetalhe: {
    tipo: TipoArrecadacao;
    /** Ao vir de um "ponto de atenção": foca o detalhe na causa. */
    operadorNome?: string;
    alertaMensagem?: string;
  };
  PainelVendas: undefined;
  LoteApae: undefined;
  Insumos: undefined;
  InsumoDetalhe: { insumoId: string; nome: string };
  Requisicoes: undefined;
  JornadaFiscais: undefined;
  /** `abrirScanner` (nonce) abre a câmera do leitor de ponto ao entrar. */
  RegistroPonto: { abrirScanner?: number } | undefined;
  CentralJornada: undefined;
  /** Detalhe diário da jornada de um colaborador no ciclo (aberto pela Central). */
  DetalheJornada: {
    colaboradorId: string;
    ciclo: number;
    pessoa: CentralPessoaResumo;
  };
  Inconsistencias: undefined;
  ExportarCiclo: undefined;
  Feriados: undefined;
  Checklist: undefined;
  Operadores: undefined;
  Justificativas: undefined;
  Colaboradores: undefined;
  Contratos: undefined;
  Sancoes: undefined;
  CentroControle: undefined;
  /** Consulta dos códigos de balança (área da Home, todos os perfis). */
  ProdutosPesados: undefined;
  /** Carga do arquivo .txt de produtos pesados (Centro de Controle, gestão). */
  ProdutosPesadosCarga: undefined;
  Relatorios: undefined;
  GestaoColaboradores: { matriculaInicial?: string; nomeInicial?: string } | undefined;
  Metas: undefined;
  ConfigEscalaDomingo: undefined;
  TiposContrato: undefined;
  CentralVendas: undefined;
  NaoReconhecidos: undefined;
  InsumosDados: undefined;
  ReiniciarDados: undefined;
  PerfilColaborador: { colaboradorId: string };
  Usuarios: undefined;
  CheckOuts: undefined;
  CheckOutDetalhe: { numero: number };
  CheckOutsConfig: undefined;
  Permissoes: undefined;
  PermissoesUsuario: { usuarioId: string; login: string; nome?: string | null };
  PermissoesHistorico: undefined;
  PermissoesPerfis: undefined;
  PermissoesPerfil: { perfil: string; rotulo: string };
  AlertasFila: undefined;
  Normativas: undefined;
  IndicadorQuebra: undefined;
  Notificacoes: undefined;
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
