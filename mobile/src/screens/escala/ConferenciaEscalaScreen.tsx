/**
 * **Conferência de escala** — onde a ficha e a escala semanal discordam.
 *
 * ## A pergunta que esta tela responde
 *
 * "Por que a escala mostra um horário que não está na ficha?" A
 * [ADR 0026](../../../../docs/02-arquitetura/decisoes/0026-horario-e-o-da-ficha.md)
 * resolveu o **horário exibido** (agora é sempre o da ficha). Falta a etapa 2: a
 * **detecção automática de falta** passar a ler a ficha, e a cópia semanal
 * desaparecer.
 *
 * Essa troca não é neutra — hoje, quando as duas fontes discordam, o sistema cobra
 * pela hora **mais tardia**. Quem tem ficha mais cedo que a cópia passaria a ser
 * cobrado antes, e poderia receber falta onde hoje não recebe. Por isso a tela
 * existe: **ver quem seria afetado, antes de mexer.**
 *
 * ## Por que uma tela, e não só o comando
 *
 * A apuração já existia, mas só como `npm run integridade` — comando de terminal,
 * com acesso ao banco de produção. Quem precisa da resposta é a gestão, que não
 * roda comandos. Um diagnóstico que só o time técnico consegue ler não é um
 * diagnóstico: é um privilégio.
 *
 * ## A ordem dos blocos, e por quê
 *
 * 1. **Veredito** — pode ou não pode avançar, e quem impede. É a única pergunta
 *    que a tela precisa responder de imediato.
 * 2. **Quem seria cobrado mais cedo** — o risco real, com pessoa, dia e minutos.
 * 3. **Ficha sem dia de folga** — perderiam o descanso. Bloqueio absoluto.
 * 4. **Domingo sem horário** — trabalham domingo (e feriado) sem hora.
 * 5. **Ficha sem horário** e **horário pela metade** — cadastro incompleto.
 * 6. **Outras divergências** — aparecem na escala, mas não mudam cobrança.
 * 7. **Sem escala gravada** e **duplicadas** — resquícios da cópia semanal.
 *
 * Só leitura: a correção é reabrir e salvar a ficha, que regenera a escala.
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { escalaService } from '../../api/services';
import {
  ConferenciaEscala,
  DiaIncoerente,
  FiscalEscalaIncoerente,
} from '../../api/types';
import {
  Cartao,
  Carregando,
  EstadoVazio,
  MensagemErro,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, raio, tipografia } from '../../theme';

const NOMES_DIA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Nome curto do dia da semana (0 = domingo). */
function nomeDoDia(dia: number): string {
  return NOMES_DIA[dia] ?? String(dia);
}

/** O turno de um lado da comparação, em texto. */
function turnoTexto(
  turno: DiaIncoerente['ficha'] | DiaIncoerente['escala'],
): string {
  if (!turno) return 'nada';
  if (turno.folga) return 'folga';
  return `${turno.entrada ?? '—'}–${turno.saida ?? '—'}`;
}

