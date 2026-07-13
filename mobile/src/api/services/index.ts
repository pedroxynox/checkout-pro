/** Reexporta todos os serviços de API por módulo. */
export { acessosService } from './acessos';
export { arrecadacaoService } from './arrecadacao';
export type { ArquivoArrecadacao } from './arrecadacao';
export { vendasService } from './vendas';
export type { ArquivoVendas } from './vendas';
export { fechamentoService } from './fechamento';
export { metasService } from './metas';
export { loteApaeService } from './loteApae';
export { insumosService } from './insumos';
export { requisicoesService } from './requisicoes';
export { fiscaisService, escalaService } from './fiscais';
export { pontoService } from './ponto';
export { checklistService } from './checklist';
export type { ImagemSelecionada } from './checklist';
export { operadoresService } from './operadores';
export { colaboradoresService } from './colaboradores';
export type { FiltroColaboradores } from './colaboradores';
export { advertenciasService } from './advertencias';
export { contratosService } from './contratos';
export type { FiltroContratos } from './contratos';
export { usuariosService } from './usuarios';
export { notificacoesService } from './notificacoes';
export { assistenteService } from './assistente';
export { configSistemaService } from './configSistema';
export type {
  DataInicialResposta,
  DomingoPreview,
  EscalaDomingoConfig,
} from './configSistema';
export { adminService } from './admin';
export type { ResumoReinicio } from './admin';
