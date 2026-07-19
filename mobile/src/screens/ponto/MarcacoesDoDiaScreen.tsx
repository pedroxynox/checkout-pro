/**
 * Marcações do dia — lista de TODOS os colaboradores escalados para hoje, com
 * os horários do dia: entrada, saída de intervalo, volta do intervalo e
 * encerramento. Quem ainda não bateu ponto aparece com as marcações em branco
 * (—), para dar visibilidade de quem falta registrar. Somente leitura, sempre o
 * dia em curso.
 *
 * Fica em tela própria (aberta pela card do Relógio Ponto) para não
 * sobrecarregar aquela tela.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fiscaisService } from '../../api/services';
import { ItemEquipeDiaFiscal, TipoBatida } from '../../api/types';
import { Cartao, Carregando, EstadoVazio, MensagemErro, Tela } from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, tipografia } from '../../theme';

/** Ordem e rótulos curtos das 4 marcações exibidas. */
const MARCACOES_ORDEM: { tipo: TipoBatida; rotulo: string }[] = [
  { tipo: 'ENTRADA', rotulo: 'Entrada' },
  { tipo: 'SAIDA_INTERVALO', rotulo: 'Saída' },
  { tipo: 'RETORNO_INTERVALO', rotulo: 'Volta' },
  { tipo: 'ENCERRAMENTO', rotulo: 'Encerramento' },
];

/** "HH:mm" a partir do ISO gravado (hora de parede, sem fuso). */
function horaLabel(iso: string): string {
  return iso.slice(11, 16);
}

/** true quando a pessoa ainda não tem nenhuma batida no dia. */
function semBatidas(item: ItemEquipeDiaFiscal): boolean {
  return (item.marcacoes ?? []).length === 0;
}

/** Menor hora (ISO) entre as marcações — para ordenar quem já bateu. */
function primeiraMarcacaoMs(item: ItemEquipeDiaFiscal): number {
  const horas = (item.marcacoes ?? []).map((m) => Date.parse(m.hora));
  return horas.length ? Math.min(...horas) : Number.MAX_SAFE_INTEGER;
}

export function MarcacoesDoDiaScreen(): React.ReactElement {
  const equipe = useRequisicao<ItemEquipeDiaFiscal[]>(
    () => fiscaisService.equipeDia(),
    [],
  );

  // Quem já bateu primeiro (por hora); depois quem ainda não bateu (por entrada
  // prevista / nome), para dar visibilidade de quem falta registrar.
  const lista = [...(equipe.dados ?? [])].sort((a, b) => {
    const sa = semBatidas(a);
    const sb = semBatidas(b);
    if (sa !== sb) return sa ? 1 : -1;
    if (!sa && !sb) return primeiraMarcacaoMs(a) - primeiraMarcacaoMs(b);
    const ea = a.entradaPrevista ?? '99:99';
    const eb = b.entradaPrevista ?? '99:99';
    return ea.localeCompare(eb) || a.primeiroNome.localeCompare(b.primeiroNome);
  });

  return (
    <Tela aoAtualizar={equipe.recarregar} atualizando={equipe.carregando}>
      {equipe.carregando && !equipe.dados ? (
        <Carregando />
      ) : equipe.erro ? (
        <MensagemErro
          mensagem={equipe.erro}
          aoTentarNovamente={equipe.recarregar}
        />
      ) : lista.length === 0 ? (
        <EstadoVazio
          icone="time-outline"
          titulo="Sem escalados"
          descricao="Ninguém está escalado para trabalhar hoje."
        />
      ) : (
        <Cartao>
          <Text style={styles.titulo}>Marcações do dia</Text>
          <Text style={styles.sub}>
            Todos os escalados de hoje · quem ainda não bateu aparece em branco
          </Text>
          {lista.map((p) => {
            const pendente = semBatidas(p);
            return (
              <View key={p.pessoaId} style={styles.pessoa}>
                <View style={styles.nomeLinha}>
                  <Text
                    style={[styles.nome, pendente && styles.nomePendente]}
                    numberOfLines={1}
                  >
                    {p.primeiroNome}
                  </Text>
                  {p.falta ? (
                    <Text style={styles.tagFalta}>Falta</Text>
                  ) : p.alertaAtraso ? (
                    <Text style={styles.tagAtraso}>Sem registrar</Text>
                  ) : pendente && p.entradaPrevista ? (
                    <Text style={styles.tagPrevista}>prev. {p.entradaPrevista}</Text>
                  ) : null}
                </View>
                <View style={styles.horas}>
                  {MARCACOES_ORDEM.map(({ tipo, rotulo }) => {
                    const m = (p.marcacoes ?? []).find((x) => x.tipo === tipo);
                    return (
                      <View key={tipo} style={styles.slot}>
                        <Text style={styles.rotulo}>{rotulo}</Text>
                        <Text style={styles.hora}>
                          {m ? horaLabel(m.hora) : '—'}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </Cartao>
      )}
    </Tela>
  );
}

export default MarcacoesDoDiaScreen;

const styles = StyleSheet.create({
  titulo: {
    ...tipografia.subtitulo,
    fontWeight: '700',
    color: cores.texto,
  },
  sub: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.xs,
  },
  pessoa: {
    paddingVertical: espacamento.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
  },
  nomeLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    marginBottom: espacamento.xs,
  },
  nome: {
    ...tipografia.corpo,
    fontWeight: '700',
    color: cores.texto,
    flex: 1,
  },
  nomePendente: {
    color: cores.textoSecundario,
  },
  tagFalta: {
    ...tipografia.legenda,
    fontWeight: '700',
    color: cores.texto,
    backgroundColor: cores.divisor,
    paddingHorizontal: espacamento.sm,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  tagAtraso: {
    ...tipografia.legenda,
    fontWeight: '700',
    color: cores.vermelho,
    backgroundColor: cores.vermelhoFundo,
    paddingHorizontal: espacamento.sm,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  tagPrevista: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  horas: {
    flexDirection: 'row',
  },
  slot: {
    flex: 1,
    alignItems: 'center',
  },
  rotulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  hora: {
    ...tipografia.subtitulo,
    fontWeight: '700',
    color: cores.texto,
  },
});
