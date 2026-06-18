/**
 * Registro local de insumos conhecidos (cache do app).
 *
 * O backend expõe ações por id de insumo (saldo, consumo, histórico, retirada)
 * e o cadastro, mas não um endpoint de listagem. Para que o app possa exibir os
 * saldos em tempo real, mantemos no dispositivo (AsyncStorage) a lista dos
 * insumos com os quais o usuário já interagiu (criados ou adicionados por id).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CategoriaInsumo } from '../api/types';

const CHAVE = 'stokcenter.insumos.registro';

export interface InsumoLocal {
  id: string;
  nome: string;
  categoria: CategoriaInsumo;
  limiteMinimo: number;
}

export async function listarInsumosLocais(): Promise<InsumoLocal[]> {
  const bruto = await AsyncStorage.getItem(CHAVE);
  if (!bruto) {
    return [];
  }
  try {
    const lista = JSON.parse(bruto) as InsumoLocal[];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

export async function salvarInsumoLocal(insumo: InsumoLocal): Promise<InsumoLocal[]> {
  const atuais = await listarInsumosLocais();
  const semDuplicata = atuais.filter((i) => i.id !== insumo.id);
  const nova = [...semDuplicata, insumo].sort((a, b) =>
    a.nome.localeCompare(b.nome),
  );
  await AsyncStorage.setItem(CHAVE, JSON.stringify(nova));
  return nova;
}

export async function removerInsumoLocal(id: string): Promise<InsumoLocal[]> {
  const atuais = await listarInsumosLocais();
  const nova = atuais.filter((i) => i.id !== id);
  await AsyncStorage.setItem(CHAVE, JSON.stringify(nova));
  return nova;
}
