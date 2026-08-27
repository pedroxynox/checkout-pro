/** Tipos das rotas do app (pilha principal autenticada). */
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { TipoArrecadacao } from '../api/types';
import type {
  CentralPessoaResumo,
  MarcacaoCanonica,
  MetricaRanking,
} from '../api/services/centralJornada';

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
  Insumos: undefined;
  InsumoDetalhe: { insumoId: string; nome: string };
  Requisicoes: undefined;
  JornadaFiscais: undefined;
  /**
   * Relógio Ponto.
   *
   * `abrirScanner` (nonce) abre a câmera do leitor de ponto ao entrar. Os
   * demais parâmetros vêm do relatório de **marcações inválidas** e montam o
   * "modo correção": a tela já abre na pessoa e no dia que faltam ajustar, diz
   * qual marcação falta e sabe caminhar até a próxima pendência da fila.
   */
  RegistroPonto:
    | {
        abrirScanner?: number;
        /** Ficha do colaborador do item de marcação inválida. */
        correcaoColaboradorId?: string;
        /** Nome completo, usado para localizar a pessoa no ponto. */
        correcaoNome?: string;
        /** Dia a ajustar (`yyyy-mm-dd`). */
        correcaoData?: string;
        /** Marcações que faltam nesse dia, na ordem do dia. */
        correcaoFaltantes?: MarcacaoCanonica[];
        /** Entrada prevista pela escala ("HH:mm"), quando há turno. */
        correcaoEntradaPrevista?: string | null;
        /** Ciclo (0 = atual) de onde saiu a fila, para reconsultá-la. */
        correcaoCiclo?: number;
        /** Filtro de pessoa aplicado na lista, para a fila não fugir dele. */
        correcaoFiltroNome?: string;
        /** Filtro de marcação aplicado na lista. */
        correcaoFiltroTipo?: MarcacaoCanonica;
      }
    | undefined;
  CentralJornada: undefined;
  /** Detalhe diário da jornada de um colaborador no ciclo (aberto pela Central). */
  DetalheJornada: {
    colaboradorId: string;
    ciclo: number;
    pessoa: CentralPessoaResumo;
  };
  /** Escala para publicar (dia/semana) em PDF e imagem 4K. */
  Escala: undefined;
  Inconsistencias: undefined;
  /** Relatório de marcações faltantes do ciclo (aberto pela Central). */
  MarcacoesInvalidas: undefined;
  /**
   * Ranking do time numa métrica do "Resumo do time" (aberto ao tocar na card).
   * `metrica` define o que ordenar e qual detalhe mostrar; `ciclo` mantém o
   * período que estava selecionado na Central.
   */
  RankingTime: { metrica: MetricaRanking; ciclo: number };
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
