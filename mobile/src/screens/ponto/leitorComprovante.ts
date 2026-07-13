/**
 * Captura do comprovante — implementação WEB (e padrão).
 *
 * Na web NÃO há leitor: o OCR on-device existe só no APK (ML Kit) e o OCR de
 * imagem no servidor foi desativado para não sobrecarregá-lo. Aqui o registro
 * é feito manualmente, então não há captura. (O Metro usa a versão `.native.ts`
 * no APK.)
 */
export interface CapturaComprovante {
  texto?: string;
}

export async function capturarComprovante(): Promise<CapturaComprovante | null> {
  return null;
}
