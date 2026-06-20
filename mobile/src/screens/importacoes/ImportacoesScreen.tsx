/**
 * Tela de Importações (carga dos arquivos do dia).
 *
 * Seção dedicada ao usuário de carga (perfil IMPORTADOR), deixado no computador
 * da loja. Aqui se **enviam** todos os arquivos .txt do dia: as 5 arrecadações
 * (Troco Solidário, Recargas, Cancelamentos e Devoluções) e as Vendas por hora.
 * O status consolidado (enviado/pendente) é visto na seção "Fechamento".
 */
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { arrecadacaoService, vendasService } from '../../api/services';
import { TipoArrecadacao } from '../../api/types';
import { Botao, Cartao, Selo, SeletorData, Tela } from '../../components';
import { cores, espacamento, tipografia } from '../../theme';
import { notificar } from '../../utils/dialogos';
import { formatarMoeda, hojeISO } from '../../utils/formato';
import { ARRECADACAO } from '../../utils/rotulos';

interface Aviso {
  tom: 'ok' | 'erro';
  texto: string;
}

/** Itens carregáveis: as 5 arrecadações + as vendas por hora. */
type ItemCarga = { id: TipoArrecadacao | 'VENDAS'; titulo: string; icone: string };

const ITENS: ItemCarga[] = [
  ...ARRECADACAO.map((d) => ({
    id: d.tipo as TipoArrecadacao,
    titulo: d.titulo,
    icone: d.icone,
  })),
  { id: 'VENDAS', titulo: 'Vendas por hora', icone: 'cash-outline' },
];

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

export function ImportacoesScreen(): React.ReactElement {
  const [data, setData] = useState(hojeISO());
  const [enviando, setEnviando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  // Estado local da sessão por item: o que foi feito hoje nesta tela.
  const [estado, setEstado] = useState<Record<string, 'carregado' | 'sem_movimento'>>({});

  // Ao trocar o dia, zera o estado local (refere-se ao dia anterior).
  useEffect(() => {
    setEstado({});
    setAviso(null);
  }, [data]);

  const enviar = async (item: ItemCarga) => {
    setAviso(null);
    try {
      const arquivo = await escolherArquivo();
      if (!arquivo) {
        return;
      }
      setEnviando(item.id);
      const ref = {
        uri: arquivo.uri,
        name: arquivo.name,
        mimeType: arquivo.mimeType,
      };
      let msg: string;
      if (item.id === 'VENDAS') {
        const r = await vendasService.upload(ref, data);
        msg = `Vendas: ${r.horas} hora(s), total ${formatarMoeda(r.total)}.`;
      } else {
        const r = await arrecadacaoService.upload(item.id, ref, data);
        msg = `${item.titulo}: ${r.quantidade} pessoa(s), total ${formatarMoeda(r.total)}.`;
      }
      setEstado((s) => ({ ...s, [item.id]: 'carregado' }));
      setAviso({ tom: 'ok', texto: `Arquivo carregado. ${msg}` });
      notificar('Arquivo carregado', msg);
    } catch (e) {
      const texto = e instanceof ApiError ? e.message : 'Falha ao carregar o arquivo.';
      setAviso({ tom: 'erro', texto });
      notificar('Erro no envio', texto);
    } finally {
      setEnviando(null);
    }
  };

  const marcarSemMovimento = async (item: ItemCarga) => {
    if (item.id === 'VENDAS') {
      return;
    }
    setEnviando(item.id);
    try {
      await arrecadacaoService.marcarSemMovimento(item.id, data);
      setEstado((s) => ({ ...s, [item.id]: 'sem_movimento' }));
      notificar('Marcado', `${item.titulo}: sem movimento no dia.`);
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao marcar.');
    } finally {
      setEnviando(null);
    }
  };

  return (
    <Tela>
      <SeletorData valor={data} aoMudar={setData} rotulo="Dia de referência" />

      <Cartao titulo="Carregar arquivos do dia">
        <Text style={styles.ajuda}>
          Envie o bloc de notas de cada arquivo do dia. Se um indicador não teve
          movimento (ex.: nenhum cancelamento), toque em &quot;Sem movimento&quot;.
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
        {ITENS.map((item) => {
          const st = estado[item.id];
          return (
            <View key={item.id} style={styles.item}>
              <View style={styles.tituloLinha}>
                <Ionicons
                  name={item.icone as keyof typeof Ionicons.glyphMap}
                  size={18}
                  color={cores.primaria}
                />
                <Text style={styles.nome}>{item.titulo}</Text>
                {st === 'carregado' ? (
                  <Selo texto="Carregado" cor={cores.verde} fundo={cores.verdeFundo} />
                ) : st === 'sem_movimento' ? (
                  <Selo
                    texto="Sem movimento"
                    cor={cores.textoSecundario}
                    fundo={cores.superficieAlternativa}
                  />
                ) : null}
              </View>
              <View style={styles.acoes}>
                <Botao
                  titulo="Carregar"
                  variante="secundario"
                  carregando={enviando === item.id}
                  aoPressionar={() => void enviar(item)}
                  estilo={styles.botao}
                />
                {item.id !== 'VENDAS' ? (
                  <Botao
                    titulo="Sem movimento"
                    variante="texto"
                    aoPressionar={() => void marcarSemMovimento(item)}
                  />
                ) : null}
              </View>
            </View>
          );
        })}
      </Cartao>
    </Tela>
  );
}

const styles = StyleSheet.create({
  ajuda: {
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
  item: {
    paddingVertical: espacamento.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  tituloLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    marginBottom: espacamento.xs,
  },
  nome: {
    ...tipografia.corpo,
    color: cores.texto,
    fontWeight: '600',
    flex: 1,
  },
  acoes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
  },
  botao: {
    minHeight: 40,
    paddingHorizontal: espacamento.md,
  },
});

export default ImportacoesScreen;
