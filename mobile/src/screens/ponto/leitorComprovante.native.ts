/**
 * Captura do comprovante — implementação ANDROID/iOS (APK).
 *
 * Tira a foto e lê o texto NO APARELHO com o ML Kit (rápido e sem carregar o
 * servidor). Devolve o texto lido; se não conseguir ler, devolve null e o
 * usuário registra a hora manualmente. Não envia imagem para o servidor.
 */
import * as ImagePicker from 'expo-image-picker';
import TextRecognition from '@react-native-ml-kit/text-recognition';

export interface CapturaComprovante {
  /** Texto lido no aparelho (ML Kit). */
  texto?: string;
}

export async function capturarComprovante(): Promise<CapturaComprovante | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
  if (res.canceled || !res.assets?.[0]) return null;

  try {
    const resultado = await TextRecognition.recognize(res.assets[0].uri);
    const texto = resultado?.text?.trim();
    if (texto) return { texto };
  } catch {
    // Leitura on-device indisponível → cai no preenchimento manual.
  }
  return null;
}
