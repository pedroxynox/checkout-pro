/**
 * Tela de Gerenciamento de Dados (administrativo, apenas GERENTE).
 *
 * Reúne operações sobre os dados do banco — hoje, ações de "zerar/limpar".
 * Cada ação pede confirmação e é irreversível. Separada das telas operacionais
 * de propósito, para não misturar com o uso do dia a dia.
 */
import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { ApiError } from '../../api/client';
import {
  insumosService,
  loteApaeService,
  requisicoesService,
} from '../../api/services';
import { Aviso, Botao, Cartao, Tela } from '../../components';
import { cores, espacamento, tipografia } from '../../theme';
import { confirmar, notificar } from '../../utils/dialogos';

export function GerenciarDadosScreen(): React.ReactElement {
  const [ocupado, setOcupado] = useState<string | null>(null);

  const rodar = async (
    id: string,
    confirmacao: string,
    executar: () => Promise<{ removidos: number }>,
    mensagemOk: (n: number) => string,
  ) => {
    const ok = await confirmar('Confirmar ação', confirmacao, 'Confirmar');
    if (!ok) {
      return;
    }
    setOcupado(id);
    try {
      const { removidos } = await executar();
      notificar('Pronto', mensagemOk(removidos));
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha na operação.');
    } finally {
      setOcupado(null);
    }
  };

  return (
    <Tela>
      <Aviso texto="⚠️ Estas ações são administrativas e irreversíveis. Use com cuidado." />

      <Cartao titulo="Zerar estoque de insumos">
        <Text style={styles.descricao}>
          Remove todos os movimentos (entradas e saídas). O saldo de todos os
          insumos volta a 0. Os insumos em si são mantidos.
        </Text>
        <Botao
          titulo="Zerar estoque"
          variante="perigo"
          carregando={ocupado === 'insumos'}
          aoPressionar={() =>
            rodar(
              'insumos',
              'Zerar o estoque de TODOS os insumos? Os saldos voltam a 0.',
              () => insumosService.zerarEstoque(),
              (n) => `Estoque zerado (${n} movimento(s) removido(s)).`,
            )
          }
        />
      </Cartao>

      <Cartao titulo="Limpar requisições">
        <Text style={styles.descricao}>
          Remove todas as requisições (pendentes, aprovadas e negadas). Não
          afeta o estoque já lançado.
        </Text>
        <Botao
          titulo="Limpar requisições"
          variante="perigo"
          carregando={ocupado === 'requisicoes'}
          aoPressionar={() =>
            rodar(
              'requisicoes',
              'Remover TODAS as requisições? Esta ação não pode ser desfeita.',
              () => requisicoesService.limparTodas(),
              (n) => `${n} requisição(ões) removida(s).`,
            )
          }
        />
      </Cartao>

      <Cartao titulo="Limpar histórico de Sacolas APAE">
        <Text style={styles.descricao}>
          Remove os lotes vendidos do histórico de Sacolas APAE. O lote ativo
          não é afetado.
        </Text>
        <Botao
          titulo="Limpar histórico"
          variante="perigo"
          carregando={ocupado === 'apae'}
          aoPressionar={() =>
            rodar(
              'apae',
              'Remover todos os lotes vendidos do histórico de Sacolas APAE?',
              () => loteApaeService.limparHistorico(),
              (n) => `${n} lote(s) removido(s) do histórico.`,
            )
          }
        />
      </Cartao>
    </Tela>
  );
}

const styles = StyleSheet.create({
  descricao: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.md,
  },
});

export default GerenciarDadosScreen;
