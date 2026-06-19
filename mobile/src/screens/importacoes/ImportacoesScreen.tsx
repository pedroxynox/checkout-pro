/**
 * Tela de Importações.
 *
 * O fiscal do fechamento envia, para o dia selecionado, o arquivo .txt (bloc
 * de notas) de cada indicador: Troco Solidário, Recargas de Celular,
 * Cancelamento de Itens, Cancelamento de Cupom e Devoluções. Cada tipo mostra
 * se já foi enviado (Enviado) ou ainda está pendente (Pendente) no dia.
 */
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { arrecadacaoService } from '../../api/services';
import { StatusArrecadacao, TipoArrecadacao } from '../../api/types';
import {
  Botao,
  Carregando,
  Cartao,
  MensagemErro,
  Selo,
  SeletorData,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, tipografia } from '../../theme';
import { formatarMoeda, hojeISO } from '../../utils/formato';
import { ARRECADACAO } from '../../utils/rotulos';

export function ImportacoesScreen(): React.ReactElement {
  const [data, setData] = useState(hojeISO());
  const [enviando, setEnviando] = useState<TipoArrecadacao | null>(null);

  const status = useRequisicao<StatusArrecadacao>(
    () => arrecadacaoService.status(data),
    [data],
  );

  const enviarArquivo = async (tipo: TipoArrecadacao) => {
    try {
      const escolha = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'text/*', 'application/octet-stream', '*/*'],
        copyToCacheDirectory: true,
      });
      if (escolha.canceled || !escolha.assets?.[0]) {
        return;
      }
      const arquivo = escolha.assets[0];
      setEnviando(tipo);
      const resultado = await arrecadacaoService.upload(
        tipo,
        {
          uri: arquivo.uri,
          name: arquivo.name,
          mimeType: arquivo.mimeType,
        },
        data,
      );
      const titulo =
        ARRECADACAO.find((d) => d.tipo === tipo)?.titulo ?? 'Indicador';
      Alert.alert(
        'Arquivo enviado',
        `${titulo}: ${resultado.quantidade} pessoa(s), total ${formatarMoeda(resultado.total)}.`,
      );
      status.recarregar();
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : 'Falha ao enviar o arquivo.';
      Alert.alert('Erro no envio', msg);
    } finally {
      setEnviando(null);
    }
  };

  return (
    <Tela aoAtualizar={status.recarregar} atualizando={status.atualizando}>
      <SeletorData valor={data} aoMudar={setData} rotulo="Dia de referência" />

      <Cartao titulo="Indicadores">
        <Text style={styles.ajudaTexto}>
          Envie o bloc de notas de cada indicador do dia selecionado. O app
          separa por pessoa e atualiza os Indicadores.
        </Text>
        {status.erro ? (
          <MensagemErro mensagem={status.erro} aoTentarNovamente={status.recarregar} />
        ) : null}
        {ARRECADACAO.map((def) => {
          const enviado = status.dados?.[def.tipo] === true;
          return (
            <View key={def.tipo} style={styles.linhaTipo}>
              <View style={styles.tipoTextos}>
                <View style={styles.tipoTituloLinha}>
                  <Ionicons
                    name={def.icone as keyof typeof Ionicons.glyphMap}
                    size={18}
                    color={cores.primaria}
                  />
                  <Text style={styles.tipoNome}>{def.titulo}</Text>
                </View>
                {status.carregando ? (
                  <Carregando />
                ) : (
                  <Selo
                    texto={enviado ? 'Enviado' : 'Pendente'}
                    cor={enviado ? cores.verde : cores.amarelo}
                    fundo={enviado ? cores.verdeFundo : cores.amareloFundo}
                  />
                )}
              </View>
              <Botao
                titulo={enviado ? 'Reenviar' : 'Enviar'}
                variante="secundario"
                carregando={enviando === def.tipo}
                aoPressionar={() => void enviarArquivo(def.tipo)}
                estilo={styles.botaoEnviar}
              />
            </View>
          );
        })}
      </Cartao>
    </Tela>
  );
}

const styles = StyleSheet.create({
  linhaTipo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: espacamento.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  tipoTextos: {
    flex: 1,
    gap: espacamento.xs,
  },
  tipoTituloLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
  },
  tipoNome: {
    ...tipografia.corpo,
    color: cores.texto,
    fontWeight: '600',
  },
  ajudaTexto: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.sm,
  },
  botaoEnviar: {
    minHeight: 40,
    paddingHorizontal: espacamento.md,
  },
});

export default ImportacoesScreen;
