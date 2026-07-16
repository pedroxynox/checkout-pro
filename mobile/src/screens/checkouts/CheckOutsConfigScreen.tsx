/**
 * Configuração da quantidade de check-outs (Centro de Controle — gerente/admin).
 * Define quantas caixas aparecem na seção Check-Outs (numeradas 1..N).
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { ApiError } from '../../api/client';
import { checkoutsService } from '../../api/services';
import {
  Aviso,
  Botao,
  CampoTexto,
  Carregando,
  MensagemErro,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, tipografia } from '../../theme';
import { notificar } from '../../utils/dialogos';

export function CheckOutsConfigScreen(): React.ReactElement {
  const config = useRequisicao(() => checkoutsService.config(), []);
  const [valor, setValor] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (config.dados) {
      setValor(String(config.dados.quantidade));
    }
  }, [config.dados]);

  const salvar = async () => {
    const n = Number(valor);
    if (!Number.isInteger(n) || n < 1 || n > 200) {
      notificar('Valor inválido', 'Informe um número entre 1 e 200.');
      return;
    }
    setSalvando(true);
    try {
      await checkoutsService.definirConfig(n);
      notificar('Pronto', `Agora há ${n} check-outs.`);
      config.recarregar();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  if (config.carregando) {
    return (
      <Tela>
        <Carregando />
      </Tela>
    );
  }
  if (config.erro) {
    return (
      <Tela>
        <MensagemErro mensagem={config.erro} aoTentarNovamente={config.recarregar} />
      </Tela>
    );
  }

  return (
    <Tela>
      <Aviso texto="Define quantas caixas (check-outs) existem na loja. Elas aparecem numeradas de 1 até o total na seção Check-Outs." />
      <Text style={styles.rotulo}>Quantidade de check-outs</Text>
      <CampoTexto
        rotulo="Total de caixas"
        value={valor}
        onChangeText={setValor}
        keyboardType="number-pad"
        placeholder="Ex.: 38"
      />
      <Botao
        titulo="Salvar"
        aoPressionar={() => void salvar()}
        desabilitado={salvando}
      />
    </Tela>
  );
}

const styles = StyleSheet.create({
  rotulo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginBottom: espacamento.xs,
  },
});

export default CheckOutsConfigScreen;
