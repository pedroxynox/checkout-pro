/**
 * Central de Vendas (Centro de Controle) — só para CARREGAR as estimativas.
 *
 * O gestor define, para cada DIA do mês, quanto se estima vender (estimativa).
 * A estimativa do MÊS é a soma das diárias (mostrada no topo). O Painel de
 * Vendas da Home continua como está; a estimativa do dia aparece lá (na Parte
 * 2 da entrega).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ApiError } from '../../api/client';
import { vendasService } from '../../api/services';
import { EstimativasMes } from '../../api/types';
import {
  Botao,
  Carregando,
  CampoTexto,
  Cartao,
  MensagemErro,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, tipografia } from '../../theme';
import { notificar } from '../../utils/dialogos';
import { formatarMoeda, mascaraMilhar, parseNumeroBR } from '../../utils/formato';

const DIAS_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

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

/** Rótulo do período (ex.: "Agosto de 2026"). */
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

/** Dias do mês: [{ iso, dia, dow }]. */
function diasDoMes(anoMes: string): { iso: string; dia: number; dow: number }[] {
  const [a, m] = anoMes.split('-').map(Number);
  const total = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return Array.from({ length: total }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1, i + 1));
    return { iso: d.toISOString().slice(0, 10), dia: i + 1, dow: d.getUTCDay() };
  });
}

/** "1.234,5" → 1234.5; vazio/negativo/invalid → 0. */
function parseValor(txt: string): number {
  const n = parseNumeroBR(txt);
  return n > 0 ? n : 0;
}

export function CentralVendasScreen(): React.ReactElement {
  const [anoMes, setAnoMes] = useState(mesAtual());
  const [salvando, setSalvando] = useState(false);
  // Valores digitados por data (iso → texto).
  const [valores, setValores] = useState<Record<string, string>>({});

  const req = useRequisicao<EstimativasMes>(
    () => vendasService.listarEstimativas(anoMes),
    [anoMes],
  );

  // Preenche os campos com as estimativas salvas do mês.
  useEffect(() => {
    const cfg = req.dados;
    if (!cfg) return;
    const mapa: Record<string, string> = {};
    for (const d of cfg.dias) {
      mapa[d.data] = mascaraMilhar(String(d.valor).replace('.', ','));
    }
    setValores(mapa);
  }, [req.dados]);

  const dias = useMemo(() => diasDoMes(anoMes), [anoMes]);

  // Soma ao vivo das estimativas digitadas (estimativa do mês).
  const totalMes = useMemo(
    () => dias.reduce((s, d) => s + parseValor(valores[d.iso] ?? ''), 0),
    [dias, valores],
  );

  const trocarMes = (delta: number): void => {
    setAnoMes((atual) => deslocarMes(atual, delta));
  };

  const salvar = async (): Promise<void> => {
    setSalvando(true);
    try {
      const payload = dias.map((d) => ({
        data: d.iso,
        valor: parseValor(valores[d.iso] ?? ''),
      }));
      await vendasService.definirEstimativas(anoMes, payload);
      req.recarregar();
      notificar(
        'Estimativas salvas',
        `Estimativas de ${rotuloMes(anoMes)} atualizadas.`,
      );
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Tela aoAtualizar={req.recarregar} atualizando={req.atualizando}>
      <Text style={styles.intro}>
        Defina quanto se estima vender em cada dia. A estimativa do mês é a soma
        das diárias. Apenas para carregar — o Painel de Vendas na tela inicial
        continua igual.
      </Text>

      {/* Seletor de mês */}
      <View style={styles.seletor}>
        <TouchableOpacity onPress={() => trocarMes(-1)} hitSlop={10} style={styles.seletorBotao}>
          <Ionicons name="chevron-back" size={22} color={cores.primaria} />
        </TouchableOpacity>
        <Text style={styles.seletorTexto}>{rotuloMes(anoMes)}</Text>
        <TouchableOpacity onPress={() => trocarMes(1)} hitSlop={10} style={styles.seletorBotao}>
          <Ionicons name="chevron-forward" size={22} color={cores.primaria} />
        </TouchableOpacity>
      </View>

      {/* Estimativa do mês (soma das diárias) */}
      <Cartao>
        <Text style={styles.totalRotulo}>Estimativa do mês (soma das diárias)</Text>
        <Text style={styles.totalValor}>{formatarMoeda(totalMes)}</Text>
      </Cartao>

      {req.carregando ? (
        <Carregando />
      ) : req.erro ? (
        <MensagemErro mensagem={req.erro} aoTentarNovamente={req.recarregar} />
      ) : (
        <Cartao titulo="Estimativa por dia">
          {dias.map((d) => (
            <View key={d.iso} style={styles.linhaDia}>
              <View style={styles.diaBox}>
                <Text style={styles.diaSemana}>{DIAS_CURTO[d.dow]}</Text>
                <Text style={styles.diaNumero}>{String(d.dia).padStart(2, '0')}</Text>
              </View>
              <View style={styles.campoBox}>
                <CampoTexto
                  rotulo=""
                  keyboardType="decimal-pad"
                  value={valores[d.iso] ?? ''}
                  onChangeText={(t) =>
                    setValores((prev) => ({ ...prev, [d.iso]: mascaraMilhar(t) }))
                  }
                  placeholder="R$ 0"
                />
              </View>
            </View>
          ))}
          <Botao titulo="Salvar estimativas" aoPressionar={salvar} carregando={salvando} />
        </Cartao>
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
    marginBottom: espacamento.md,
  },
  seletorBotao: {
    padding: espacamento.sm,
  },
  seletorTexto: {
    ...tipografia.subtitulo,
    color: cores.texto,
  },
  totalRotulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  totalValor: {
    ...tipografia.titulo,
    color: cores.primaria,
    fontWeight: '700',
    marginTop: 2,
  },
  linhaDia: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.md,
    paddingVertical: espacamento.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
  },
  diaBox: {
    width: 48,
    alignItems: 'center',
  },
  diaSemana: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  diaNumero: {
    ...tipografia.subtitulo,
    color: cores.texto,
    fontWeight: '700',
  },
  campoBox: {
    flex: 1,
  },
});

export default CentralVendasScreen;
