/**
 * Renderiza um "procedimento guiado": o passo a passo RESUMIDO pela Cluby
 * (texto em markdown) intercalado com as fotos reais do manual, no ponto certo.
 */
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { API_BASE_URL } from '../api/config';
import { BlocoProcedimento } from '../api/types';
import { cores, espacamento, raio, tipografia } from '../theme';
import { MarkdownTexto } from './MarkdownTexto';

function urlImagem(caminho: string): string {
  return `${API_BASE_URL.replace(/\/$/, '')}${caminho}`;
}

export function ProcedimentoView({
  titulo,
  blocos,
}: {
  titulo: string;
  blocos: BlocoProcedimento[];
}): React.ReactElement {
  return (
    <View style={estilos.container}>
      <View style={estilos.cabecalho}>
        <Text style={estilos.cabecalhoIcone}>📋</Text>
        <Text style={estilos.cabecalhoTitulo}>{titulo}</Text>
      </View>

      {blocos.map((b, i) =>
        b.tipo === 'imagem' && b.imagem ? (
          <Image
            key={i}
            source={{ uri: urlImagem(b.imagem) }}
            style={[
              estilos.imagem,
              b.w && b.h ? { aspectRatio: b.w / b.h } : null,
            ]}
            resizeMode="contain"
          />
        ) : (
          <View key={i} style={estilos.textoBloco}>
            <MarkdownTexto conteudo={b.conteudo ?? ''} />
          </View>
        ),
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  container: {
    marginTop: espacamento.md,
    paddingTop: espacamento.md,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
  },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    backgroundColor: cores.primariaClara,
    paddingHorizontal: espacamento.md,
    paddingVertical: espacamento.sm,
    borderRadius: raio.md,
    marginBottom: espacamento.sm,
  },
  cabecalhoIcone: {
    fontSize: 16,
  },
  cabecalhoTitulo: {
    ...tipografia.rotulo,
    flex: 1,
    color: cores.primaria,
    fontWeight: '800',
  },
  textoBloco: {
    marginVertical: espacamento.xs,
  },
  imagem: {
    width: '100%',
    borderRadius: raio.md,
    marginVertical: espacamento.sm,
    backgroundColor: cores.fundo,
    borderWidth: 1,
    borderColor: cores.borda,
  },
});

export default ProcedimentoView;
