/**
 * Tela do Painel de Vendas (Req 2.1).
 *
 * Exibe o acumulado de vendas do período selecionado (dia/semana/mês) para a
 * data escolhida e permite informar/alterar o valor de vendas de um dia. O
 * registro/alteração é uma ação administrativa (gerente); o backend aplica a
 * autorização, e o app só exibe o formulário para o perfil GERENTE.
 */
import React, { useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { ApiError } from '../../api/client';
import { indicadoresService } from '../../api/services';
import { Periodo } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import {
  Aviso,
  Botao,
  CampoTexto,
  Carregando,
  Cartao,
  MensagemErro,
  Segmentado,
  SeletorData,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, tipografia } from '../../theme';
import { formatarMoeda, hojeISO } from '../../utils/formato';

const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: 'DIA', rotulo: 'Dia' },
  { valor: 'SEMANA', rotulo: 'Semana' },
  { valor: 'MES', rotulo: 'Mês' },
];

function numero(texto: string): number {
  return Number(texto.replace(/\./g, '').replace(',', '.'));
}

export function PainelVendasScreen(): React.ReactElement {
  const { perfil } = useAuth();
  const ehGerente = perfil === 'GERENTE';

  const [data, setData] = useState(hojeISO());
  const [periodo, setPeriodo] = useState<Periodo>('DIA');
  const [valor, setValor] = useState('');
  const [salvando, setSalvando] = useState(false);

  const acumulado = useRequisicao(
    () => indicadoresService.acumulado(data, periodo),
    [data, periodo],
  );

  const informarVenda = async () => {
    const v = numero(valor);
    if (!Number.isFinite(v) || v < 0) {
      Alert.alert('Valor inválido', 'Informe um valor de vendas maior ou igual a zero.');
      return;
    }
    setSalvando(true);
    try {
      await indicadoresService.registrarVenda(data, v);
      setValor('');
      Alert.alert('Pronto', 'Valor de vendas registrado.');
      acumulado.recarregar();
    } catch (e) {
      Alert.alert('Erro', e instanceof ApiError ? e.message : 'Falha ao registrar.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Tela aoAtualizar={acumulado.recarregar} atualizando={acumulado.atualizando}>
      <SeletorData valor={data} aoMudar={setData} rotulo="Data de referência" />

      <Cartao titulo="Acumulado de vendas">
        <Segmentado opcoes={PERIODOS} selecionado={periodo} aoSelecionar={setPeriodo} />
        {acumulado.carregando ? (
          <Carregando />
        ) : acumulado.erro ? (
          <MensagemErro mensagem={acumulado.erro} aoTentarNovamente={acumulado.recarregar} />
        ) : (
          <Text style={styles.total}>
            {formatarMoeda(acumulado.dados?.total ?? 0)}
          </Text>
        )}
      </Cartao>

      {ehGerente ? (
        <Cartao titulo="Informar vendas do dia">
          <CampoTexto
            rotulo="Valor das vendas (R$)"
            keyboardType="decimal-pad"
            value={valor}
            onChangeText={setValor}
            placeholder="0,00"
          />
          <Botao titulo="Salvar" aoPressionar={informarVenda} carregando={salvando} />
        </Cartao>
      ) : (
        <Aviso texto="Apenas o gerente pode informar ou alterar o valor de vendas." />
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  total: {
    ...tipografia.titulo,
    fontSize: 30,
    color: cores.primaria,
    textAlign: 'center',
    marginVertical: espacamento.md,
  },
});

export default PainelVendasScreen;
