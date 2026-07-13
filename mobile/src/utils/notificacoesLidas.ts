/**
 * Estado "lida" das notificações — no lado do cliente.
 *
 * O backend não tem endpoint de "marcar como lida" (o campo `lida` existe no
 * banco, mas nunca é setado por API). Para o Centro de Notificações ter o
 * filtro "Não lidas/Lidas", o indicador por item e o "Marcar todas como lidas",
 * guardamos os IDs já lidos localmente (AsyncStorage). É leve e persiste entre
 * sessões. Limitamos o histórico para não crescer sem fim.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const CHAVE = '@cluby/notificacoes-lidas';
const LIMITE = 800;

/** Carrega os IDs de notificações já lidas (vazio em caso de erro). */
export async function carregarLidas(): Promise<string[]> {
  try {
    const bruto = await AsyncStorage.getItem(CHAVE);
    return bruto ? (JSON.parse(bruto) as string[]) : [];
  } catch {
    return [];
  }
}

/** Salva os IDs lidos (mantém apenas os mais recentes). */
export async function salvarLidas(ids: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CHAVE, JSON.stringify(ids.slice(-LIMITE)));
  } catch {
    // Persistência é best-effort; ignora falhas.
  }
}
