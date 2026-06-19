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

interface Aviso {
  tom: 'ok' | 'erro';
  texto: string;
}

export function ImportacoesScreen(): React.ReactElement {
  const [data, setData] = useState(hojeISO());
  const [enviando, setEnviando] = useState<TipoArrecadacao | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const status = useRequisicao<StatusArrecadacao>(
    () => arrecadacaoService.status(data),
    [data],
  );

  const enviarArquivo = async (tipo: TipoArrecadacao) => {
    setAviso(null);
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
      const msg = `${titulo}: ${resultado.quantidade} pessoa(s), total ${formatarMoeda(resultado.total)}.`;
      setAviso({ tom: 'ok', texto: `Arquivo enviado. ${msg}` });
      Alert.alert('Arquivo enviado', msg);
      status.recarregar();
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : 'Falha ao enviar o arquivo.';
      setAviso({ tom: 'erro', texto: msg });
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
        {aviso ? (
          <View
            style={[
              styles.aviso,
              {
                backgroundColor:
                  aviso.tom === 'ok' ? cores.verdeFundo : cores.vermelhoFundo,
              },
            ]}
          >
            <Text
              style={[
                styles.avisoTexto,
                { color: aviso.tom === 'ok' ? cores.verde : cores.vermelho },
              ]}
            >
              {aviso.texto}
            </Text>
          </View>
        ) : null}
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
  aviso: {
    borderRadius: 8,
    padding: espacamento.sm,
    marginBottom: espacamento.sm,
  },
  avisoTexto: {
    ...tipografia.legenda,
    fontWeight: '600',
  },
  botaoEnviar: {
    minHeight: 40,
    paddingHorizontal: espacamento.md,
  },
});

export default ImportacoesScreen;
