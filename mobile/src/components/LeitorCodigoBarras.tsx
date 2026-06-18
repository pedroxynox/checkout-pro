/**
 * Leitor de código de barras (Req 3.1.1).
 *
 * Usa `expo-camera` (CameraView) para ler o código de barras de um fardo de
 * sacolas. Solicita permissão de câmera quando necessário e oferece **entrada
 * manual** como alternativa — útil em dispositivos sem câmera (ou no ambiente
 * de testes), mantendo a tela funcional. Apresentado como modal.
 */
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { cores, espacamento, raio, tipografia } from '../theme';
import { Botao } from './Botao';

interface LeitorProps {
  visivel: boolean;
  aoLer: (codigo: string) => void;
  aoFechar: () => void;
}

export function LeitorCodigoBarras({
  visivel,
  aoLer,
  aoFechar,
}: LeitorProps): React.ReactElement {
  const [permissao, solicitarPermissao] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [lido, setLido] = useState(false);

  const tratarLeitura = (codigo: string) => {
    if (lido || !codigo) {
      return;
    }
    setLido(true);
    aoLer(codigo);
    setManual('');
    setTimeout(() => setLido(false), 800);
  };

  const podeUsarCamera = permissao?.granted === true;

  return (
    <Modal visible={visivel} animationType="slide" onRequestClose={aoFechar}>
      <View style={styles.container}>
        <View style={styles.topo}>
          <Text style={styles.titulo}>Ler código de barras</Text>
          <Pressable onPress={aoFechar} hitSlop={12} accessibilityLabel="Fechar">
            <Ionicons name="close" size={26} color={cores.texto} />
          </Pressable>
        </View>

        <View style={styles.cameraArea}>
          {podeUsarCamera ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              barcodeScannerSettings={{
                barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'upc_a'],
              }}
              onBarcodeScanned={({ data }) => tratarLeitura(data)}
            />
          ) : (
            <View style={styles.semCamera}>
              <Ionicons name="camera-outline" size={48} color={cores.textoSecundario} />
              <Text style={styles.semCameraTexto}>
                {permissao
                  ? 'Permissão de câmera necessária para a leitura automática.'
                  : 'Verificando permissão da câmera...'}
              </Text>
              {permissao && !permissao.granted ? (
                <Botao
                  titulo="Permitir câmera"
                  variante="secundario"
                  aoPressionar={() => void solicitarPermissao()}
                />
              ) : null}
            </View>
          )}
        </View>

        <View style={styles.manualArea}>
          <Text style={styles.manualRotulo}>Ou informe o código manualmente</Text>
          <View style={styles.manualLinha}>
            <TextInput
              style={styles.manualInput}
              value={manual}
              onChangeText={setManual}
              placeholder="Código de barras"
              placeholderTextColor={cores.textoSecundario}
              keyboardType="default"
              autoCapitalize="none"
            />
            <Botao
              titulo="Confirmar"
              aoPressionar={() => tratarLeitura(manual.trim())}
              estilo={styles.botaoConfirmar}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: cores.fundo,
    paddingTop: 48,
  },
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: espacamento.lg,
    paddingBottom: espacamento.md,
  },
  titulo: {
    ...tipografia.subtitulo,
    color: cores.texto,
  },
  cameraArea: {
    flex: 1,
    margin: espacamento.lg,
    borderRadius: raio.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  semCamera: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacamento.md,
    padding: espacamento.xl,
    backgroundColor: cores.superficie,
    flex: 1,
  },
  semCameraTexto: {
    ...tipografia.corpo,
    color: cores.textoSecundario,
    textAlign: 'center',
  },
  manualArea: {
    padding: espacamento.lg,
  },
  manualRotulo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginBottom: espacamento.sm,
  },
  manualLinha: {
    flexDirection: 'row',
    gap: espacamento.sm,
  },
  manualInput: {
    flex: 1,
    minHeight: 48,
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.md,
    paddingHorizontal: espacamento.md,
    color: cores.texto,
  },
  botaoConfirmar: {
    paddingHorizontal: espacamento.lg,
  },
});

export default LeitorCodigoBarras;
