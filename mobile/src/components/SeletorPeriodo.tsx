/**
 * Seletor de PERÍODO (início + fim) com contador de dias ao vivo e campo de
 * duração editável.
 *
 * Resolve as duas formas de pensar um período, mantendo-as sempre coerentes:
 *  - **"de tal dia até tal dia"** — mexe nas datas e o contador acompanha;
 *  - **"tantos dias"** — digita a duração e a data de fim se acomoda sozinha
 *    (evita contar de cabeça onde termina um atestado de 5 dias).
 *
 * O contador usa `contarDiasCorridos`, o mesmo cálculo do backend: conta os dois
 * extremos e **inclui domingos, feriados e folga**, porque é um dia de ausência
 * gravado por cada dia corrido. O número exibido é o que será registrado.
 *
 * Mover o **início** preserva a duração (desloca a janela inteira) em vez de
 * encolher o período — antes, empurrar o início para depois do fim colapsava
 * tudo para 1 dia sem nenhum sinal na tela.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { cores, espacamento, tipografia } from '../theme';
import {
  contarDiasCorridos,
  deslocarDiasISO,
  isoParaDiaMes,
} from '../utils/formato';
import { Aviso } from './Aviso';
import { CampoTexto } from './CampoTexto';
import { SeletorData } from './SeletorData';

/** Duração máxima aceita no campo (o backend recusa acima de ~6 meses/1 ano). */
const MAX_DIAS_CAMPO = 366;

export function SeletorPeriodo({
  inicio,
  fim,
  aoMudarInicio,
  aoMudarFim,
  dataMinima,
  rotuloInicio = 'Início',
  rotuloFim = 'Fim',
  limiteAviso,
  textoAviso,
  avisoExtra,
}: {
  /** Data de início (ISO `yyyy-mm-dd`). */
  inicio: string;
  /** Data de fim (ISO `yyyy-mm-dd`), inclusive. */
  fim: string;
  aoMudarInicio: (iso: string) => void;
  aoMudarFim: (iso: string) => void;
  /** Data mínima permitida para o início (ex.: Data Inicial do Sistema). */
  dataMinima?: string;
  rotuloInicio?: string;
  rotuloFim?: string;
  /**
   * Quando a duração PASSA deste número de dias, exibe `textoAviso`. Serve para
   * chamar atenção sem bloquear (ex.: 15 dias no atestado, 30 nas férias).
   */
  limiteAviso?: number;
  textoAviso?: string;
  /**
   * Aviso adicional, independente da duração (ex.: o período atravessa o
   * fechamento da folha). `null` quando não há nada a dizer.
   */
  avisoExtra?: { texto: string; tom: 'info' | 'alerta' } | null;
}): React.ReactElement {
  /**
   * Texto em edição no campo de duração. `null` significa "mostrar a duração
   * calculada das datas" — é o estado normal; só vira texto enquanto se digita,
   * para não atrapalhar quem apaga o campo antes de escrever o novo número.
   */
  const [rascunho, setRascunho] = useState<string | null>(null);

  const dias = contarDiasCorridos(inicio, fim);

  /** Desloca a janela inteira, preservando a duração escolhida. */
  const mudarInicio = (novoInicio: string): void => {
    const duracao = Math.max(1, dias);
    setRascunho(null);
    aoMudarInicio(novoInicio);
    aoMudarFim(deslocarDiasISO(novoInicio, duracao - 1));
  };

  const mudarFim = (novoFim: string): void => {
    setRascunho(null);
    aoMudarFim(novoFim);
  };

  /** Digitar a duração reposiciona o fim a partir do início. */
  const mudarDuracao = (texto: string): void => {
    const digitos = texto.replace(/\D/g, '').slice(0, 3);
    setRascunho(digitos);
    const n = Number(digitos);
    if (Number.isFinite(n) && n >= 1 && n <= MAX_DIAS_CAMPO) {
      aoMudarFim(deslocarDiasISO(inicio, n - 1));
    }
  };

  const resumo =
    dias <= 0
      ? 'Período inválido'
      : dias === 1
        ? `1 dia · ${isoParaDiaMes(inicio)}`
        : `${dias} dias · ${isoParaDiaMes(inicio)} a ${isoParaDiaMes(fim)}`;

  const mostrarAviso =
    limiteAviso !== undefined && !!textoAviso && dias > limiteAviso;

  return (
    <View>
      <SeletorData
        rotulo={rotuloInicio}
        valor={inicio}
        aoMudar={mudarInicio}
        dataMinima={dataMinima}
      />
      <SeletorData
        rotulo={rotuloFim}
        valor={fim}
        aoMudar={mudarFim}
        dataMinima={inicio}
      />

      <CampoTexto
        rotulo="Duração (dias)"
        accessibilityLabel="Duração em dias"
        keyboardType="number-pad"
        value={rascunho ?? String(dias)}
        onChangeText={mudarDuracao}
        onBlur={() => setRascunho(null)}
        placeholder="1"
        containerStyle={styles.campoDuracao}
      />

      <Text
        style={styles.resumo}
        accessibilityLabel={`Duração do período: ${resumo}`}
      >
        {resumo}
      </Text>

      {mostrarAviso ? <Aviso tom="alerta" texto={textoAviso} /> : null}

      {avisoExtra ? (
        <Aviso tom={avisoExtra.tom} texto={avisoExtra.texto} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  campoDuracao: {
    marginBottom: espacamento.xs,
  },
  resumo: {
    ...tipografia.corpo,
    fontWeight: '700',
    color: cores.primaria,
    marginBottom: espacamento.md,
  },
});

export default SeletorPeriodo;
