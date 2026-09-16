/**
 * Centro de Controle ▸ Metas — definição das metas por período mensal.
 *
 * Mostra um seletor de mês no topo e, abaixo, uma card por indicador
 * (Vendas, Cancelamento de Itens, Recarga de Celular, Cancelamento de Cupom,
 * Devoluções). Cada card exibe a meta do mês selecionado.
 *
 * As quatro metas digitadas (recargas, cancelamentos e devoluções) são
 * editadas aqui. A de **Vendas é derivada** (`derivada: true`): é a soma das
 * estimativas diárias e aparece como somente leitura, com atalho para a
 * Central de Vendas, onde essas estimativas são cadastradas.
 *
 * Apenas o gestor (funcionalidade OPERADORES_CRUD).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ApiError } from '../../api/client';
import { metasService } from '../../api/services';
import { MetaMensal, TipoMeta } from '../../api/types';
import {
  Botao,
  CampoTexto,
  Carregando,
  Cartao,
  MensagemErro,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { PropsTela } from '../../navigation/types';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { notificar } from '../../utils/dialogos';
import {
  formatarMoeda,
  formatarPercentual,
  mascaraMilhar,
  parseNumeroBR,
} from '../../utils/formato';
import { deslocarMes, mesAtual, rotuloMes } from '../../utils/periodoMensal';

/** Ícone de cada indicador. */
const ICONES: Record<TipoMeta, keyof typeof Ionicons.glyphMap> = {
  VENDAS: 'cash-outline',
  RECARGAS_CELULAR: 'phone-portrait-outline',
  CANCELAMENTO_ITENS: 'remove-circle-outline',
  CANCELAMENTO_CUPOM: 'receipt-outline',
  DEVOLUCOES: 'return-down-back-outline',
  SACOLAS: 'bag-handle-outline',
};

/** Valor formatado conforme a unidade (R$, % ou R$ por unidade). */
function formatarValor(item: MetaMensal): string {
  if (item.unidade === 'REAIS') return formatarMoeda(item.meta);
  // Razão: o "por sacola" é parte do número — sem ele o valor não se entende.
  if (item.unidade === 'REAIS_POR_UNIDADE') {
    return `${formatarMoeda(item.meta)} por sacola`;
  }
  return formatarPercentual(item.meta, 2);
}

/** Texto de ajuda do campo de edição. */
function ajudaUnidade(item: MetaMensal): string {
  if (item.unidade === 'REAIS') return 'Valor em reais (R$) a alcançar no mês.';
  if (item.unidade === 'REAIS_POR_UNIDADE') {
    return (
      'Quanto a loja deve vender, em R$, por cada sacola que entra no estoque. ' +
      'É um piso: acima dele significa usar menos sacolas para vender o mesmo.'
    );
  }
  return 'Percentual (%) sobre as vendas — quanto menor, melhor.';
}

/** Rótulo do campo de edição, por unidade. */
function rotuloCampo(item: MetaMensal): string {
  if (item.unidade === 'REAIS') return 'Meta (R$)';
  if (item.unidade === 'REAIS_POR_UNIDADE') return 'Meta (R$ por sacola)';
  return 'Meta (%)';
}

