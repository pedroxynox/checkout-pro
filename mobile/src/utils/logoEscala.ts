/**
 * Logo da loja usada no RODAPÉ da escala publicada.
 *
 * Guardado como **data URI** (`data:image/png;base64,…`) de propósito: a escala
 * é convertida em imagem/PDF a partir de um SVG que precisa ser
 * **autossuficiente**. Um `<image>` apontando para uma URL externa não é
 * carregado durante a conversão para PNG — o rodapé sairia em branco, e só se
 * descobriria depois de enviar a escala à equipe.
 *
 * Para trocar o logo basta substituir o conteúdo desta constante. Enquanto ela
 * estiver vazia, o rodapé mostra apenas o nome da loja em texto — a escala
 * continua completa e legível, só sem a marca.
 */
export const LOGO_ESCALA_DATA_URI: string | null = null;

/** Proporção largura/altura do logo, usada para reservar o espaço no rodapé. */
export const LOGO_ESCALA_PROPORCAO = 1024 / 250;
