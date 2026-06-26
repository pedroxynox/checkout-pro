/**
 * Centro de Controle ▸ Metas — definição das metas por período mensal.
 *
 * Mostra um seletor de mês no topo e, abaixo, uma card por indicador
 * (Vendas, Cancelamento de Itens, Recarga de Celular, Cancelamento de Cupom,
 * Devoluções). Cada card exibe a meta do mês selecionado e permite editá-la.
 *
 * A meta de Vendas, antes definida no Painel de Vendas, agora é definida aqui
 * (por mês). As demais alimentam as cores/projeções dos Indicadores.
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
import { cores, espacamento, raio, tipografia } from '../../theme';
import { notificar } from '../../utils/dialogos';
import { formatarMoeda, formatarPercentual } from '../../utils/formato';

/** Ícone de cada indicador. */
const ICONES: Record<TipoMeta, keyof typeof Ionicons.glyphMap> = {
  VENDAS: 'cash-outline',
  RECARGAS_CELULAR: 'phone-portrait-outline',
  CANCELAMENTO_ITENS: 'remove-circle-outline',
  CANCELAMENTO_CUPOM: 'receipt-outline',
  DEVOLUCOES: 'return-down-back-outline',
};

/** Mês atual (dia-calendário de Brasília, UTC−3) no formato "AAAA-MM". */
function mesAtual(): string {
  const agora = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return `${agora.getUTCFullYear()}-${String(agora.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Desloca o período mensal em `delta` meses. */
function deslocarMes(anoMes: string, delta: number): string {
  const [a, m] = anoMes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Rótulo do período (ex.: "Junho de 2026"). */
function rotuloMes(anoMes: string): string {
  const [a, m] = anoMes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, 1));
  const s = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Valor formatado conforme a unidade (R$ ou %). */
function formatarValor(item: MetaMensal): string {
  return item.unidade === 'REAIS'
    ? formatarMoeda(item.meta)
    : formatarPercentual(item.meta, 2);
}

/** Texto de ajuda do campo de edição. */
function ajudaUnidade(item: MetaMensal): string {
  return item.unidade === 'REAIS'
    ? 'Valor em reais (R$) a alcançar no mês.'
    : 'Percentual (%) sobre as vendas — quanto menor, melhor.';
}

export function MetasScreen(): React.ReactElement {
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
    setValor(item.meta > 0 ? String(item.meta).replace('.', ',') : '');
  };

  const salvar = async (item: MetaMensal) => {
    const num = Number(valor.replace(',', '.'));
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
        Defina as metas de cada indicador para o mês escolhido. Apenas o gestor
        tem acesso a esta área.
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
                  <Text style={styles.padrao}>valor padrão (ainda não definida)</Text>
                )}
              </View>
            </View>

            {editTipo === item.tipo ? (
              <>
                <CampoTexto
                  rotulo={
                    item.unidade === 'REAIS' ? 'Meta (R$)' : 'Meta (%)'
                  }
                  keyboardType="decimal-pad"
                  value={valor}
                  onChangeText={setValor}
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
