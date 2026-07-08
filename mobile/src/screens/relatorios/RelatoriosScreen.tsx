/**
 * Relatórios de operadores (PDF).
 *
 * Gera um relatório imprimível (uma folha A4 por operador) com as estatísticas
 * do perfil — score, indicadores, faltas, incidências, gráficos de barras e
 * pizza. Permite escolher o período (mês corrente por padrão — igual à tela de
 * perfil — ou um intervalo personalizado) e baixar o relatório de **todos** os
 * operadores ativos de uma vez ou de **um** operador individualmente.
 *
 * A geração é feita no cliente (expo-print) a partir dos dados do perfil que a
 * API já entrega; não há mudança de backend. O envio automático por e-mail fica
 * para uma etapa futura.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { colaboradoresService } from '../../api/services';
import { Colaborador, PerfilColaborador } from '../../api/types';
import {
  Botao,
  Carregando,
  Cartao,
  EstadoVazio,
  MensagemErro,
  SeletorData,
  Segmentado,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { notificar } from '../../utils/dialogos';
import { hojeISO } from '../../utils/formato';
import { imprimirRelatorio } from '../../utils/impressao';
import { htmlRelatorio, mesAtual, rotuloPeriodo } from '../../utils/relatorioPerfil';

type ModoPeriodo = 'MES' | 'PERIODO';

export function RelatoriosScreen(): React.ReactElement {
  const operadores = useRequisicao<Colaborador[]>(
    () => colaboradoresService.listar({ funcao: 'OPERADOR', ativo: true }),
    [],
  );

  const [modo, setModo] = useState<ModoPeriodo>('MES');
  const [inicio, setInicio] = useState<string>(() => mesAtual(hojeISO()).inicio);
  const [fim, setFim] = useState<string>(() => mesAtual(hojeISO()).fim);
  // id do operador com PDF em geração (ou 'TODOS'); null = nada gerando.
  const [gerando, setGerando] = useState<string | null>(null);

  const periodo = useMemo(
    () => (modo === 'MES' ? mesAtual(hojeISO()) : { inicio, fim }),
    [modo, inicio, fim],
  );

  const gerarPara = useCallback(
    async (
      chave: string,
      lista: Colaborador[],
      titulo: string,
    ): Promise<void> => {
      if (lista.length === 0) {
        notificar('Sem operadores', 'Não há operadores ativos para gerar.');
        return;
      }
      setGerando(chave);
      try {
        const perfis: PerfilColaborador[] = await Promise.all(
          lista.map((c) => colaboradoresService.perfil(c.id, periodo)),
        );
        const html = htmlRelatorio(perfis, { periodo, titulo });
        await imprimirRelatorio(html);
      } catch (e) {
        notificar(
          'Não foi possível gerar',
          e instanceof ApiError ? e.message : 'Tente novamente.',
        );
      } finally {
        setGerando(null);
      }
    },
    [periodo],
  );

  const lista = operadores.dados ?? [];
  const ocupado = gerando !== null;

  return (
    <Tela aoAtualizar={operadores.recarregar} atualizando={operadores.atualizando}>
      <Cartao titulo="Período">
        <Segmentado<ModoPeriodo>
          opcoes={[
            { valor: 'MES', rotulo: 'Mês atual' },
            { valor: 'PERIODO', rotulo: 'Escolher período' },
          ]}
          selecionado={modo}
          aoSelecionar={setModo}
        />
        {modo === 'MES' ? (
          <Text style={styles.periodoInfo}>
            {rotuloPeriodo(periodo.inicio, periodo.fim)}
          </Text>
        ) : (
          <View style={styles.datas}>
            <SeletorData rotulo="Início" valor={inicio} aoMudar={setInicio} />
            <SeletorData rotulo="Fim" valor={fim} aoMudar={setFim} />
          </View>
        )}
      </Cartao>

      <Botao
        titulo={
          gerando === 'TODOS'
            ? 'Gerando...'
            : `Baixar relatório de todos (${lista.length})`
        }
        aoPressionar={() =>
          void gerarPara('TODOS', lista, 'Relatório de operadores')
        }
        carregando={gerando === 'TODOS'}
        desabilitado={ocupado || operadores.carregando || lista.length === 0}
      />
      <Text style={styles.dica}>
        Um operador por página (A4), pronto para imprimir.
      </Text>

      {operadores.carregando ? (
        <Carregando />
      ) : operadores.erro ? (
        <MensagemErro
          mensagem={operadores.erro}
          aoTentarNovamente={operadores.recarregar}
        />
      ) : lista.length === 0 ? (
        <EstadoVazio
          icone="people-outline"
          titulo="Sem operadores"
          descricao="Não há operadores ativos cadastrados."
        />
      ) : (
        <Cartao titulo="Individual">
          {lista.map((c) => (
            <View key={c.id} style={styles.linha}>
              <Text style={styles.nome} numberOfLines={1}>
                {c.nome}
              </Text>
              <Pressable
                disabled={ocupado}
                onPress={() =>
                  void gerarPara(c.id, [c], `Relatório — ${c.nome}`)
                }
                style={({ pressed }) => [
                  styles.btnPdf,
                  (pressed || gerando === c.id) && styles.pressionado,
                ]}
              >
                <Ionicons
                  name="document-text-outline"
                  size={16}
                  color={cores.primaria}
                />
                <Text style={styles.btnPdfTexto}>
                  {gerando === c.id ? 'Gerando...' : 'PDF'}
                </Text>
              </Pressable>
            </View>
          ))}
        </Cartao>
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  periodoInfo: {
    ...tipografia.corpo,
    color: cores.texto,
    fontWeight: '600',
    marginTop: espacamento.sm,
  },
  datas: {
    marginTop: espacamento.sm,
  },
  dica: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.xs,
    marginBottom: espacamento.md,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: espacamento.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  nome: {
    ...tipografia.corpo,
    color: cores.texto,
    flex: 1,
    paddingRight: espacamento.sm,
  },
  btnPdf: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    paddingVertical: espacamento.xs,
    paddingHorizontal: espacamento.md,
    borderRadius: raio.sm,
    borderWidth: 1,
    borderColor: cores.primaria,
    backgroundColor: cores.primariaClara,
  },
  btnPdfTexto: {
    ...tipografia.rotulo,
    color: cores.primaria,
    fontWeight: '700',
  },
  pressionado: {
    opacity: 0.6,
  },
});

export default RelatoriosScreen;
