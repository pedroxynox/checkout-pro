/**
 * Centro de Controle ▸ Insumos — ações administrativas de dados de insumos.
 *
 * Reúne as operações de "zerar/limpar" relativas a insumos: zerar o estoque
 * (movimentos) e limpar o histórico de requisições. Cada ação pede confirmação
 * e é irreversível. Restrita ao gestor (ADMIN_DADOS).
 */
import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { ApiError } from '../../api/client';
import { insumosService, requisicoesService } from '../../api/services';
import { Aviso, Botao, Cartao, Tela } from '../../components';
import { cores, espacamento, tipografia } from '../../theme';
import { confirmar, notificar } from '../../utils/dialogos';

export function InsumosDadosScreen(): React.ReactElement {
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

      <Cartao titulo="Limpar histórico de requisições">
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

export default InsumosDadosScreen;
