/**
 * Centro de Controle ▸ Insumos — ações administrativas de dados de insumos.
 *
 * Reúne as operações de "zerar/limpar" relativas a insumos:
 *  - zerar o estoque de UM insumo (corrigir um lançamento errado sem afetar os
 *    outros — zere o insumo e registre a entrada de novo);
 *  - zerar o estoque de TODOS os insumos (movimentos);
 *  - limpar o histórico de requisições.
 * Cada ação pede confirmação e é irreversível. Restrita ao gestor (ADMIN_DADOS).
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { insumosService, requisicoesService } from '../../api/services';
import { InsumoProativo } from '../../api/types';
import {
  Aviso,
  Botao,
  Carregando,
  Cartao,
  MensagemErro,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { confirmar, notificar } from '../../utils/dialogos';
import { formatarNumero } from '../../utils/formato';

/** Primeira letra maiúscula (nomes de insumo vêm em minúsculas do backend). */
function capitalizar(texto: string): string {
  return texto.length ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

export function InsumosDadosScreen(): React.ReactElement {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const insumos = useRequisicao<InsumoProativo[]>(
    () => insumosService.listarProativo(),
    [],
  );

  const rodar = async (
    id: string,
    confirmacao: string,
    executar: () => Promise<{ removidos: number }>,
    mensagemOk: (n: number) => string,
    aoConcluir?: () => void,
  ) => {
    const ok = await confirmar('Confirmar ação', confirmacao, 'Confirmar');
    if (!ok) {
      return;
    }
    setOcupado(id);
    try {
      const { removidos } = await executar();
      notificar('Pronto', mensagemOk(removidos));
      aoConcluir?.();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha na operação.');
    } finally {
      setOcupado(null);
    }
  };

  const lista = insumos.dados ?? [];

  return (
    <Tela aoAtualizar={insumos.recarregar} atualizando={insumos.atualizando}>
      <Aviso texto="⚠️ Estas ações são administrativas e irreversíveis. Use com cuidado." />

      {/* Zerar o estoque de UM insumo (corrigir lançamento errado) */}
      <Cartao titulo="Zerar estoque de um insumo">
        <Text style={styles.descricao}>
          Zera o saldo de apenas um insumo (remove os movimentos dele). Útil para
          corrigir um lançamento errado: zere o insumo e registre a entrada de
          novo. Os outros insumos não são afetados.
        </Text>

        {insumos.carregando ? (
          <Carregando />
        ) : insumos.erro ? (
          <MensagemErro
            mensagem={insumos.erro}
            aoTentarNovamente={insumos.recarregar}
          />
        ) : lista.length === 0 ? (
          <Text style={styles.descricao}>Nenhum insumo cadastrado.</Text>
        ) : (
          lista.map((i) => (
            <View key={i.id} style={styles.linha}>
              <View style={styles.linhaInfo}>
                <Text style={styles.nome} numberOfLines={1}>
                  {capitalizar(i.nome)}
                </Text>
                <Text style={styles.saldo}>
                  Saldo: {formatarNumero(i.saldo)} {i.unidade}
                  {i.saldo === 1 ? '' : 's'}
                </Text>
              </View>
              <Pressable
                disabled={ocupado !== null}
                onPress={() =>
                  void rodar(
                    `insumo-${i.id}`,
                    `Zerar o estoque de "${capitalizar(i.nome)}"? O saldo volta a 0. Os outros insumos não mudam.`,
                    () => insumosService.zerarEstoqueInsumo(i.id),
                    (n) => `Estoque de ${capitalizar(i.nome)} zerado (${n} movimento(s) removido(s)).`,
                    () => void insumos.recarregar(),
                  )
                }
                style={({ pressed }) => [
                  styles.btnZerar,
                  (pressed || ocupado === `insumo-${i.id}`) && styles.pressionado,
                ]}
              >
                <Text style={styles.btnZerarTexto}>
                  {ocupado === `insumo-${i.id}` ? '...' : 'Zerar'}
                </Text>
              </Pressable>
            </View>
          ))
        )}
      </Cartao>

      <Cartao titulo="Zerar estoque de TODOS os insumos">
        <Text style={styles.descricao}>
          Remove todos os movimentos (entradas e saídas). O saldo de todos os
          insumos volta a 0. Os insumos em si são mantidos.
        </Text>
        <Botao
          titulo="Zerar estoque de todos"
          variante="perigo"
          carregando={ocupado === 'insumos'}
          aoPressionar={() =>
            rodar(
              'insumos',
              'Zerar o estoque de TODOS os insumos? Os saldos voltam a 0.',
              () => insumosService.zerarEstoque(),
              (n) => `Estoque zerado (${n} movimento(s) removido(s)).`,
              () => void insumos.recarregar(),
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
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: espacamento.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
  },
  linhaInfo: {
    flex: 1,
    paddingRight: espacamento.sm,
  },
  nome: {
    ...tipografia.corpo,
    color: cores.texto,
    fontWeight: '600',
  },
  saldo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 1,
  },
  btnZerar: {
    paddingVertical: espacamento.xs,
    paddingHorizontal: espacamento.md,
    borderRadius: raio.sm,
    borderWidth: 1,
    borderColor: cores.vermelho,
    backgroundColor: cores.vermelhoFundo,
  },
  btnZerarTexto: {
    ...tipografia.rotulo,
    color: cores.vermelho,
    fontWeight: '700',
  },
  pressionado: {
    opacity: 0.6,
  },
});

export default InsumosDadosScreen;
