/**
 * Tela de Fechamento (status dos arquivos do dia).
 *
 * Somente leitura (supervisor, gerente e gerente desenvolvedor). Mostra, para o
 * dia selecionado, se cada arquivo já foi carregado: as 5 arrecadações + as
 * Vendas por hora. Estados: "Enviado" (carregado), "Pendente" (ainda hoje) ou
 * "Não enviado" (dia já passou sem carga). A carga em si é feita na seção
 * Importações pelo usuário dedicado.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { arrecadacaoService, vendasService } from '../../api/services';
import { StatusArrecadacao, TipoArrecadacao } from '../../api/types';
import {
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
import { ARRECADACAO } from '../../utils/rotulos';

interface ItemStatus {
  id: TipoArrecadacao | 'VENDAS';
  titulo: string;
  icone: string;
  enviado: boolean;
}

function seloDoStatus(enviado: boolean, diaPassou: boolean): {
  texto: string;
  cor: string;
  fundo: string;
} {
  if (enviado) {
    return { texto: 'Enviado', cor: cores.verde, fundo: cores.verdeFundo };
  }
  if (diaPassou) {
    return { texto: 'Não enviado', cor: cores.vermelho, fundo: cores.vermelhoFundo };
  }
  return { texto: 'Pendente', cor: cores.amarelo, fundo: cores.amareloFundo };
}

export function FechamentoScreen(): React.ReactElement {
  const [data, setData] = useState(hojeISO());

  const req = useRequisicao(async () => {
    const [arrecadacao, vendas] = await Promise.all([
      arrecadacaoService.status(data),
      vendasService.status(data),
    ]);
    return { arrecadacao, vendas };
  }, [data]);

  const diaPassou = data < hojeISO();

  const arrecadacao: StatusArrecadacao | undefined = req.dados?.arrecadacao;
  const itens: ItemStatus[] = [
    ...ARRECADACAO.map((d) => ({
      id: d.tipo as TipoArrecadacao,
      titulo: d.titulo,
      icone: d.icone,
      enviado: arrecadacao?.[d.tipo] === true,
    })),
    {
      id: 'VENDAS' as const,
      titulo: 'Vendas por hora',
      icone: 'cash-outline',
      enviado: req.dados?.vendas?.enviado === true,
    },
  ];

  const totalEnviados = itens.filter((i) => i.enviado).length;

  return (
    <Tela aoAtualizar={req.recarregar} atualizando={req.atualizando}>
      <SeletorData valor={data} aoMudar={setData} rotulo="Dia de referência" />

      <Cartao titulo="Status do fechamento">
        <Text style={styles.resumo}>
          {totalEnviados} de {itens.length} arquivos carregados
        </Text>
        {req.carregando ? (
          <Carregando />
        ) : req.erro ? (
          <MensagemErro mensagem={req.erro} aoTentarNovamente={req.recarregar} />
        ) : (
          itens.map((item) => {
            const selo = seloDoStatus(item.enviado, diaPassou);
            return (
              <View key={item.id} style={styles.linha}>
                <View style={styles.tituloLinha}>
                  <Ionicons
                    name={item.icone as keyof typeof Ionicons.glyphMap}
                    size={18}
                    color={cores.primaria}
                  />
                  <Text style={styles.nome}>{item.titulo}</Text>
                </View>
                <Selo texto={selo.texto} cor={selo.cor} fundo={selo.fundo} />
              </View>
            );
          })
        )}
      </Cartao>
    </Tela>
  );
}

const styles = StyleSheet.create({
  resumo: {
    ...tipografia.corpo,
    fontWeight: '700',
    color: cores.texto,
    marginBottom: espacamento.sm,
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
