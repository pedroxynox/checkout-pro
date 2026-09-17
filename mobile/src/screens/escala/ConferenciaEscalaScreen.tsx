/**
 * **Conferência de escala** — as lacunas da ficha, e o que sobrou da cópia semanal.
 *
 * ## De onde esta tela veio
 *
 * Da pergunta "por que a escala mostra um horário que não está na ficha?". A
 * [ADR 0026](../../../../docs/02-arquitetura/decisoes/0026-horario-e-o-da-ficha.md)
 * respondeu em duas etapas: primeiro o horário **exibido** passou a ser sempre o da
 * ficha; depois a **hora cobrada** também. Foi esta tela que autorizou a segunda
 * etapa — ela nomeou as sete pessoas cuja cópia semanal estava até uma hora mais
 * tardia que a ficha, e portanto as sete cujo atraso real o sistema não via.
 *
 * ## O que ela responde agora
 *
 * A hora cobrada é a da ficha, então uma diferença com a cópia semanal **não afeta
 * mais ninguém**. O assunto virou outro, e é mais importante: as **lacunas da
 * própria ficha**. Como ela é a única fonte, um vazio nela não é mais coberto por
 * nada — quem está sem horário simplesmente não é esperado em dia nenhum, e por
 * isso nunca aparece atrasado nem faltante.
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
 * 1. **Resumo** — quantas fichas têm lacuna, e de quem são.
 * 2. **Ficha sem horário** — não são cobradas em nenhum dia. O caso mais grave.
 * 3. **Ficha sem dia de folga** — hoje descansam por causa da cópia; quando ela
 *    sair, ficariam escaladas todos os dias.
 * 4. **Domingo sem horário** — trabalham domingo (e feriado) sem hora.
 * 5. **Horário pela metade** — o dia desaparece da escala em silêncio.
 * 6. **Cópia semanal desatualizada** — informativo: onde a regeneração não chegou.
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

/** "25 min" / "1h05" — a distância entre a hora da ficha e a da cópia. */
function minutosTexto(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

/** Uma pessoa cuja ficha não tem horário nenhum, e o que sobrou na cópia. */
function LinhaFichaVazia({
  pessoa,
}: {
  pessoa: FiscalEscalaIncoerente;
}): React.ReactElement {
  const comHora = pessoa.dias.filter((d) => d.escala && !d.escala.folga);
  return (
    <View style={styles.item}>
      <Text style={styles.itemNome}>{pessoa.nome}</Text>
      <Text style={styles.itemDetalhe}>
        sem nenhum horário na ficha — não é esperada em dia nenhum
      </Text>
      {comHora.length > 0 && (
        <Text style={styles.itemDetalhe}>
          a cópia semanal ainda guarda {turnoTexto(comHora[0].escala)}, mas nada
          lê esse horário
        </Text>
      )}
    </View>
  );
}

/** Uma pessoa e os dias em que a cópia semanal ficou diferente da ficha. */
function LinhaDivergencia({
  pessoa,
}: {
  pessoa: FiscalEscalaIncoerente;
}): React.ReactElement {
  return (
    <View style={styles.item}>
      <Text style={styles.itemNome}>{pessoa.nome}</Text>
      {pessoa.dias.map((d) => (
        <Text key={d.diaSemana} style={styles.itemDetalhe}>
          {nomeDoDia(d.diaSemana)}: ficha {turnoTexto(d.ficha)} · cópia{' '}
          {turnoTexto(d.escala)}
          {d.minutosDeDiferenca > 0
            ? ` (${minutosTexto(d.minutosDeDiferenca)} de diferença)`
            : ''}
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

  // Separa o que deixa alguém fora do controle de ponto (ficha sem horário) do
  // que é apenas a cópia semanal desatualizada. Misturar os dois é o que faz um
  // relatório ser ignorado.
  const semHorario = (d?.incoerentes ?? []).filter((p) => p.fichaVazia);
  const copiaVelha = (d?.incoerentes ?? []).filter((p) => !p.fichaVazia);

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
                      d.fichasComLacuna === 0
                        ? cores.verdeFundo
                        : cores.amareloFundo,
                  },
                ]}
              >
                <Ionicons
                  name={
                    d.fichasComLacuna === 0 ? 'checkmark-circle' : 'alert-circle'
                  }
                  size={22}
                  color={d.fichasComLacuna === 0 ? cores.verde : cores.amarelo}
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
              {d.fichasComLacuna === 0
                ? 'Todas as fichas têm horário completo. O controle de ponto cobre a equipe inteira.'
                : `${d.fichasComLacuna} ficha(s) com informação faltando: ${d.nomesComLacuna.join(', ')}.`}
            </Text>

            <Text style={styles.nota}>
              O horário cobrado é o da ficha do colaborador, e só ele. Por isso uma
              lacuna na ficha deixa a pessoa sem hora esperada — e quem não tem hora
              esperada nunca aparece como atrasada nem como faltante.
            </Text>
            <Text style={styles.nota}>
              Para corrigir qualquer item: abrir a ficha do colaborador, ajustar o
              horário e salvar. Salvar regenera a escala a partir da ficha.
            </Text>
          </Cartao>

          {/* ===== 2. Ficha sem horário ===== */}
          {semHorario.length > 0 && (
            <Cartao titulo="Ficha sem horário">
              {semHorario.map((p) => (
                <LinhaFichaVazia key={p.colaboradorId} pessoa={p} />
              ))}
              <Text style={styles.nota}>
                É o caso mais grave: estas pessoas estão fora do controle de ponto.
                Cadastrar o horário na ficha resolve.
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
                    por causa da cópia semanal, não da ficha
                  </Text>
                </View>
              ))}
              <Text style={styles.nota}>
                É o último ponto em que a cópia semanal ainda decide algo. Quando
                ela sair, estas pessoas ficariam escaladas todos os dias.
                Cadastrar o dia de folga na ficha resolve.
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
                O horário de domingo também é o de feriado. Sem ele, o domingo fica
                sem hora esperada e o feriado usa o horário normal do dia.
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

          {/* ===== 6. Cópia semanal desatualizada (informativo) ===== */}
          {copiaVelha.length > 0 && (
            <Cartao titulo="Cópia semanal desatualizada">
              {copiaVelha.map((p) => (
                <LinhaDivergencia key={p.colaboradorId} pessoa={p} />
              ))}
              <Text style={styles.nota}>
                Nada a fazer: estas diferenças não afetam ninguém. A cópia semanal é
                um resquício técnico que já não decide horário — aparece aqui só
                para mostrar onde ela ficou para trás.
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
                Resquício da cópia semanal, sem efeito sobre a cobrança. Salvar a
                ficha regenera a cópia.
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
                Fichas completas e cópia semanal em dia. Nada a ajustar.
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
