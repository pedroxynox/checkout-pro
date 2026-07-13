/**
 * Captura do papelito — implementação ANDROID/iOS (APK).
 *
 * Tira a foto e lê o texto NO APARELHO com o ML Kit (o "modelo bom", rápido e
 * sem internet para a leitura). Se o leitor on-device falhar por algum motivo,
 * cai automaticamente para o OCR do NOSSO servidor (envia a imagem) — assim o
 * registro nunca fica travado.
 */
import * as ImagePicker from 'expo-image-picker';
import TextRecognition from '@react-native-ml-kit/text-recognition';

export interface CapturaPapelito {
  texto?: string;
  imagem?: string;
}

export async function capturarPapelito(): Promise<CapturaPapelito | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true });
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];

  try {
    const resultado = await TextRecognition.recognize(asset.uri);
    const texto = resultado?.text?.trim();
    if (texto) return { texto };
  } catch {
    // Leitura on-device indisponível → usa o OCR do servidor.
  }
  return asset.base64 ? { imagem: asset.base64 } : null;
}
