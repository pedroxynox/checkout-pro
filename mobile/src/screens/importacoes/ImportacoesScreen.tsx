/**
 * Tela de Importacoes (carga dos arquivos do dia).
 *
 * Secao dedicada ao usuario de carga (perfil IMPORTADOR), deixado no computador
 * da loja. Aqui se enviam todos os arquivos .txt do dia: as 5 arrecadacoes
 * (Troco Solidario, Recargas, Cancelamentos e Devolucoes) e as Vendas por hora.
 *
 * Os arquivos seguem uma sequencia (1 a 6). Cada um, ao ser carregado, fica
 * marcado como "Carregado" de forma persistente (status real do servidor), e a
 * tela mostra o progresso (X de N) e qual e o proximo a carregar.
 */
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { arrecadacaoService, vendasService } from '../../api/services';
import {
  StatusArquivoArrecadacao,
  StatusArrecadacao,
  TipoArrecadacao,
} from '../../api/types';
import {
  Botao,
  Carregando,
  Cartao,
  MensagemErro,
  Selo,
  SeletorData,
  Tela,
} from '../../components';
import { useConfigSistema } from '../../config/ConfigSistemaContext';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { notificar } from '../../utils/dialogos';
import { formatarMoeda, hojeISO } from '../../utils/formato';
import { ARRECADACAO } from '../../utils/rotulos';

interface Aviso {
  tom: 'ok' | 'erro';
  texto: string;
}

