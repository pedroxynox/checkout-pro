/**
 * Captura do comprovante — implementação WEB (e padrão).
 *
 * Na web, tira/seleciona uma foto e devolve a imagem (base64); o OCR roda no
 * NOSSO servidor (tesseract), pois o navegador não tem o leitor on-device. No
 * Android, o Metro usa a versão `.native.ts` (ML Kit no aparelho).
 */
import * as ImagePicker from 'expo-image-picker';

export interface CapturaComprovante {
  /** Texto já lido no aparelho (Android/ML Kit). */
  texto?: string;
  /** Imagem em base64 para o OCR do servidor (web/fallback). */
  imagem?: string;
}

export async function capturarComprovante(): Promise<CapturaComprovante | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.6,
    base64: true,
  });
  const asset = res.assets?.[0];
  if (res.canceled || !asset?.base64) return null;
  return { imagem: asset.base64 };
}
