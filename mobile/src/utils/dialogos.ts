/**
 * Diálogos do app (móvel + web) com visual próprio.
 *
 * Antes usávamos o `Alert` do React Native (que nem funciona na web) e o
 * `window.confirm/alert` do navegador — sem identidade visual. Agora estas
 * funções publicam um "pedido de diálogo" para um único componente host
 * (`DialogHost`, montado na raiz do app), que exibe uma janela bonita e
 * padronizada. A API continua a mesma (baseada em Promise), então nenhuma tela
 * precisou mudar.
 *
 * Dois formatos:
 *  - `confirmar(...)` → janela de **confirmação** (Cancelar / Confirmar);
 *  - `notificar(...)` → janela de **aviso** (um botão OK), com tom de sucesso
 *    ou de erro inferido pelo título.
 */

export type TipoDialogo = 'confirmar' | 'notificar';
export type TomDialogo = 'sucesso' | 'erro';

/** Um pedido de diálogo a ser exibido pelo host. */
export interface PedidoDialogo {
  id: number;
  tipo: TipoDialogo;
  titulo: string;
  mensagem: string;
  textoConfirmar: string;
  tom: TomDialogo;
  resolver: (confirmado: boolean) => void;
}

type Ouvinte = (pedido: PedidoDialogo | null) => void;

let ouvinte: Ouvinte | null = null;
let ativo: PedidoDialogo | null = null;
const fila: PedidoDialogo[] = [];
let sequencia = 0;

/** O `DialogHost` registra-se aqui para receber o pedido ativo (ou null). */
export function registrarOuvinteDialogo(fn: Ouvinte | null): void {
  ouvinte = fn;
  if (fn) fn(ativo);
}

function emitir(): void {
  if (ouvinte) ouvinte(ativo);
}

function enfileirar(pedido: Omit<PedidoDialogo, 'id'>): void {
  const completo: PedidoDialogo = { ...pedido, id: ++sequencia };
  if (ativo) {
    fila.push(completo);
  } else {
    ativo = completo;
    emitir();
  }
}

/** Chamado pelo host quando o usuário responde (fecha a janela atual). */
export function responderDialogo(confirmado: boolean): void {
  const atual = ativo;
  ativo = fila.shift() ?? null;
  emitir();
  atual?.resolver(confirmado);
}

/**
 * Pede confirmação ao usuário. Resolve `true` se confirmou, `false` caso
 * contrário.
 */
export function confirmar(
  titulo: string,
  mensagem: string,
  textoConfirmar = 'Confirmar',
): Promise<boolean> {
  return new Promise((resolve) => {
    enfileirar({
      tipo: 'confirmar',
      titulo,
      mensagem,
      textoConfirmar,
      tom: 'sucesso',
      resolver: resolve,
    });
  });
}

// Títulos que indicam erro/validação → janela com tom de alerta (vermelho).
const RE_ERRO = /erro|falha|obrigat|inv[aá]lid|curta|permiss|negad|n[ãa]o /i;

/** Exibe um aviso simples (informativo). Sucesso (verde) ou erro (vermelho). */
export function notificar(titulo: string, mensagem: string): void {
  enfileirar({
    tipo: 'notificar',
    titulo,
    mensagem,
    textoConfirmar: 'OK',
    tom: RE_ERRO.test(titulo) ? 'erro' : 'sucesso',
    resolver: () => {},
  });
}