/** Itens carregaveis: as 5 arrecadacoes + as vendas por hora. */
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
  const { dataInicial } = useConfigSistema();
  const [data, setData] = useState(hojeISO());
  const [enviando, setEnviando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  // Status real do servidor (persistente): o que ja foi carregado no dia.
  const req = useRequisicao(async () => {
    const [arrecadacao, vendas] = await Promise.all([
      arrecadacaoService.status(data),
      vendasService.status(data),
    ]);
    return { arrecadacao, vendas };
  }, [data]);

  const arrecadacao: StatusArrecadacao | undefined = req.dados?.arrecadacao;

  const statusDe = (item: ItemCarga): StatusArquivoArrecadacao => {
    if (item.id === 'VENDAS') {
      return req.dados?.vendas?.enviado ? 'ENVIADO' : 'PENDENTE';
    }
    return (arrecadacao?.[item.id] ?? 'PENDENTE') as StatusArquivoArrecadacao;
  };

  // Progresso (a sequencia): quantos dos N ja estao resolvidos.
  const resolvidos = ITENS.filter((i) => statusDe(i) !== 'PENDENTE').length;
  // Primeiro pendente = o proximo da sequencia.
  const proximoId = ITENS.find((i) => statusDe(i) === 'PENDENTE')?.id ?? null;

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
      let fechou: boolean;
      if (item.id === 'VENDAS') {
        const r = await vendasService.upload(ref, data);
        msg = `Vendas: ${r.horas} hora(s), total ${formatarMoeda(r.total)}.`;
        fechou = r.fechamentoConcluido;
      } else {
        const r = await arrecadacaoService.upload(item.id, ref, data);
        msg = `${item.titulo}: ${r.quantidade} pessoa(s), total ${formatarMoeda(r.total)}.`;
        fechou = r.fechamentoConcluido;
      }
      // Recarrega o status real (mantem a marca de "Carregado" persistente).
      req.recarregar();
      if (fechou) {
        setAviso({ tom: 'ok', texto: 'Fechamento realizado com sucesso!' });
        notificar(
          'Fechamento realizado com sucesso!',
          'Todos os arquivos do dia foram enviados. Os gestores foram avisados.',
        );
      } else {
        setAviso({ tom: 'ok', texto: `Arquivo carregado. ${msg}` });
        notificar('Arquivo carregado', msg);
      }
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
      const r = await arrecadacaoService.marcarSemMovimento(item.id, data);
      req.recarregar();
      if (r.fechamentoConcluido) {
        setAviso({ tom: 'ok', texto: 'Fechamento realizado com sucesso!' });
        notificar(
          'Fechamento realizado com sucesso!',
          'Todos os arquivos do dia foram enviados. Os gestores foram avisados.',
        );
      } else {
        notificar('Marcado', `${item.titulo}: sem movimento no dia.`);
      }
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao marcar.');
    } finally {
      setEnviando(null);
    }
  };

  function seloDe(status: StatusArquivoArrecadacao): React.ReactElement | null {
    if (status === 'ENVIADO') {
      return <Selo texto="Carregado" cor={cores.verde} fundo={cores.verdeFundo} />;
    }
    if (status === 'SEM_MOVIMENTO') {
      return (
        <Selo
          texto="Sem movimento"
          cor={cores.textoSecundario}
          fundo={cores.superficieAlternativa}
        />
      );
    }
    return <Selo texto="Pendente" cor={cores.amarelo} fundo={cores.amareloFundo} />;
  }

  return (
    <Tela aoAtualizar={req.recarregar} atualizando={req.atualizando}>
      <SeletorData
        valor={data}
        aoMudar={setData}
        rotulo="Dia de referência"
        dataMinima={dataInicial}
      />

      {/* Progresso da sequência */}
      <View style={styles.progressoCard}>
        <View style={styles.progressoTopo}>
          <Ionicons
            name={resolvidos === ITENS.length ? 'checkmark-done-circle' : 'documents-outline'}
            size={22}
            color={resolvidos === ITENS.length ? cores.verde : cores.primaria}
          />
          <Text style={styles.progressoTexto}>
            {resolvidos} de {ITENS.length} arquivos carregados
          </Text>
        </View>
        <View style={styles.barraTrilho}>
          <View
            style={[
              styles.barraPreenchida,
              {
                width: `${(resolvidos / ITENS.length) * 100}%`,
                backgroundColor: resolvidos === ITENS.length ? cores.verde : cores.primaria,
              },
            ]}
          />
        </View>
      </View>

      <Cartao titulo="Carregar arquivos do dia">
        <Text style={styles.ajuda}>
          Envie o bloco de notas de cada arquivo, na sequência. Se um indicador
          não teve movimento (ex.: nenhum cancelamento), toque em &quot;Sem
          movimento&quot;.
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

        {req.carregando ? (
          <Carregando />
        ) : req.erro ? (
          <MensagemErro mensagem={req.erro} aoTentarNovamente={req.recarregar} />
        ) : (
          ITENS.map((item, indice) => {
            const status = statusDe(item);
            const resolvido = status !== 'PENDENTE';
            const ehProximo = item.id === proximoId;
            return (
              <View
                key={item.id}
                style={[styles.item, ehProximo && styles.itemProximo]}
              >
                <View style={styles.tituloLinha}>
                  {/* Numero da sequencia */}
                  <View
                    style={[
                      styles.seq,
                      {
                        backgroundColor: resolvido ? cores.verde : cores.superficieAlternativa,
                      },
                    ]}
                  >
                    {resolvido ? (
                      <Ionicons name="checkmark" size={14} color={cores.textoInverso} />
                    ) : (
                      <Text style={styles.seqTexto}>{indice + 1}</Text>
                    )}
                  </View>
                  <Ionicons
                    name={item.icone as keyof typeof Ionicons.glyphMap}
                    size={18}
                    color={cores.primaria}
                  />
                  <Text style={styles.nome}>{item.titulo}</Text>
                  {ehProximo ? (
                    <Selo texto="Próximo" cor={cores.primaria} fundo={cores.primariaClara} />
                  ) : (
                    seloDe(status)
                  )}
                </View>
                <View style={styles.acoes}>
                  <Botao
                    titulo={status === 'ENVIADO' ? 'Recarregar' : 'Carregar'}
                    variante="secundario"
                    carregando={enviando === item.id}
                    aoPressionar={() => void enviar(item)}
                    estilo={styles.botao}
                  />
                  {item.id !== 'VENDAS' && status !== 'ENVIADO' ? (
                    <Botao
                      titulo="Sem movimento"
                      variante="texto"
                      aoPressionar={() => void marcarSemMovimento(item)}
                    />
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </Cartao>
    </Tela>
  );
}

const styles = StyleSheet.create({
  progressoCard: {
    backgroundColor: cores.superficie,
    borderRadius: raio.lg,
    padding: espacamento.lg,
    marginBottom: espacamento.md,
  },
  progressoTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    marginBottom: espacamento.sm,
  },
  progressoTexto: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
  },
  barraTrilho: {
    height: 8,
    borderRadius: 4,
    backgroundColor: cores.superficieAlternativa,
    overflow: 'hidden',
  },
  barraPreenchida: {
    height: 8,
    borderRadius: 4,
  },
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
    paddingHorizontal: espacamento.sm,
    borderRadius: raio.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  itemProximo: {
    backgroundColor: cores.primariaClara,
    borderBottomWidth: 0,
  },
  tituloLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    marginBottom: espacamento.xs,
  },
  seq: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seqTexto: {
    ...tipografia.legenda,
    fontWeight: '800',
    color: cores.textoSecundario,
    fontSize: 11,
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
