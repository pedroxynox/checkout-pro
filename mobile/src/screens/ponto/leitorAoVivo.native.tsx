/**
 * Leitor de comprovante AO VIVO — implementação ANDROID/iOS (APK).
 *
 * Mostra a câmera em tempo real e escaneia sozinho: a cada ~1,2s captura um
 * quadro discretamente, lê o texto NO APARELHO (ML Kit) e, quando o texto já
 * parece um comprovante completo (`leituraCompleta`), captura automaticamente e
 * devolve o texto — sem o usuário precisar apertar nada. Há também um botão
 * "Capturar agora" como reforço manual. Nada é enviado ao servidor aqui; a
 * interpretação final (nome/data/hora) é feita depois pelo endpoint de leitura.
 */
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { leituraCompleta } from './leituraComprovanteUtil';

export interface PropsLeitorAoVivo {
  visivel: boolean;
  /** Chamado com o texto lido (automático ou manual). */
  aoLer: (texto: string) => void;
  aoCancelar: () => void;
}

// Intervalo entre tentativas de leitura automática (equilibra rapidez e CPU).
const INTERVALO_MS = 1200;
// Após algumas tentativas sem sucesso, sugerimos aproximar/segurar firme.
const TENTATIVAS_ATE_DICA = 4;

export function LeitorComprovanteAoVivo({
  visivel,
  aoLer,
  aoCancelar,
}: PropsLeitorAoVivo): React.ReactElement | null {
  const [permissao, pedirPermissao] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [pronta, setPronta] = useState(false);
  const [tentativas, setTentativas] = useState(0);
  const ocupado = useRef(false);
  const ativo = useRef(true);

  // Pede a permissão da câmera ao abrir, se ainda não concedida.
  useEffect(() => {
    if (visivel && permissao && !permissao.granted && permissao.canAskAgain) {
      void pedirPermissao();
    }
  }, [visivel, permissao, pedirPermissao]);

  const lerFrame = useCallback(
    async (automatico: boolean): Promise<void> => {
      if (ocupado.current || !cameraRef.current) return;
      ocupado.current = true;
      try {
        const foto = await cameraRef.current.takePictureAsync({
          quality: 0.5,
          skipProcessing: true,
        });
        if (!foto?.uri || !ativo.current) return;
        const r = await TextRecognition.recognize(foto.uri);
        const texto = r?.text?.trim();
        if (!ativo.current) return;
        // No modo automático só aceita quando a leitura parece completa; no
        // manual ("Capturar agora") aceita o que houver (o usuário confirma).
        if (texto && (!automatico || leituraCompleta(texto))) {
          ativo.current = false;
          aoLer(texto);
          return;
        }
        if (automatico) setTentativas((n) => n + 1);
      } catch {
        // Quadro ruim/borrado: ignora e tenta no próximo ciclo.
      } finally {
        ocupado.current = false;
      }
    },
    [aoLer],
  );

  // Loop de leitura automática enquanto a câmera está pronta e visível.
  useEffect(() => {
    if (!visivel || !pronta) return;
    ativo.current = true;
    setTentativas(0);
    const timer = setInterval(() => {
      void lerFrame(true);
    }, INTERVALO_MS);
    return () => {
      ativo.current = false;
      clearInterval(timer);
    };
  }, [visivel, pronta, lerFrame]);

  if (!visivel) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={aoCancelar}>
      <View style={styles.container}>
        {permissao?.granted ? (
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            animateShutter={false}
            onCameraReady={() => setPronta(true)}
          />
        ) : (
          <View style={styles.semPermissao}>
            <Ionicons name="camera-outline" size={48} color={cores.textoInverso} />
            <Text style={styles.semPermissaoTexto}>
              Precisamos da câmera para ler o comprovante.
            </Text>
            <Pressable style={styles.botaoClaro} onPress={() => void pedirPermissao()}>
              <Text style={styles.botaoClaroTexto}>Permitir câmera</Text>
            </Pressable>
          </View>
        )}

        {/* Moldura-guia + dica (não intercepta toques). */}
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.moldura} />
          <Text style={styles.dica}>
            Aponte para o comprovante. A leitura é automática.
          </Text>
          {tentativas >= TENTATIVAS_ATE_DICA ? (
            <Text style={styles.dicaExtra}>
              Aproxime, segure firme e evite reflexos. Ou toque em “Capturar”.
            </Text>
          ) : null}
        </View>

        {/* Barra inferior: cancelar / status / capturar agora. */}
        <View style={styles.barra}>
          <Pressable
            style={styles.botaoBarra}
            onPress={() => {
              ativo.current = false;
              aoCancelar();
            }}
          >
            <Ionicons name="close" size={24} color={cores.textoInverso} />
            <Text style={styles.barraTexto}>Cancelar</Text>
          </Pressable>

          <View style={styles.status}>
            <ActivityIndicator color={cores.textoInverso} />
            <Text style={styles.barraTexto}>Lendo…</Text>
          </View>

          <Pressable style={styles.botaoBarra} onPress={() => void lerFrame(false)}>
            <Ionicons name="camera" size={24} color={cores.textoInverso} />
            <Text style={styles.barraTexto}>Capturar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: espacamento.xl,
  },
  moldura: {
    width: '86%',
    height: '54%',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: raio.lg,
    backgroundColor: 'transparent',
  },
  dica: {
    ...tipografia.rotulo,
    color: cores.textoInverso,
    textAlign: 'center',
    marginTop: espacamento.lg,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: espacamento.md,
    paddingVertical: espacamento.xs,
    borderRadius: raio.pill,
    overflow: 'hidden',
  },
  dicaExtra: {
    ...tipografia.legenda,
    color: cores.textoInverso,
    textAlign: 'center',
    marginTop: espacamento.sm,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: espacamento.md,
    paddingVertical: espacamento.xs,
    borderRadius: raio.pill,
    overflow: 'hidden',
  },
  barra: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: espacamento.xl,
    paddingTop: espacamento.lg,
    paddingBottom: espacamento.xl,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  botaoBarra: {
    alignItems: 'center',
    gap: 2,
    minWidth: 72,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
  },
  barraTexto: {
    ...tipografia.legenda,
    color: cores.textoInverso,
    fontWeight: '700',
  },
  semPermissao: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacamento.md,
    padding: espacamento.xl,
  },
  semPermissaoTexto: {
    ...tipografia.rotulo,
    color: cores.textoInverso,
    textAlign: 'center',
  },
  botaoClaro: {
    backgroundColor: cores.textoInverso,
    paddingHorizontal: espacamento.lg,
    paddingVertical: espacamento.md,
    borderRadius: raio.md,
  },
  botaoClaroTexto: {
    ...tipografia.rotulo,
    color: cores.primaria,
    fontWeight: '700',
  },
});

export default LeitorComprovanteAoVivo;
