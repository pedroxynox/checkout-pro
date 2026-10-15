/**
 * Apoio compartilhado pelas peças da seção Feedforward: cores do semáforo,
 * URL da foto, seleção de imagem (câmera/galeria) e o rascunho de ponto do
 * formulário de criação com o cálculo do prazo.
 */
import * as ImagePicker from 'expo-image-picker';
import { API_BASE_URL } from '../../api/config';
import { ImagemSelecionada } from '../../api/services/checklist';
import { SituacaoPontoFeedforward } from '../../api/types';
import { cores } from '../../theme';
import { notificar } from '../../utils/dialogos';
import { hojeISO } from '../../utils/formato';

/** Cor do semáforo de cada situação de ponto. */
export const COR_SITUACAO: Record<SituacaoPontoFeedforward, string> = {
  EM_DIA: cores.verde,
  PROXIMO: cores.amarelo,
  VENCIDO: cores.vermelho,
  ATINGIDO: cores.verde,
  NAO_ATINGIDO: cores.vermelho,
};

/** URL absoluta de uma foto (a API devolve o caminho relativo). */
export function urlFoto(caminho: string): string {
  return `${API_BASE_URL.replace(/\/$/, '')}${caminho}`;
}

/**
 * Pede a permissão e abre a câmera ou a galeria. Devolve a imagem escolhida
 * ou `null` (cancelado / sem permissão — neste caso já avisa o usuário).
 */
export async function selecionarImagem(
  origem: 'camera' | 'galeria',
): Promise<ImagemSelecionada | null> {
  const permissao =
    origem === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permissao.granted) {
    notificar('Permissão necessária', 'Conceda o acesso para anexar a foto.');
    return null;
  }
  const res =
    origem === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.6,
        });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return {
    uri: a.uri,
    name: a.fileName ?? 'feedforward.jpg',
    mimeType: a.mimeType ?? 'image/jpeg',
  };
}

export type UnidadePrazo = 'dias' | 'semanas' | 'meses';

/** Rascunho de um ponto a melhorar no formulário de criação. */
export interface PontoRascunho {
  descricao: string;
  modo: 'DATA' | 'EM_X';
  dataISO: string;
  quantidade: string;
  unidade: UnidadePrazo;
}

/** Rascunho padrão: "em 30 dias". */
export function pontoVazio(hoje: string = hojeISO()): PontoRascunho {
  return {
    descricao: '',
    modo: 'EM_X',
    dataISO: hoje,
    quantidade: '30',
    unidade: 'dias',
  };
}

/**
 * Prazo (ISO yyyy-mm-dd) de um rascunho: a data exata, ou hoje + N
 * dias/semanas/meses (N mínimo 1; vazio/inválido vira 1).
 */
export function calcularPrazoISO(
  p: PontoRascunho,
  hoje: string = hojeISO(),
): string {
  if (p.modo === 'DATA') return p.dataISO;
  const n = Math.max(1, Math.round(Number(p.quantidade) || 0));
  const base = new Date(`${hoje}T00:00:00.000Z`);
  if (p.unidade === 'dias') base.setUTCDate(base.getUTCDate() + n);
  else if (p.unidade === 'semanas') base.setUTCDate(base.getUTCDate() + 7 * n);
  else base.setUTCMonth(base.getUTCMonth() + n);
  return base.toISOString().slice(0, 10);
}
