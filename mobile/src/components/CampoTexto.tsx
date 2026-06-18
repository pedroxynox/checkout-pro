/** Campo de texto rotulado, com suporte a erro e tipos comuns de teclado. */
import React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import { cores, espacamento, raio, tipografia } from '../theme';

interface CampoTextoProps extends TextInputProps {
  rotulo: string;
  erro?: string | null;
}

export function CampoTexto({
  rotulo,
  erro,
  style,
  ...props
}: CampoTextoProps): React.ReactElement {
  return (
    <View style={styles.container}>
      <Text style={styles.rotulo}>{rotulo}</Text>
      <TextInput
        placeholderTextColor={cores.textoSecundario}
        style={[styles.input, erro ? styles.inputErro : null, style]}
        {...props}
      />
      {erro ? <Text style={styles.erro}>{erro}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: espacamento.md,
  },
  rotulo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginBottom: espacamento.xs,
  },
  input: {
    minHeight: 48,
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.md,
    paddingHorizontal: espacamento.md,
    color: cores.texto,
    fontSize: 15,
  },
  inputErro: {
    borderColor: cores.erro,
  },
  erro: {
    ...tipografia.legenda,
    color: cores.erro,
    marginTop: espacamento.xs,
  },
});

export default CampoTexto;
