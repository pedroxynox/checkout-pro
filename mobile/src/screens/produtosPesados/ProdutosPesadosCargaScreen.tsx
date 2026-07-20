/**
 * Produtos pesados (balança) — CARGA do arquivo.
 *
 * Tela do Centro de Controle (gestão), liberada por PRODUTOS_PESADOS_GERENCIAR.
 * Recebe UM arquivo .txt exportado do ERP (todos os setores juntos) e SUBSTITUI
 * o catálogo inteiro. Mostra o estado atual: total de produtos, quando foi a
 * última atualização e a contagem por setor.
 */
import * as DocumentPicker from 'expo-document-picker';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { produtosPesadosService } from '../../api/services';
import {
  Aviso,
  Botao,
  Carregando,
  Cartao,
  LinhaInfo,
  MensagemErro,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, tipografia } from '../../theme';
import { notificar } from '../../utils/dialogos';
import { formatarDataHora } from '../../utils/formato';

async function escolherArquivo(): Promise<DocumentPicker.DocumentPickerAsset | null> {
  const escolha = await DocumentPicker.getDocumentAsync({
    type: ['text/plain', 'text/*', 'application/octet-stream', '*/*'],
    copyToCacheDirectory: true,
  });
  if (escolha.canceled || !escolha.assets?.[0]) {
    return null;
  }
  return escolha.assets[0];
}

interface AvisoTela {
  tom: 'ok' | 'erro';
  texto: string;
}

export function ProdutosPesadosCargaScreen(): React.ReactElement {
  const req = useRequisicao(() => produtosPesadosService.status(), []);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<AvisoTela | null>(null);

  const status = req.dados;

  const enviar = async () => {
    setAviso(null);
    try {
      const arquivo = await escolherArquivo();
      if (!arquivo) {
        return;
      }
      setEnviando(true);
      const r = await produtosPesadosService.upload({
        uri: arquivo.uri,
        name: arquivo.name,
        mimeType: arquivo.mimeType,
      });
      req.recarregar();
      const msg = `${r.total} produto(s) em ${r.categorias.length} setor(es).`;
      setAviso({ tom: 'ok', texto: `Catálogo atualizado. ${msg}` });
      notificar('Catálogo atualizado', msg);
    } catch (e) {
      const texto =
        e instanceof ApiError ? e.message : 'Falha ao carregar o arquivo.';
      setAviso({ tom: 'erro', texto });
      notificar('Erro no envio', texto);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Tela aoAtualizar={req.recarregar} atualizando={req.atualizando}>
      <Text style={styles.intro}>
        Carregue o arquivo .txt (exportado do ERP, com todos os setores) para
        atualizar os códigos de balança. O envio SUBSTITUI o catálogo inteiro.
      </Text>

      {aviso ? (
        <Aviso
          tom={aviso.tom === 'ok' ? 'sucesso' : 'alerta'}
          texto={aviso.texto}
        />
      ) : null}

      <Botao
        titulo={enviando ? 'Enviando...' : 'Selecionar arquivo .txt'}
        aoPressionar={enviar}
        carregando={enviando}
        estilo={{ marginBottom: espacamento.lg }}
      />

      {req.carregando ? (
        <Carregando />
      ) : req.erro ? (
        <MensagemErro mensagem={req.erro} aoTentarNovamente={req.recarregar} />
      ) : (
        <Cartao titulo="Catálogo atual">
          <LinhaInfo rotulo="Produtos" valor={status?.total ?? 0} />
          <LinhaInfo
            rotulo="Atualizado em"
            valor={
              status?.atualizadoEm
                ? formatarDataHora(status.atualizadoEm)
                : '—'
            }
          />
          {status && status.categorias.length > 0 ? (
            <View style={styles.setores}>
              <Text style={styles.setoresTitulo}>Por setor</Text>
              {status.categorias.map((c) => (
                <LinhaInfo
                  key={c.categoria}
                  rotulo={c.categoria}
                  valor={c.total}
                />
              ))}
            </View>
          ) : (
            <Text style={styles.vazio}>
              Nenhum produto carregado ainda.
            </Text>
          )}
        </Cartao>
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  intro: {
    ...tipografia.corpo,
    color: cores.textoSecundario,
    marginBottom: espacamento.md,
  },
  setores: {
    marginTop: espacamento.sm,
  },
  setoresTitulo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
    marginBottom: espacamento.xs,
  },
  vazio: {
    ...tipografia.corpo,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
  },
});

export default ProdutosPesadosCargaScreen;
