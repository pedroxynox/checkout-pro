/**
 * Leitor de comprovante AO VIVO — versão WEB (e padrão).
 *
 * Na web não há leitor de câmera on-device (o OCR só existe no APK, via ML Kit;
 * o OCR de imagem no servidor foi desativado). Aqui o componente não renderiza
 * nada — o registro é feito manualmente. O Metro usa a versão `.native.tsx` no
 * APK.
 */
import React from 'react';

export interface PropsLeitorAoVivo {
  visivel: boolean;
  aoLer: (texto: string) => void;
  aoCancelar: () => void;
}

export function LeitorComprovanteAoVivo(
  _props: PropsLeitorAoVivo,
): React.ReactElement | null {
  return null;
}

export default LeitorComprovanteAoVivo;
