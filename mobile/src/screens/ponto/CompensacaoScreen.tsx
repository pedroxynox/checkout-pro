/**
 * Compensação de horas — tela própria, aberta pela card da Central de Jornada
 * (ADR 0021).
 *
 * Era um bloco recolhível dentro da Central. Virou tela por dois motivos: a
 * Central já é longa (hero, atalhos, resumo do time, uma card por pessoa,
 * comparativo) e enfiar aqui uma lista de sugestões com dois botões cada
 * empurrava a lista de pessoas para fora do alcance; e um recolhível esconde
 * justamente o trabalho que a seção existe para provocar — quem não abre, não
 * age.
 *
 * ## O que a tela responde, na ordem
 *
 * 1. **A carteira** — quanto o time tem de 50% em aberto e, principalmente,
 *    quanto **não cabe** nos dias que restam do ciclo. Como compensar no ciclo
 *    seguinte é proibido, essas horas serão pagas: ver isso no dia 12 permite
 *    agir; descobrir na folha, não.
 * 2. **Os dias mais fracos** — a régua que sustenta as sugestões, à vista.
 * 3. **Liberações** — uma linha por pessoa, com a frase que a justifica.
 * 4. **Coberturas de falta** — o mesmo saldo cobrindo faltas já ocorridas. Vem
 *    depois na tela, mas foi calculado **antes**: é a operação mais barata que
 *    existe, e as duas bebem da mesma carteira.
 * 5. **Já concedidas** — o que vale neste ciclo, com a opção de desfazer.
 *
 * Nada é aplicado sozinho: cada linha exige confirmação, porque mexe em folha e
 * no descanso de pessoas.
 */
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import {
  centralJornadaService,
  compensacaoHorasService,
} from '../../api/services';
import {
  CoberturaView,
  CompensacaoPainel,
  DataFracaView,
  LiberacaoView,
} from '../../api/services/compensacaoHoras';
import {
  Cartao,
  Carregando,
  EstadoVazio,
  MensagemErro,
  Selo,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { confirmar, notificar } from '../../utils/dialogos';
import { formatarDuracao } from '../../utils/formato';
import { cores, espacamento, raio, tipografia } from '../../theme';

/** Explicação de cada motivo de a seção não ter sugestões a dar. */
const TEXTO_BLOQUEIO: Record<string, string> = {
  CICLO_PASSADO:
    'Este ciclo já passou. Compensação só se planeja no ciclo aberto — cada ciclo é independente em horas.',
  CICLO_FECHADO:
    'Este ciclo está fechado e já foi para a folha. Reabra o ciclo para conceder compensações nele.',
  SEM_DATA_DISPONIVEL:
    'Não sobram dias neste ciclo para compensar. As horas de 50% em aberto serão pagas.',
  SEM_DADO_DE_VENDA:
    'Ainda não há venda suficiente para dizer qual é o dia mais fraco. Preencha as estimativas de venda do mês ou envie os arquivos de venda dos dias que faltam.',
};

/** "1 sugestão" / "3 sugestões" — plural por palavra inteira. */
function pluralSugestoes(n: number): string {
  return n === 1 ? '1 sugestão' : `${n} sugestões`;
}

/** "1 dia útil" / "4 dias úteis" — "úteis" é irregular, não leva sufixo. */
function pluralDiasUteis(n: number): string {
  return n === 1 ? '1 dia útil' : `${n} dias úteis`;
}

/** "1 pessoa" / "5 pessoas". */
function pluralPessoas(n: number): string {
  return n === 1 ? '1 pessoa' : `${n} pessoas`;
}

/** "1 dia" / "9 dias" — no último dia do ciclo o texto não pode dizer "1 dias". */
function pluralDias(n: number): string {
  return n === 1 ? '1 dia' : `${n} dias`;
}

function rotuloFuncaoCurto(f: string): string {
  if (f === 'FISCAL') return 'Fiscal';
  if (f === 'SUPERVISOR') return 'Supervisor';
  return 'Operador';
}

/** "R$ 41,2 mil" — curto, para caber na linha. */
function reaisCurto(valor: number): string {
  if (!Number.isFinite(valor) || valor <= 0) return 'sem previsão';
  if (valor >= 1_000_000) {
    return `R$ ${(valor / 1_000_000).toFixed(1).replace('.', ',')} mi`;
  }
  if (valor >= 1_000) {
    return `R$ ${(valor / 1_000).toFixed(1).replace('.', ',')} mil`;
  }
  return `R$ ${valor.toFixed(0)}`;
}

/** Uma métrica da carteira (rótulo em cima, valor grande embaixo). */
function ItemCarteira({
  rotulo,
  valor,
  cor,
  ajuda,
}: {
  rotulo: string;
  valor: string;
  cor: string;
  ajuda?: string;
}): React.ReactElement {
  return (
    <View style={styles.carteiraItem}>
      <Text style={styles.carteiraRotulo}>{rotulo}</Text>
      <Text style={[styles.carteiraValor, { color: cor }]}>{valor}</Text>
      {ajuda ? <Text style={styles.carteiraAjuda}>{ajuda}</Text> : null}
    </View>
  );
}

/** Uma data candidata na régua dos dias mais fracos. */
function DiaFraco({
  dia,
  maisFraco,
}: {
  dia: DataFracaView;
  maisFraco: boolean;
}): React.ReactElement {
  const operadores =
    dia.disponiveis.find((d) => d.funcao === 'OPERADOR')?.total ?? 0;
  return (
    <View style={[styles.diaFraco, maisFraco && styles.diaFracoDestaque]}>
      <Text
        style={[styles.diaFracoDia, maisFraco && { color: cores.primaria }]}
      >
        {dia.rotulo}
      </Text>
      <Text style={styles.diaFracoValor}>
        {reaisCurto(dia.movimentoPrevisto)}
      </Text>
      <Text style={styles.diaFracoFonte}>
        {dia.fonte === 'ESTIMATIVA'
          ? 'estimativa'
          : `média de ${dia.amostras}d`}
      </Text>
      <Text style={styles.diaFracoCobertura}>{operadores} no caixa</Text>
    </View>
  );
}

/** Uma liberação sugerida, com a justificativa e as duas ações. */
function LinhaLiberacao({
  item,
  ocupado,
  aoConceder,
  aoDescartar,
}: {
  item: LiberacaoView;
  ocupado: boolean;
  aoConceder: () => void;
  aoDescartar: () => void;
}): React.ReactElement {
  const diaInteiro = item.trabalharMs === 0;
  return (
    <View style={styles.linha}>
      <View style={styles.linhaTopo}>
        <View style={{ flex: 1 }}>
          <Text style={styles.linhaNome} numberOfLines={2}>
            {item.nome}
          </Text>
          <Text style={styles.linhaFuncao}>
            {rotuloFuncaoCurto(item.funcao)}
          </Text>
        </View>
        <View style={styles.linhaDiaBox}>
          <Text style={styles.linhaDia}>{item.rotuloDia}</Text>
          <Text style={styles.linhaDiaLabel}>
            {diaInteiro ? 'dia inteiro' : `${item.horaInicio}–${item.horaFim}`}
          </Text>
        </View>
      </View>

      <View style={styles.chips}>
        <Selo
          texto={`Compensa ${formatarDuracao(item.compensarMs)}`}
          cor={cores.azul}
          fundo={cores.azulFundo}
        />
        {diaInteiro ? (
          <Selo
            texto="Não trabalha"
            cor={cores.verde}
            fundo={cores.verdeFundo}
          />
        ) : (
          <Selo
            texto={`Trabalha ${formatarDuracao(item.trabalharMs)}`}
            cor={cores.texto}
            fundo={cores.fundo}
          />
        )}
        {!diaInteiro && item.semIntervalo && (
          <Selo texto="Sem intervalo" cor={cores.texto} fundo={cores.fundo} />
        )}
        {item.diasTac > 0 && (
          <Selo
            texto={`TAC: ${item.diasTac}`}
            cor={cores.amarelo}
            fundo={cores.amareloFundo}
          />
        )}
        <Selo
          texto={
            item.saldoDepoisMs > 0
              ? `Sobram ${formatarDuracao(item.saldoDepoisMs)}`
              : 'Zera as 50%'
          }
          cor={item.saldoDepoisMs > 0 ? cores.textoSecundario : cores.verde}
          fundo={item.saldoDepoisMs > 0 ? cores.fundo : cores.verdeFundo}
        />
      </View>

      <Text style={styles.justificativa}>{item.justificativa}</Text>

      <View style={styles.acoesLinha}>
        <Pressable
          onPress={aoConceder}
          disabled={ocupado}
          style={[styles.btn, styles.btnPrimario, ocupado && styles.btnInativo]}
        >
          <Ionicons name="checkmark" size={15} color={cores.textoInverso} />
          <Text style={styles.btnPrimarioTexto}>Conceder</Text>
        </Pressable>
        <Pressable
          onPress={aoDescartar}
          disabled={ocupado}
          style={[
            styles.btn,
            styles.btnSecundario,
            ocupado && styles.btnInativo,
          ]}
        >
          <Text style={styles.btnSecundarioTexto}>Descartar</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Uma cobertura de falta sugerida (marca o débito que já existe). */
function LinhaCobertura({
  item,
  ocupado,
  aoDebitar,
}: {
  item: CoberturaView;
  ocupado: boolean;
  aoDebitar: () => void;
}): React.ReactElement {
  return (
    <View style={styles.linha}>
      <View style={styles.linhaTopo}>
        <View style={{ flex: 1 }}>
          <Text style={styles.linhaNome} numberOfLines={2}>
            {item.nome}
          </Text>
          <Text style={styles.linhaFuncao}>
            {rotuloFuncaoCurto(item.funcao)}
          </Text>
        </View>
        <View style={styles.linhaDiaBox}>
          <Text style={styles.linhaDia}>{item.rotuloDia}</Text>
          <Text style={styles.linhaDiaLabel}>
            {item.status === 'INJUSTIFICADA'
              ? 'não justificada'
              : 'sem análise'}
          </Text>
        </View>
      </View>

      <View style={styles.chips}>
        <Selo
          texto={`Cobre ${formatarDuracao(item.cargaMs)}`}
          cor={cores.azul}
          fundo={cores.azulFundo}
        />
        <Selo
          texto={
            item.saldoDepoisMs > 0
              ? `Sobram ${formatarDuracao(item.saldoDepoisMs)}`
              : 'Zera as 50%'
          }
          cor={item.saldoDepoisMs > 0 ? cores.textoSecundario : cores.verde}
          fundo={item.saldoDepoisMs > 0 ? cores.fundo : cores.verdeFundo}
        />
      </View>

      <Text style={styles.justificativa}>{item.justificativa}</Text>

      <View style={styles.acoesLinha}>
        <Pressable
          onPress={aoDebitar}
          disabled={ocupado}
          style={[styles.btn, styles.btnPrimario, ocupado && styles.btnInativo]}
        >
          <Ionicons
            name="swap-horizontal"
            size={15}
            color={cores.textoInverso}
          />
          <Text style={styles.btnPrimarioTexto}>Cobrir com horas</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function CompensacaoScreen(): React.ReactElement {
  const navigation = useNavigation();
  const [ciclo] = useState(0);
  const [ocupado, setOcupado] = useState(false);

  const painel = useRequisicao<CompensacaoPainel>(
    () => compensacaoHorasService.painel(ciclo),
    [ciclo],
  );

  async function executar(
    acao: () => Promise<unknown>,
    sucesso: string,
  ): Promise<void> {
    setOcupado(true);
    try {
      await acao();
      painel.recarregar();
      notificar('Pronto', sucesso);
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao salvar.');
    } finally {
      setOcupado(false);
    }
  }

  /**
   * Concede a compensação: grava a decisão e, a partir daí, o cálculo da jornada
   * passa a tratar aquele dia como compensado — as horas saem do saldo de 50% da
   * pessoa e o dia não é acusado como falta nem como déficit.
   */
  async function conceder(item: LiberacaoView): Promise<void> {
    const oQue =
      item.trabalharMs === 0
        ? `não trabalhar em ${item.rotuloDia}`
        : `trabalhar ${formatarDuracao(item.trabalharMs)} (${item.horaInicio}–${item.horaFim}) em ${item.rotuloDia}`;
    const ok = await confirmar(
      'Conceder compensação',
      `${item.nome} vai ${oQue}, compensando ${formatarDuracao(
        item.compensarMs,
      )} de 50%.`,
      'Conceder',
    );
    if (!ok) return;
    await executar(
      () =>
        compensacaoHorasService.aprovar({
          colaboradorId: item.colaboradorId,
          data: item.data,
          minutosCompensados: Math.round(item.compensarMs / 60_000),
          horaInicio: item.horaInicio ?? undefined,
          horaFim: item.horaFim ?? undefined,
          origem: 'SUGESTAO',
          motivo: item.justificativa,
          vendaPrevista: item.movimentoPrevisto,
          fonteVendaPrevista: item.fonteMovimento,
          coberturaNoDia: item.coberturaNoDia,
        }),
      `Compensação de ${item.nome} concedida.`,
    );
  }

  async function descartar(item: LiberacaoView): Promise<void> {
    const ok = await confirmar(
      'Descartar sugestão',
      `A sugestão de ${item.nome} em ${item.rotuloDia} não volta a aparecer.`,
      'Descartar',
    );
    if (!ok) return;
    await executar(
      () => compensacaoHorasService.recusar(item.colaboradorId, item.data),
      'Sugestão descartada.',
    );
  }

  async function cobrir(item: CoberturaView): Promise<void> {
    const ok = await confirmar(
      'Cobrir a falta com horas',
      `A falta de ${item.nome} em ${item.rotuloDia} passa a ser paga com ` +
        `${formatarDuracao(item.cargaMs)} de 50% já trabalhadas. ` +
        'Isso quita as horas, mas NÃO apaga a falta.',
      'Cobrir',
    );
    if (!ok) return;
    await executar(
      () => centralJornadaService.marcarDebito(item.ausenciaId, true),
      `Falta de ${item.nome} coberta com horas.`,
    );
  }

  async function desfazer(id: string, nome: string, dia: string): Promise<void> {
    const ok = await confirmar(
      'Desfazer compensação',
      `A compensação de ${nome} em ${dia} deixa de valer e as horas voltam para o saldo dela.`,
      'Desfazer',
    );
    if (!ok) return;
    await executar(
      () => compensacaoHorasService.cancelar(id),
      'Compensação desfeita.',
    );
  }

  const dados = painel.dados;
  const carteira = dados?.carteira;
  const liberacoes = dados?.liberacoes ?? [];
  const coberturas = dados?.coberturas ?? [];
  const aprovadas = (dados?.decididas ?? []).filter(
    (d) => d.status === 'APROVADA',
  );
  const totalSugestoes = liberacoes.length + coberturas.length;

  return (
    <Tela aoAtualizar={painel.recarregar} atualizando={painel.atualizando}>
      {painel.carregando ? (
        <Carregando />
      ) : painel.erro ? (
        <MensagemErro
          mensagem={painel.erro}
          aoTentarNovamente={painel.recarregar}
        />
      ) : (
        <>
          {/* Cabeçalho: o período e o que a tela faz. */}
          {dados && (
            <Cartao>
              <Text style={styles.periodo}>
                Ciclo {dados.periodo.rotulo}
                {dados.periodo.diasRestantes > 0
                  ? ` · ${pluralDias(dados.periodo.diasRestantes)} para compensar`
                  : ''}
              </Text>
              <Text style={styles.intro}>
                Liberar quem tem horas de 50% em aberto, nos dias em que a loja
                move menos — e cobrir com essas mesmas horas as faltas que ainda
                estão em aberto.
              </Text>
              {totalSugestoes > 0 && (
                <Text style={styles.contagem}>
                  {pluralSugestoes(totalSugestoes)} esperando decisão.
                </Text>
              )}
            </Cartao>
          )}

          {/* 1. A carteira de 50% do time */}
          {carteira && (
            <Cartao titulo="Horas de 50% do time">
              <View style={styles.carteira}>
                <ItemCarteira
                  rotulo="Em aberto"
                  valor={formatarDuracao(carteira.totalSaldoMs)}
                  cor={cores.texto}
                  ajuda={pluralPessoas(carteira.pessoasComSaldo)}
                />
                <ItemCarteira
                  rotulo="Nas sugestões"
                  valor={formatarDuracao(
                    carteira.totalCoberturaMs + carteira.totalLiberacaoMs,
                  )}
                  cor={cores.verde}
                  ajuda={pluralDiasUteis(carteira.datasDisponiveis)}
                />
                <ItemCarteira
                  rotulo="Não cabe no ciclo"
                  valor={formatarDuracao(carteira.naoAlocadoMs)}
                  cor={
                    carteira.naoAlocadoMs > 0 ? cores.vermelho : cores.verde
                  }
                  ajuda={
                    carteira.naoAlocadoMs > 0 ? 'será pago' : 'tudo coberto'
                  }
                />
              </View>
              {carteira.pessoasAbaixoDoMinimo > 0 && (
                <Text style={styles.nota}>
                  {pluralPessoas(carteira.pessoasAbaixoDoMinimo)} com menos de 3h
                  de 50%: ainda não vale mudar a escala por isso.
                </Text>
              )}
            </Cartao>
          )}

          {/* Sem sugestões: diz POR QUE, em vez de mostrar uma lista vazia. */}
          {dados?.bloqueio && (
            <Cartao>
              <View style={styles.bloqueio}>
                <Ionicons
                  name="information-circle-outline"
                  size={18}
                  color={cores.textoSecundario}
                />
                <Text style={styles.bloqueioTexto}>
                  {TEXTO_BLOQUEIO[dados.bloqueio] ??
                    'Sem sugestões para o ciclo.'}
                </Text>
              </View>
            </Cartao>
          )}

          {/* 2. A régua: os dias mais fracos do ciclo */}
          {(dados?.datasFracas.length ?? 0) > 0 && (
            <Cartao titulo="Dias mais fracos do ciclo">
              <View style={styles.diasFracos}>
                {dados!.datasFracas.slice(0, 6).map((d, i) => (
                  <DiaFraco key={d.data} dia={d} maisFraco={i === 0} />
                ))}
              </View>
            </Cartao>
          )}

          {/* 3. Liberações sugeridas */}
          {liberacoes.length > 0 && (
            <Cartao titulo="Liberar para compensar">
              {liberacoes.map((item) => (
                <LinhaLiberacao
                  key={`${item.colaboradorId}|${item.data}`}
                  item={item}
                  ocupado={ocupado}
                  aoConceder={() => conceder(item)}
                  aoDescartar={() => descartar(item)}
                />
              ))}
            </Cartao>
          )}

          {/* 4. Coberturas de falta com as mesmas horas */}
          {coberturas.length > 0 && (
            <Cartao titulo="Cobrir faltas com horas">
              <Text style={styles.secaoAjuda}>
                Debitar quita as horas do dia faltado. Não apaga a falta nem o
                registro para advertência.
              </Text>
              {coberturas.map((item) => (
                <LinhaCobertura
                  key={item.ausenciaId}
                  item={item}
                  ocupado={ocupado}
                  aoDebitar={() => cobrir(item)}
                />
              ))}
            </Cartao>
          )}

          {/* 5. O que já foi concedido no ciclo */}
          {aprovadas.length > 0 && (
            <Cartao titulo="Já concedidas neste ciclo">
              {aprovadas.map((c) => (
                <View key={c.id} style={styles.concedida}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.concedidaNome}>{c.nome}</Text>
                    <Text style={styles.concedidaInfo}>
                      {c.rotuloDia} ·{' '}
                      {c.minutosTrabalhados === 0
                        ? 'dia inteiro'
                        : `${c.horaInicio}–${c.horaFim}`}{' '}
                      · compensa{' '}
                      {formatarDuracao(c.minutosCompensados * 60_000)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => desfazer(c.id, c.nome, c.rotuloDia)}
                    disabled={ocupado}
                    style={styles.desfazerBtn}
                  >
                    <Text style={styles.desfazerTexto}>Desfazer</Text>
                  </Pressable>
                </View>
              ))}
            </Cartao>
          )}

          {totalSugestoes === 0 &&
            !dados?.bloqueio &&
            aprovadas.length === 0 && (
              <EstadoVazio
                icone="checkmark-circle-outline"
                titulo="Nada a compensar"
                descricao="Ninguém tem 3h ou mais de 50% em aberto neste ciclo."
              />
            )}

          {/* Volta explícita: a tela é um destino, não um desvio. */}
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.voltar}
          >
            <Ionicons name="arrow-back" size={16} color={cores.primaria} />
            <Text style={styles.voltarTexto}>Voltar à Central de Jornada</Text>
          </Pressable>
        </>
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  periodo: { ...tipografia.secao, color: cores.texto },
  intro: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.xs,
    lineHeight: 17,
  },
  contagem: {
    ...tipografia.rotulo,
    color: cores.azul,
    marginTop: espacamento.sm,
  },

  carteira: { flexDirection: 'row', gap: espacamento.sm },
  carteiraItem: {
    flex: 1,
    backgroundColor: cores.superficieAlternativa,
    borderRadius: raio.md,
    padding: espacamento.md,
  },
  carteiraRotulo: { ...tipografia.legenda, color: cores.textoSecundario },
  carteiraValor: { ...tipografia.subtitulo, marginTop: espacamento.xs },
  carteiraAjuda: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },

  nota: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.md,
    lineHeight: 17,
  },
  secaoAjuda: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.sm,
    lineHeight: 17,
  },
  bloqueio: {
    flexDirection: 'row',
    gap: espacamento.sm,
    alignItems: 'flex-start',
  },
  bloqueioTexto: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    flex: 1,
    lineHeight: 17,
  },

  diasFracos: { flexDirection: 'row', flexWrap: 'wrap', gap: espacamento.sm },
  diaFraco: {
    borderRadius: raio.md,
    borderWidth: 1,
    borderColor: cores.borda,
    paddingVertical: espacamento.sm,
    paddingHorizontal: espacamento.md,
    minWidth: 96,
  },
  diaFracoDestaque: {
    borderColor: cores.primaria,
    backgroundColor: cores.primariaClara,
  },
  diaFracoDia: { ...tipografia.rotulo, color: cores.texto },
  diaFracoValor: {
    ...tipografia.legenda,
    color: cores.texto,
    fontWeight: '600',
    marginTop: 2,
  },
  diaFracoFonte: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    fontSize: 11,
  },
  diaFracoCobertura: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    fontSize: 11,
  },

  linha: {
    borderTopWidth: 1,
    borderTopColor: cores.divisor,
    paddingTop: espacamento.md,
    marginTop: espacamento.md,
  },
  linhaTopo: { flexDirection: 'row', alignItems: 'flex-start' },
  linhaNome: { ...tipografia.rotulo, color: cores.texto },
  linhaFuncao: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 1,
  },
  linhaDiaBox: { alignItems: 'flex-end', marginLeft: espacamento.sm },
  linhaDia: { ...tipografia.rotulo, color: cores.primaria },
  linhaDiaLabel: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 1,
  },

  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.xs,
    marginTop: espacamento.sm,
  },
  justificativa: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
    lineHeight: 17,
  },

  acoesLinha: {
    flexDirection: 'row',
    gap: espacamento.sm,
    marginTop: espacamento.md,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacamento.xs,
    paddingVertical: espacamento.sm,
    paddingHorizontal: espacamento.md,
    borderRadius: raio.pill,
  },
  btnPrimario: { backgroundColor: cores.primaria },
  btnPrimarioTexto: {
    ...tipografia.legenda,
    color: cores.textoInverso,
    fontWeight: '700',
  },
  btnSecundario: {
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
  },
  btnSecundarioTexto: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    fontWeight: '600',
  },
  btnInativo: { opacity: 0.5 },

  concedida: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    backgroundColor: cores.verdeFundo,
    borderRadius: raio.md,
    padding: espacamento.md,
    marginBottom: espacamento.xs,
  },
  concedidaNome: { ...tipografia.rotulo, color: cores.texto },
  concedidaInfo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 1,
  },
  desfazerBtn: {
    paddingVertical: espacamento.xs,
    paddingHorizontal: espacamento.sm,
    borderRadius: raio.pill,
    borderWidth: 1,
    borderColor: cores.verde,
  },
  desfazerTexto: {
    ...tipografia.legenda,
    color: cores.verde,
    fontWeight: '600',
  },

  voltar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacamento.xs,
    paddingVertical: espacamento.md,
  },
  voltarTexto: { ...tipografia.rotulo, color: cores.primaria },
});

export default CompensacaoScreen;