export function MetasScreen({
  navigation,
}: PropsTela<'Metas'>): React.ReactElement {

  const [anoMes, setAnoMes] = useState(mesAtual());
  const [editTipo, setEditTipo] = useState<TipoMeta | null>(null);
  const [valor, setValor] = useState('');
  const [salvando, setSalvando] = useState(false);

  const req = useRequisicao<MetaMensal[]>(
    () => metasService.listar(anoMes),
    [anoMes],
  );
  const metas = req.dados ?? [];



  const trocarMes = (delta: number) => {
    setEditTipo(null);
    setAnoMes((atual) => deslocarMes(atual, delta));
  };

  const abrirEdicao = (item: MetaMensal) => {
    setEditTipo(item.tipo);
    // Preenche com o valor atual (vazio quando 0, para facilitar digitar).
    setValor(item.meta > 0 ? mascaraMilhar(String(item.meta).replace('.', ',')) : '');
  };

  const salvar = async (item: MetaMensal) => {
    const num = parseNumeroBR(valor);
    if (!Number.isFinite(num) || num < 0) {
      notificar('Valor inválido', 'Informe um número maior ou igual a zero.');
      return;
    }
    setSalvando(true);
    try {
      await metasService.definir(item.tipo, anoMes, num);
      setEditTipo(null);
      req.recarregar();
      notificar('Meta salva', `${item.titulo}: meta de ${rotuloMes(anoMes)} atualizada.`);
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao salvar a meta.');
    } finally {
      setSalvando(false);
    }
  };



  return (
    <Tela aoAtualizar={req.recarregar} atualizando={req.atualizando}>
      <Text style={styles.intro}>
        Defina as metas de cada indicador para o mês escolhido. A meta de Vendas
        não é digitada: ela é a soma das estimativas diárias cadastradas na
        Central de Vendas. Apenas o gestor tem acesso a esta área.
      </Text>

      {/* Seletor de mês (período mensal) */}
      <View style={styles.seletor}>
        <TouchableOpacity
          onPress={() => trocarMes(-1)}
          hitSlop={10}
          style={styles.seletorBotao}
          accessibilityLabel="Mês anterior"
        >
          <Ionicons name="chevron-back" size={22} color={cores.primaria} />
        </TouchableOpacity>
        <Text style={styles.seletorTexto}>{rotuloMes(anoMes)}</Text>
        <TouchableOpacity
          onPress={() => trocarMes(1)}
          hitSlop={10}
          style={styles.seletorBotao}
          accessibilityLabel="Próximo mês"
        >
          <Ionicons name="chevron-forward" size={22} color={cores.primaria} />
        </TouchableOpacity>
      </View>

      {req.carregando ? (
        <Carregando />
      ) : req.erro ? (
        <MensagemErro mensagem={req.erro} aoTentarNovamente={req.recarregar} />
      ) : (
        metas.map((item) => (
          <Cartao key={item.tipo} titulo={item.titulo}>
            <View style={styles.linhaValor}>
              <View style={styles.icone}>
                <Ionicons name={ICONES[item.tipo]} size={20} color={cores.primaria} />
              </View>
              <View style={styles.valorInfo}>
                <Text style={styles.valor}>{formatarValor(item)}</Text>
                {!item.definida && (
                  <Text style={styles.padrao}>
                    {item.derivada
                      ? 'sem estimativas cadastradas neste mês'
                      : 'valor padrão (ainda não definida)'}
                  </Text>
                )}
              </View>
            </View>

            {/* Meta derivada (Vendas): somente leitura, com atalho para a
                Central de Vendas, onde as estimativas diárias são definidas. */}
            {item.derivada ? (
              <>
                <Text style={styles.ajuda}>{item.origem}</Text>
                <Botao
                  titulo="Abrir Central de Vendas"
                  variante="secundario"
                  aoPressionar={() => navigation.navigate('CentralVendas')}
                />
              </>
            ) : editTipo === item.tipo ? (
              <>
                <CampoTexto
                  rotulo={rotuloCampo(item)}
                  keyboardType="decimal-pad"
                  value={valor}
                  onChangeText={(t) => setValor(mascaraMilhar(t))}
                  placeholder="0"
                />
                <Text style={styles.ajuda}>{ajudaUnidade(item)}</Text>
                <Botao
                  titulo="Salvar meta"
                  aoPressionar={() => void salvar(item)}
                  carregando={salvando}
                />
                <Botao
                  titulo="Cancelar"
                  variante="texto"
                  aoPressionar={() => setEditTipo(null)}
                />
              </>
            ) : (
              <Botao
                titulo="Editar meta"
                variante="secundario"
                aoPressionar={() => abrirEdicao(item)}
              />
            )}
          </Cartao>
        ))
      )}

    </Tela>
  );
}

const styles = StyleSheet.create({
  intro: {
    ...tipografia.corpo,
    color: cores.textoSecundario,
    marginBottom: espacamento.sm,
  },
  seletor: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: cores.superficie,
    borderRadius: raio.md,
    borderWidth: 1,
    borderColor: cores.divisor,
    paddingVertical: espacamento.xs,
    paddingHorizontal: espacamento.sm,
    marginBottom: espacamento.sm,
  },
  seletorBotao: {
    width: 40,
    height: 40,
    borderRadius: raio.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: cores.primariaClara,
  },
  seletorTexto: {
    ...tipografia.subtitulo,
    color: cores.texto,
    fontWeight: '700',
  },
  linhaValor: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: espacamento.sm,
  },
  icone: {
    width: 44,
    height: 44,
    borderRadius: raio.md,
    backgroundColor: cores.primariaClara,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valorInfo: { flex: 1, paddingHorizontal: espacamento.md },
  valor: { ...tipografia.titulo, color: cores.texto, fontWeight: '700' },
  padrao: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
    fontStyle: 'italic',
  },
  ajuda: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.sm,
  },
});

export default MetasScreen;