/** "25 min" / "1h05" — a distância que a cobrança adiantaria. */
function minutosTexto(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

/** Uma pessoa e o(s) dia(s) em que a cobrança adiantaria. */
function LinhaRisco({
  pessoa,
}: {
  pessoa: FiscalEscalaIncoerente;
}): React.ReactElement {
  const dias = pessoa.dias.filter((d) => d.efeito === 'COBRA_MAIS_CEDO');
  return (
    <View style={styles.item}>
      <Text style={styles.itemNome}>{pessoa.nome}</Text>
      {dias.map((d) => (
        <Text key={d.diaSemana} style={styles.itemDetalhe}>
          {nomeDoDia(d.diaSemana)}: a ficha diz {turnoTexto(d.ficha)} e o sistema
          hoje cobra {turnoTexto(d.escala)} — passaria a cobrar{' '}
          {minutosTexto(d.minutosAdiantados)} mais cedo
        </Text>
      ))}
    </View>
  );
}

/** Uma pessoa e o(s) dia(s) divergentes que não mudam a cobrança. */
function LinhaDivergencia({
  pessoa,
}: {
  pessoa: FiscalEscalaIncoerente;
}): React.ReactElement {
  return (
    <View style={styles.item}>
      <Text style={styles.itemNome}>
        {pessoa.nome}
        {pessoa.fichaVazia ? ' · ficha sem horários' : ''}
      </Text>
      {pessoa.dias.map((d) => (
        <Text key={d.diaSemana} style={styles.itemDetalhe}>
          {nomeDoDia(d.diaSemana)}: ficha {turnoTexto(d.ficha)} · escala{' '}
          {turnoTexto(d.escala)}
        </Text>
      ))}
    </View>
  );
}

export function ConferenciaEscalaScreen(): React.ReactElement {
  const req = useRequisicao<ConferenciaEscala>(() =>
    escalaService.conferenciaEscala(),
  );
  const d = req.dados;

  // Separa o risco real (a cobrança adiantaria) das divergências que só aparecem
  // na escala. Misturar os dois é o que faz um relatório ser ignorado.
  const comRisco = (d?.incoerentes ?? []).filter((p) =>
    p.dias.some((x) => x.efeito === 'COBRA_MAIS_CEDO'),
  );
  const semRisco = (d?.incoerentes ?? []).filter(
    (p) => !p.dias.some((x) => x.efeito === 'COBRA_MAIS_CEDO'),
  );

  return (
    <Tela aoAtualizar={req.recarregar} atualizando={req.atualizando}>
      {req.carregando ? (
        <Carregando />
      ) : req.erro ? (
        <MensagemErro mensagem={req.erro} aoTentarNovamente={req.recarregar} />
      ) : !d ? (
        <EstadoVazio
          icone="git-compare-outline"
          titulo="Sem dados"
          descricao="Não foi possível apurar a conferência de escala."
        />
      ) : (
        <>
          {/* ===== 1. Veredito ===== */}
          <Cartao>
            <View style={styles.topo}>
              <View
                style={[
                  styles.iconeBox,
                  {
                    backgroundColor:
                      d.bloqueiamEtapa2 === 0
                        ? cores.verdeFundo
                        : cores.amareloFundo,
                  },
                ]}
              >
                <Ionicons
                  name={
                    d.bloqueiamEtapa2 === 0 ? 'checkmark-circle' : 'alert-circle'
                  }
                  size={22}
                  color={d.bloqueiamEtapa2 === 0 ? cores.verde : cores.amarelo}
                />
              </View>
              <View style={styles.flex1}>
                <Text style={styles.titulo}>Conferência de escala</Text>
                <Text style={styles.subtitulo}>
                  {d.totalFiscaisAtivos} fiscais ativos · {d.coerentes} sem
                  divergência
                </Text>
              </View>
            </View>

            <Text style={styles.veredito}>
              {d.bloqueiamEtapa2 === 0
                ? 'Nenhuma pessoa seria cobrada mais cedo nem perderia o dia de folga. Dá para o sistema passar a cobrar o ponto pelo horário da ficha.'
                : `${d.bloqueiamEtapa2} pessoa(s) seriam afetadas se o sistema passasse a cobrar o ponto pelo horário da ficha: ${d.nomesQueBloqueiam.join(', ')}.`}
            </Text>

            <Text style={styles.nota}>
              Hoje, quando a ficha e a escala semanal discordam, o sistema cobra
              pela hora mais tardia das duas — para nunca criar uma falta que não
              existia. Esta tela mostra quem sairia dessa proteção.
            </Text>
            <Text style={styles.nota}>
              Para corrigir qualquer item: abrir a ficha do colaborador, ajustar o
              horário e salvar. Salvar regenera a escala a partir da ficha.
            </Text>
          </Cartao>

          {/* ===== 2. Seriam cobrados mais cedo ===== */}
          {comRisco.length > 0 && (
            <Cartao titulo="Seriam cobrados mais cedo">
              {comRisco.map((p) => (
                <LinhaRisco key={p.colaboradorId} pessoa={p} />
              ))}
              <Text style={styles.nota}>
                É o único caso que pode gerar falta onde hoje não existe. Conferir
                o horário da ficha destas pessoas antes de mudar a regra.
              </Text>
            </Cartao>
          )}

          {/* ===== 3. Ficha sem dia de folga ===== */}
          {d.semFolgaNaFicha.length > 0 && (
            <Cartao titulo="Ficha sem dia de folga">
              {d.semFolgaNaFicha.map((p) => (
                <View key={p.colaboradorId} style={styles.item}>
                  <Text style={styles.itemNome}>{p.nome}</Text>
                  <Text style={styles.itemDetalhe}>
                    hoje descansa {p.diasDeFolgaNaEscala.map(nomeDoDia).join(', ')}{' '}
                    por causa da escala semanal, não da ficha
                  </Text>
                </View>
              ))}
              <Text style={styles.nota}>
                Sem dia de folga na ficha, estas pessoas ficariam escaladas todos
                os dias. Cadastrar o dia de folga na ficha resolve.
              </Text>
            </Cartao>
          )}

          {/* ===== 4. Domingo sem horário ===== */}
          {d.domingoSemHorario.length > 0 && (
            <Cartao titulo="Trabalham domingo sem horário de domingo">
              {d.domingoSemHorario.map((p) => (
                <View key={p.colaboradorId} style={styles.item}>
                  <Text style={styles.itemNome}>
                    {p.nome} · grupo {p.grupoDomingo}
                  </Text>
                  <Text style={styles.itemDetalhe}>
                    falta{' '}
                    {p.falta === 'AMBAS'
                      ? 'entrada e saída'
                      : p.falta === 'ENTRADA'
                        ? 'a entrada'
                        : 'a saída'}{' '}
                    de domingo na ficha
                  </Text>
                </View>
              ))}
              <Text style={styles.nota}>
                O horário de domingo também é o de feriado. Sem ele, o feriado usa
                o horário normal do dia.
              </Text>
            </Cartao>
          )}

          {/* ===== 5. Cadastro incompleto ===== */}
          {d.horarioIncompleto.length > 0 && (
            <Cartao titulo="Horário pela metade na ficha">
              {d.horarioIncompleto.map((p) => (
                <View key={p.colaboradorId} style={styles.item}>
                  <Text style={styles.itemNome}>{p.nome}</Text>
                  <Text style={styles.itemDetalhe}>
                    falta a entrada ou a saída em: {p.blocos.join(', ')}
                  </Text>
                </View>
              ))}
              <Text style={styles.nota}>
                Um bloco pela metade faz o dia desaparecer da escala em silêncio.
              </Text>
            </Cartao>
          )}

          {/* ===== 6. Outras divergências ===== */}
          {semRisco.length > 0 && (
            <Cartao titulo="Outras divergências">
              {semRisco.map((p) => (
                <LinhaDivergencia key={p.colaboradorId} pessoa={p} />
              ))}
              <Text style={styles.nota}>
                Estas aparecem na escala, mas não mudam a hora cobrada hoje. Vale
                alinhar para a escala publicada e o cadastro contarem a mesma
                história.
              </Text>
            </Cartao>
          )}

          {/* ===== 7. Resquícios da cópia semanal ===== */}
          {d.semEscala.length > 0 && (
            <Cartao titulo="Ficha preenchida e sem escala gravada">
              {d.semEscala.map((p) => (
                <View key={p.colaboradorId} style={styles.item}>
                  <Text style={styles.itemNome}>{p.nome}</Text>
                </View>
              ))}
              <Text style={styles.nota}>
                Estas pessoas nunca recebem falta automática. Salvar a ficha
                regenera a escala.
              </Text>
            </Cartao>
          )}

          {d.duplicadas.length > 0 && (
            <Cartao titulo="Entradas repetidas na escala">
              {d.duplicadas.map((x) => (
                <View
                  key={`${x.funcionarioId}-${x.diaSemana}`}
                  style={styles.item}
                >
                  <Text style={styles.itemDetalhe}>
                    {nomeDoDia(x.diaSemana)}: {x.quantidade} entradas para a mesma
                    pessoa
                  </Text>
                </View>
              ))}
            </Cartao>
          )}

          {d.ok && (
            <View style={styles.tudoCerto}>
              <Ionicons name="checkmark-circle" size={22} color={cores.verde} />
              <Text style={styles.tudoCertoTexto}>
                Fichas e escala semanal coerentes. Nada a ajustar.
              </Text>
            </View>
          )}
        </>
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.md,
  },
  iconeBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titulo: { ...tipografia.subtitulo, color: cores.texto },
  subtitulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  veredito: {
    ...tipografia.corpo,
    color: cores.texto,
    marginTop: espacamento.md,
    lineHeight: 20,
  },
  nota: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
    lineHeight: 16,
  },
  item: {
    borderLeftWidth: 3,
    borderLeftColor: cores.divisor,
    paddingLeft: espacamento.md,
    paddingVertical: espacamento.xs,
    marginBottom: espacamento.sm,
  },
  itemNome: { ...tipografia.rotulo, color: cores.texto, fontWeight: '700' },
  itemDetalhe: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
    lineHeight: 16,
  },
  tudoCerto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    backgroundColor: cores.verdeFundo,
    borderRadius: raio.lg,
    padding: espacamento.lg,
  },
  tudoCertoTexto: {
    ...tipografia.rotulo,
    color: cores.verde,
    fontWeight: '600',
    flex: 1,
  },
});

export default ConferenciaEscalaScreen;
