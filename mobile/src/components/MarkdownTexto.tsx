/**
 * Renderizador leve de Markdown para as respostas da assistente (Cluby).
 *
 * Suporta o essencial que os modelos costumam usar, sem dependências:
 * - **negrito**
 * - listas com "-" ou "*"
 * - listas numeradas "1." / "1)"
 * - títulos "# ..." (vira negrito)
 * - parágrafos / linhas em branco
 *
 * Assim o texto aparece bonito, sem os asteriscos crus do Markdown.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { cores, espacamento, tipografia } from '../theme';

/** Quebra um trecho em segmentos, aplicando **negrito**. */
function segmentosNegrito(texto: string): React.ReactNode[] {
  const nos: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let ultimo = 0;
  let chave = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(texto)) !== null) {
    if (m.index > ultimo) {
      nos.push(texto.slice(ultimo, m.index));
    }
    nos.push(
      <Text key={`b${chave++}`} style={estilos.negrito}>
        {m[1]}
      </Text>,
    );
    ultimo = regex.lastIndex;
  }
  if (ultimo < texto.length) {
    nos.push(texto.slice(ultimo));
  }
  return nos;
}

export function MarkdownTexto({
  conteudo,
}: {
  conteudo: string;
}): React.ReactElement {
  const linhas = conteudo.split('\n');
  return (
    <View>
      {linhas.map((linha, idx) => {
        const semEspaco = linha.replace(/^\s+/, '');
        const recuado = linha.length - semEspaco.length >= 2;
        const texto = semEspaco.trimEnd();

        if (texto === '') {
          return <View key={idx} style={estilos.espaco} />;
        }

        const bullet = texto.match(/^[*-]\s+(.*)$/);
        if (bullet) {
          return (
            <View
              key={idx}
              style={[estilos.itemLista, recuado && estilos.recuo]}
            >
              <Text style={estilos.marcador}>•</Text>
              <Text style={estilos.texto}>{segmentosNegrito(bullet[1])}</Text>
            </View>
          );
        }

        const numero = texto.match(/^(\d+)[.)]\s+(.*)$/);
        if (numero) {
          return (
            <View
              key={idx}
              style={[estilos.itemLista, recuado && estilos.recuo]}
            >
              <Text style={estilos.marcadorNum}>{numero[1]}.</Text>
              <Text style={estilos.texto}>{segmentosNegrito(numero[2])}</Text>
            </View>
          );
        }

        const titulo = texto.match(/^#{1,6}\s+(.*)$/);
        return (
          <Text
            key={idx}
            style={[estilos.texto, !!titulo && estilos.negrito]}
          >
            {segmentosNegrito(titulo ? titulo[1] : texto)}
          </Text>
        );
      })}
    </View>
  );
}

const estilos = StyleSheet.create({
  texto: {
    ...tipografia.corpo,
    color: cores.texto,
    marginVertical: 2,
  },
  negrito: {
    fontWeight: '700',
  },
  espaco: {
    height: espacamento.sm,
  },
  itemLista: {
    flexDirection: 'row',
    marginVertical: 2,
    paddingRight: espacamento.sm,
  },
  recuo: {
    paddingLeft: espacamento.md,
  },
  marcador: {
    ...tipografia.corpo,
    color: cores.primaria,
    marginRight: espacamento.sm,
    lineHeight: 22,
  },
  marcadorNum: {
    ...tipografia.corpo,
    color: cores.primaria,
    fontWeight: '700',
    marginRight: espacamento.sm,
    minWidth: 18,
  },
});

export default MarkdownTexto;
