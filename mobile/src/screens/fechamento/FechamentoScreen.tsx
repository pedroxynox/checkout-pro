/**
 * Tela de Fechamento (resumo inteligente do dia).
 *
 * Somente leitura (supervisor, gerente e gerente desenvolvedor). Para o dia
 * selecionado mostra: um titular ("Tudo pronto" ou quantos faltam), os alertas
 * de consistência (ex.: tudo "sem movimento", vendas sem arrecadação, dia
 * encerrado com pendências) e o estado de cada item — as 5 arrecadações, as
 * Vendas por hora e os 2 checklists. A carga em si é feita em Importações.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fechamentoService } from '../../api/services';
import { ItemFechamento, ResumoFechamento } from '../../api/types';
import {
  Aviso,
  Carregando,
  Cartao,
  MensagemErro,
  Selo,
  SeletorData,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { hojeISO } from '../../utils/formato';
import { ARRECADACAO } from '../../utils/rotulos';

/** Ícone de cada item conforme a categoria/id. */
function iconeItem(item: ItemFechamento): keyof typeof Ionicons.glyphMap {
  if (item.categoria === 'VENDAS') return 'cash-outline';
  if (item.categoria === 'CHECKLIST') return 'clipboard-outline';
  const def = ARRECADACAO.find((d) => d.tipo === item.id);
  return (def?.icone as keyof typeof Ionicons.glyphMap) ?? 'document-outline';
}

/** Selo (texto/cor) de cada item conforme o status. */
function seloDoItem(item: ItemFechamento): {
  texto: string;
  cor: string;
  fundo: string;
} {
  switch (item.status) {
    case 'OK':
      return {
        texto: item.categoria === 'CHECKLIST' ? 'Feito' : 'Enviado',
        cor: cores.verde,
        fundo: cores.verdeFundo,
      };
    case 'SEM_MOVIMENTO':
      return {
        texto: 'Sem movimento',
        cor: cores.textoSecundario,
        fundo: cores.superficieAlternativa,
      };
    case 'NAO_ENVIADO':
      return { texto: 'Não enviado', cor: cores.vermelho, fundo: cores.vermelhoFundo };
    default:
      return { texto: 'Pendente', cor: cores.amarelo, fundo: cores.amareloFundo };
  }
}

export function FechamentoScreen(): React.ReactElement {
  const [data, setData] = useState(hojeISO());
  const req = useRequisicao<ResumoFechamento>(
    () => fechamentoService.resumo(data),
    [data],
  );
  const resumo = req.dados;

  return (
    <Tela aoAtualizar={req.recarregar} atualizando={req.atualizando}>
      <SeletorData valor={data} aoMudar={setData} rotulo="Dia de referência" />

      {req.carregando ? (
        <Carregando />
      ) : req.erro ? (
        <MensagemErro mensagem={req.erro} aoTentarNovamente={req.recarregar} />
      ) : resumo ? (
        <>
          {/* Titular do dia */}
          <Cartao>
            {resumo.tudoPronto ? (
              <View style={styles.titularLinha}>
                <Ionicons name="checkmark-circle" size={28} color={cores.verde} />
                <Text style={[styles.titular, { color: cores.verde }]}>
                  Tudo pronto!
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.titular}>
                  {resumo.concluidos} de {resumo.totalItens} concluídos
                </Text>
                <View style={styles.barraTrilho}>
                  <View
                    style={[
                      styles.barraPreenchida,
                      {
                        width: `${Math.round(
                          (resumo.concluidos / resumo.totalItens) * 100,
                        )}%` as `${number}%`,
                      },
                    ]}
                  />
                </View>
                {resumo.pendentes.length > 0 ? (
                  <Text style={styles.faltam}>
                    Faltam: {resumo.pendentes.join(', ')}.
                  </Text>
                ) : null}
              </>
            )}
          </Cartao>

          {/* Alertas inteligentes */}
          {resumo.alertas.map((a, i) => (
            <Aviso key={i} texto={a} />
          ))}

          {/* Estado de cada item */}
          <Cartao titulo="Itens do dia">
            {resumo.itens.map((item) => {
              const selo = seloDoItem(item);
              return (
                <View key={item.id} style={styles.linha}>
                  <View style={styles.tituloLinha}>
                    <Ionicons
                      name={iconeItem(item)}
                      size={18}
                      color={cores.primaria}
                    />
                    <Text style={styles.nome}>{item.titulo}</Text>
                  </View>
                  <Selo texto={selo.texto} cor={selo.cor} fundo={selo.fundo} />
                </View>
              );
            })}
          </Cartao>
        </>
      ) : null}
    </Tela>
  );
}

const styles = StyleSheet.create({
  titularLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
  },
  titular: {
    ...tipografia.secao,
    fontWeight: '700',
    color: cores.texto,
  },
  barraTrilho: {
    width: '100%',
    height: 10,
    borderRadius: raio.pill,
    backgroundColor: cores.divisor,
    overflow: 'hidden',
    marginTop: espacamento.sm,
  },
  barraPreenchida: {
    height: '100%',
    borderRadius: raio.pill,
    backgroundColor: cores.verde,
  },
  faltam: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: espacamento.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  tituloLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    flex: 1,
  },
  nome: {
    ...tipografia.corpo,
    color: cores.texto,
    fontWeight: '600',
  },
});

export default FechamentoScreen;
