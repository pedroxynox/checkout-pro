/**
 * Tela de Checklist (Req 5.1, 5.2).
 *
 * Para os checklists de abertura e fechamento do dia selecionado, exibe a
 * janela fixa de execução e o status (Pendente/Feito) e permite enviar a imagem
 * (galeria ou câmera) que marca o checklist como "Feito".
 */
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { checklistService } from '../../api/services';
import { StatusChecklist, TipoChecklist } from '../../api/types';
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
import { hojeISO } from '../../utils/formato';

const TIPOS: { tipo: TipoChecklist; titulo: string }[] = [
  { tipo: 'ABERTURA', titulo: 'Abertura' },
  { tipo: 'FECHAMENTO', titulo: 'Fechamento' },
];

function ChecklistCard({
  tipo,
  titulo,
  data,
}: {
  tipo: TipoChecklist;
  titulo: string;
  data: string;
}): React.ReactElement {
  const [enviando, setEnviando] = useState(false);

  const info = useRequisicao(
    async () => {
      const [janela, status] = await Promise.all([
        checklistService.janela(tipo),
        checklistService.status(tipo, data),
      ]);
      return { janela, status: status.status };
    },
    [tipo, data],
  );

  const enviar = async (origem: 'galeria' | 'camera') => {
    try {
      const permissao =
        origem === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissao.granted) {
        Alert.alert('Permissão necessária', 'Conceda o acesso para enviar a imagem.');
        return;
      }
      const resultado =
        origem === 'camera'
          ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.7,
            });
      if (resultado.canceled || !resultado.assets?.[0]) {
        return;
      }
      const asset = resultado.assets[0];
      setEnviando(true);
      await checklistService.enviarImagem(
        tipo,
        {
          uri: asset.uri,
          name: asset.fileName ?? `checklist-${tipo.toLowerCase()}.jpg`,
          mimeType: asset.mimeType ?? 'image/jpeg',
        },
        data,
      );
      Alert.alert('Enviado', `Checklist de ${titulo.toLowerCase()} marcado como Feito.`);
      info.recarregar();
    } catch (e) {
      Alert.alert('Erro', e instanceof ApiError ? e.message : 'Falha ao enviar a imagem.');
    } finally {
      setEnviando(false);
    }
  };

  const feito = info.dados?.status === ('FEITO' as StatusChecklist);

  return (
    <Cartao>
      <View style={styles.cabecalho}>
        <Text style={styles.titulo}>{titulo}</Text>
        {info.dados ? (
          <Selo
            texto={feito ? 'Feito' : 'Pendente'}
            cor={feito ? cores.verde : cores.amarelo}
            fundo={feito ? cores.verdeFundo : cores.amareloFundo}
          />
        ) : null}
      </View>

      {info.carregando ? (
        <Carregando />
      ) : info.erro ? (
        <MensagemErro mensagem={info.erro} aoTentarNovamente={info.recarregar} />
      ) : (
        <>
          <View style={styles.janela}>
            <Ionicons name="time-outline" size={16} color={cores.textoSecundario} />
            <Text style={styles.janelaTexto}>
              Janela: {info.dados?.janela.inicio} às {info.dados?.janela.fim}
            </Text>
          </View>
          <View style={styles.botoes}>
            <Botao
              titulo="Tirar foto"
              aoPressionar={() => void enviar('camera')}
              carregando={enviando}
              estilo={styles.botaoFlex}
            />
            <Botao
              titulo="Da galeria"
              variante="secundario"
              aoPressionar={() => void enviar('galeria')}
              carregando={enviando}
              estilo={styles.botaoFlex}
            />
          </View>
        </>
      )}
    </Cartao>
  );
}

export function ChecklistScreen(): React.ReactElement {
  const [data, setData] = useState(hojeISO());

  return (
    <Tela>
      <SeletorData valor={data} aoMudar={setData} rotulo="Dia" />
      {TIPOS.map((t) => (
        <ChecklistCard key={t.tipo} tipo={t.tipo} titulo={t.titulo} data={data} />
      ))}
    </Tela>
  );
}

const styles = StyleSheet.create({
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: espacamento.sm,
  },
  titulo: {
    ...tipografia.secao,
    color: cores.texto,
  },
  janela: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    marginBottom: espacamento.md,
  },
  janelaTexto: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  botoes: {
    flexDirection: 'row',
    gap: espacamento.sm,
  },
  botaoFlex: {
    flex: 1,
  },
});

export default ChecklistScreen;
