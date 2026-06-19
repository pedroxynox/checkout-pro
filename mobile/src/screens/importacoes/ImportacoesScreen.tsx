/**
 * Tela de Importações (Req 1.2, 1.3).
 *
 * Exibe o status diário de cada um dos quatro arquivos (importado/pendente)
 * para a data selecionada, permite enviar (upload) um arquivo CSV/XLSX por tipo
 * e lista o histórico de importações com os nomes não reconhecidos.
 */
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { arrecadacaoService, importacoesService } from '../../api/services';
import { StatusDia, TipoArquivo, TipoArrecadacao } from '../../api/types';
import {
  Aviso,
  Botao,
  Carregando,
  Cartao,
  EstadoVazio,
  MensagemErro,
  Selo,
  SeletorData,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, tipografia } from '../../theme';
import { formatarData, formatarDataHora, formatarMoeda, hojeISO } from '../../utils/formato';
import {
  ARRECADACAO,
  ROTULO_TIPO_ARQUIVO,
  TIPOS_ARQUIVO,
} from '../../utils/rotulos';

export function ImportacoesScreen(): React.ReactElement {
  const [data, setData] = useState(hojeISO());
  const [enviando, setEnviando] = useState<TipoArquivo | null>(null);
  const [enviandoTxt, setEnviandoTxt] = useState<TipoArrecadacao | null>(null);

  const status = useRequisicao<StatusDia>(
    () => importacoesService.statusDoDia(data),
    [data],
  );
  const historico = useRequisicao(
    () => importacoesService.historico(),
    [],
  );

  const recarregarTudo = () => {
    status.recarregar();
    historico.recarregar();
  };

  const enviarTxtIndicador = async (tipo: TipoArrecadacao) => {
    try {
      const escolha = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'text/*', 'application/octet-stream', '*/*'],
        copyToCacheDirectory: true,
      });
      if (escolha.canceled || !escolha.assets?.[0]) {
        return;
      }
      const arquivo = escolha.assets[0];
      setEnviandoTxt(tipo);
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
        'Arquivo importado',
        `${titulo}: ${resultado.quantidade} operador(es), total ${formatarMoeda(resultado.total)}.`,
      );
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : 'Falha ao enviar o arquivo.';
      Alert.alert('Erro na importação', msg);
    } finally {
      setEnviandoTxt(null);
    }
  };

  const enviarArquivo = async (tipo: TipoArquivo) => {
    try {
      const escolha = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'text/comma-separated-values',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ],
        copyToCacheDirectory: true,
      });
      if (escolha.canceled || !escolha.assets?.[0]) {
        return;
      }
      const arquivo = escolha.assets[0];
      setEnviando(tipo);
      const resultado = await importacoesService.upload(
        tipo,
        {
          uri: arquivo.uri,
          name: arquivo.name,
          mimeType: arquivo.mimeType,
        },
        data,
      );
      const naoReconhecidos = resultado.nomesNaoReconhecidos.length;
      Alert.alert(
        'Importação concluída',
        `${ROTULO_TIPO_ARQUIVO[tipo]} importado.` +
          (naoReconhecidos > 0
            ? `\n${naoReconhecidos} nome(s) não reconhecido(s) para revisão.`
            : ''),
      );
      recarregarTudo();
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : 'Falha ao enviar o arquivo.';
      Alert.alert('Erro na importação', msg);
    } finally {
      setEnviando(null);
    }
  };

  return (
    <Tela aoAtualizar={recarregarTudo} atualizando={status.atualizando}>
      <SeletorData valor={data} aoMudar={setData} rotulo="Dia de referência" />

      <Cartao titulo="Status do dia">
        {status.carregando ? (
          <Carregando />
        ) : status.erro ? (
          <MensagemErro mensagem={status.erro} aoTentarNovamente={status.recarregar} />
        ) : (
          TIPOS_ARQUIVO.map((tipo) => {
            const importado = status.dados?.[tipo] === 'importado';
            return (
              <View key={tipo} style={styles.linhaTipo}>
                <View style={styles.tipoTextos}>
                  <Text style={styles.tipoNome}>{ROTULO_TIPO_ARQUIVO[tipo]}</Text>
                  <Selo
                    texto={importado ? 'Importado' : 'Pendente'}
                    cor={importado ? cores.verde : cores.amarelo}
                    fundo={importado ? cores.verdeFundo : cores.amareloFundo}
                  />
                </View>
                <Botao
                  titulo={importado ? 'Reenviar' : 'Enviar'}
                  variante="secundario"
                  carregando={enviando === tipo}
                  aoPressionar={() => void enviarArquivo(tipo)}
                  estilo={styles.botaoEnviar}
                />
              </View>
            );
          })
        )}
      </Cartao>

      <Cartao titulo="Indicadores (arquivos .txt)">
        <Text style={styles.ajudaTexto}>
          Envie o bloc de notas de cada indicador do dia selecionado. O app
          separa por operador e atualiza os Indicadores.
        </Text>
        {ARRECADACAO.map((def) => (
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
              <Text style={styles.tipoDescricao}>{def.descricao}</Text>
            </View>
            <Botao
              titulo="Enviar"
              variante="secundario"
              carregando={enviandoTxt === def.tipo}
              aoPressionar={() => void enviarTxtIndicador(def.tipo)}
              estilo={styles.botaoEnviar}
            />
          </View>
        ))}
      </Cartao>

      <Text style={styles.tituloSecao}>Histórico</Text>
      {historico.carregando ? (
        <Carregando />
      ) : historico.erro ? (
        <MensagemErro
          mensagem={historico.erro}
          aoTentarNovamente={historico.recarregar}
        />
      ) : !historico.dados || historico.dados.length === 0 ? (
        <EstadoVazio
          icone="time-outline"
          titulo="Sem importações"
          descricao="Os arquivos importados aparecerão aqui."
        />
      ) : (
        historico.dados.map((reg) => (
          <Cartao key={reg.id}>
            <View style={styles.histTopo}>
              <Ionicons
                name="document-text-outline"
                size={18}
                color={cores.primaria}
              />
              <Text style={styles.histTipo}>{ROTULO_TIPO_ARQUIVO[reg.tipo]}</Text>
            </View>
            <Text style={styles.histLinha}>
              Referência: {formatarData(reg.dataReferencia)}
            </Text>
            <Text style={styles.histLinha}>
              Importado em: {formatarDataHora(reg.importadoEm)}
            </Text>
            {reg.nomesNaoReconhecidos.length > 0 ? (
              <Aviso
                tom="alerta"
                texto={`${reg.nomesNaoReconhecidos.length} nome(s) não reconhecido(s): ${reg.nomesNaoReconhecidos.join(', ')}`}
              />
            ) : null}
          </Cartao>
        ))
      )}
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
  tipoNome: {
    ...tipografia.corpo,
    color: cores.texto,
    fontWeight: '600',
  },
  tipoTituloLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
  },
  tipoDescricao: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
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
  tituloSecao: {
    ...tipografia.secao,
    color: cores.texto,
    marginBottom: espacamento.md,
    marginTop: espacamento.sm,
  },
  histTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    marginBottom: espacamento.xs,
  },
  histTipo: {
    ...tipografia.corpo,
    fontWeight: '700',
    color: cores.texto,
  },
  histLinha: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
});

export default ImportacoesScreen;
