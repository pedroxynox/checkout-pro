/**
 * Quadro de Operadores (escala fixa visual).
 *
 * Os operadores não têm cadastro de login/perfil: o quadro é visual e mostra,
 * para a semana selecionada (Seg–Sáb), o status de cada operador por dia —
 * 🟢 trabalha (com horário) · ⚪ folga (dia fixo) · 🔴 falta (ausência pontual).
 * Tocar numa célula que trabalha marca uma falta; tocar numa falta a remove.
 * Embaixo, a cobertura por dia (quantos trabalham) destaca dias fracos. O
 * gestor pode adicionar/atualizar um operador. Domingo entra depois.
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ApiError } from '../../api/client';
import { operadoresService } from '../../api/services';
import {
  AnaliticaFaltas,
  AoVivoOperadores,
  GradeCelula,
  GradeOperadores,
} from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import {
  Aviso,
  Botao,
  CampoTexto,
  Carregando,
  Cartao,
  EstadoVazio,
  MensagemErro,
  SeletorData,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { confirmar, notificar } from '../../utils/dialogos';
import { formatarData, hojeISO } from '../../utils/formato';

const NOMES_DIA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Cobertura mínima desejada por dia (abaixo disso, alerta). */
const COBERTURA_MINIMA = 20;

/** Largura de cada coluna de dia na grade. */
const COL_DIA = 46;

function corStatus(status: GradeCelula['status']): {
  fundo: string;
  texto: string;
} {
  if (status === 'TRABALHA') {
    return { fundo: 'rgba(30,158,90,0.14)', texto: cores.verde };
  }
  if (status === 'FALTA') {
    return { fundo: 'rgba(210,59,59,0.16)', texto: cores.vermelho };
  }
  return { fundo: cores.divisor, texto: cores.textoSecundario };
}

/** Primeiro nome + inicial do sobrenome, para caber na grade. */
function nomeCurto(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[1][0]}.`;
}

/** Primeiro e último dia do mês atual (ISO). */
function mesAtualISO(): { inicio: string; fim: string } {
  const d = new Date();
  const ini = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const fim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { inicio: ini.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
}

export function OperadoresScreen(): React.ReactElement {
  const { podeAcessar } = useAuth();
  const podeGerenciar = podeAcessar('OPERADORES_CRUD');

  const [semana, setSemana] = useState(hojeISO());
  const grade = useRequisicao<GradeOperadores>(
    () => operadoresService.grade(semana),
    [semana],
  );
  const dados = grade.dados;

  const aoVivo = useRequisicao<AoVivoOperadores>(
    () => operadoresService.aoVivo(),
    [],
  );

  const mes = mesAtualISO();
  const analitica = useRequisicao<AnaliticaFaltas>(
    () => operadoresService.analiticaFaltas(mes.inicio, mes.fim),
    [],
  );

  const [ocupado, setOcupado] = useState(false);

  // Formulário de novo/atualizar operador (gestor).
  const [novoAberto, setNovoAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [entSem, setEntSem] = useState('');
  const [saiSem, setSaiSem] = useState('');
  const [entFds, setEntFds] = useState('');
  const [saiFds, setSaiFds] = useState('');
  const [folga, setFolga] = useState(1);
  const [salvando, setSalvando] = useState(false);

  const aoTocarCelula = async (
    operadorId: string,
    nomeOperador: string,
    celula: GradeCelula,
  ) => {
    if (celula.status === 'FOLGA' || ocupado) {
      return;
    }
    if (celula.status === 'FALTA' && celula.ausenciaId) {
      const ok = await confirmar(
        'Remover falta',
        `Remover a falta de ${nomeOperador} em ${formatarData(celula.data)}?`,
        'Remover',
      );
      if (!ok) return;
      setOcupado(true);
      try {
        await operadoresService.removerAusencia(celula.ausenciaId);
        grade.recarregar();
        aoVivo.recarregar();
        analitica.recarregar();
      } catch (e) {
        notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao remover.');
      } finally {
        setOcupado(false);
      }
      return;
    }
    // TRABALHA -> marcar falta
    const ok = await confirmar(
      'Marcar falta',
      `Marcar falta de ${nomeOperador} em ${formatarData(celula.data)}?`,
      'Marcar',
    );
    if (!ok) return;
    setOcupado(true);
    try {
      await operadoresService.registrarAusencia(operadorId, celula.data);
      // Impacto: cobertura do dia depois desta falta.
      const cob = dados?.cobertura.find((c) => c.data === celula.data);
      const restante = cob ? cob.trabalhando - 1 : null;
      grade.recarregar();
      aoVivo.recarregar();
      analitica.recarregar();
      if (restante != null) {
        const abaixo = restante < COBERTURA_MINIMA;
        notificar(
          'Falta marcada',
          `${nomeOperador} em ${NOMES_DIA[celula.diaSemana]}. Ficam ${restante} operadores no caixa nesse dia${
            abaixo ? ` — abaixo do mínimo (${COBERTURA_MINIMA})!` : '.'
          }`,
        );
      }
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao marcar falta.');
    } finally {
      setOcupado(false);
    }
  };

  const salvarOperador = async () => {
    const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!nome.trim()) {
      notificar('Nome obrigatório', 'Informe o nome do operador.');
      return;
    }
    for (const [rotulo, valor] of [
      ['Entrada Seg–Qui', entSem],
      ['Saída Seg–Qui', saiSem],
      ['Entrada Sex–Sáb', entFds],
      ['Saída Sex–Sáb', saiFds],
    ] as const) {
      if (!hhmm.test(valor.trim())) {
        notificar('Horário inválido', `${rotulo} deve ser HH:mm (ex.: 08:00).`);
        return;
      }
    }
    setSalvando(true);
    try {
      await operadoresService.salvarTurno({
        nome: nome.trim(),
        entradaSemana: entSem.trim(),
        saidaSemana: saiSem.trim(),
        entradaFds: entFds.trim(),
        saidaFds: saiFds.trim(),
        folgaDiaSemana: folga,
      });
      setNome('');
      setEntSem('');
      setSaiSem('');
      setEntFds('');
      setSaiFds('');
      setFolga(1);
      setNovoAberto(false);
      grade.recarregar();
      notificar('Salvo', 'Operador adicionado/atualizado no quadro.');
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Tela
      aoAtualizar={() => {
        grade.recarregar();
        aoVivo.recarregar();
        analitica.recarregar();
      }}
      atualizando={grade.atualizando}
    >
      {/* Tablero "ao vivo": quem deveria estar agora */}
      {aoVivo.dados ? (
        <Cartao titulo="Agora no caixa">
          <View style={styles.aoVivoTopo}>
            <Text style={styles.aoVivoHora}>{aoVivo.dados.horaLocal}</Text>
            <View style={styles.aoVivoNumeros}>
              <Text style={styles.aoVivoDisponiveis}>{aoVivo.dados.disponiveis}</Text>
              <Text style={styles.aoVivoLegenda}>deveriam estar disponíveis</Text>
            </View>
          </View>
          {aoVivo.dados.faltas > 0 ? (
            <Aviso
              texto={`${aoVivo.dados.faltas} de ${aoVivo.dados.esperados} faltaram nesta franja: ${aoVivo.dados.listaFaltantes
                .map((f) => f.nome.split(/\s+/)[0])
                .join(', ')}.`}
            />
          ) : aoVivo.dados.esperados > 0 ? (
            <Text style={styles.aoVivoOk}>Todos presentes nesta franja. 👏</Text>
          ) : (
            <Text style={styles.aoVivoOk}>Fora do horário de operação.</Text>
          )}
        </Cartao>
      ) : null}

      <SeletorData valor={semana} aoMudar={setSemana} rotulo="Semana (qualquer dia dela)" />

      {grade.carregando ? (
        <Carregando />
      ) : grade.erro ? (
        <MensagemErro mensagem={grade.erro} aoTentarNovamente={grade.recarregar} />
      ) : !dados || dados.operadores.length === 0 ? (
        <EstadoVazio
          icone="people-outline"
          titulo="Sem operadores"
          descricao="Nenhum operador no quadro ainda."
        />
      ) : (
        <>
          {/* Legenda */}
          <View style={styles.legenda}>
            <Legenda cor={cores.verde} texto="Trabalha" />
            <Legenda cor={cores.textoSecundario} texto="Folga" />
            <Legenda cor={cores.vermelho} texto="Falta" />
          </View>
          <Text style={styles.dica}>
            Toque numa célula para marcar/remover uma falta.
          </Text>

          {/* Grade semanal */}
          <Cartao>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                {/* Cabeçalho de dias */}
                <View style={styles.linha}>
                  <View style={styles.colNome} />
                  {dados.dias.map((d) => {
                    const hoje = d.data === dados.hojeISO;
                    return (
                      <View key={d.data} style={styles.colDia}>
                        <Text style={[styles.diaCabecalho, hoje && styles.diaHoje]}>
                          {NOMES_DIA[d.diaSemana]}
                        </Text>
                        <Text style={styles.diaData}>{formatarData(d.data).slice(0, 5)}</Text>
                      </View>
                    );
                  })}
                </View>

                {/* Linhas de operadores */}
                {dados.operadores.map((op) => (
                  <View key={op.id} style={styles.linha}>
                    <Text style={styles.nomeOperador} numberOfLines={1}>
                      {nomeCurto(op.nome)}
                    </Text>
                    {op.celulas.map((c) => {
                      const cor = corStatus(c.status);
                      return (
                        <TouchableOpacity
                          key={c.data}
                          style={[styles.celula, { backgroundColor: cor.fundo }]}
                          activeOpacity={c.status === 'FOLGA' ? 1 : 0.6}
                          onPress={() => void aoTocarCelula(op.id, op.nome, c)}
                        >
                          {c.status === 'TRABALHA' ? (
                            <Text style={[styles.celulaTexto, { color: cor.texto }]}>
                              {c.entrada}
                            </Text>
                          ) : (
                            <Text style={[styles.celulaTexto, { color: cor.texto }]}>
                              {c.status === 'FOLGA' ? 'Folga' : 'Falta'}
                            </Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}

                {/* Cobertura por dia */}
                <View style={[styles.linha, styles.linhaCobertura]}>
                  <Text style={styles.colNomeRotulo}>No caixa</Text>
                  {dados.cobertura.map((c) => {
                    const baixa = c.trabalhando < COBERTURA_MINIMA;
                    return (
                      <View key={c.data} style={styles.colDia}>
                        <Text
                          style={[
                            styles.coberturaValor,
                            { color: baixa ? cores.vermelho : cores.verde },
                          ]}
                        >
                          {c.trabalhando}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </ScrollView>
          </Cartao>

          {/* Resumo de cobertura abaixo do mínimo */}
          {dados.cobertura.some((c) => c.trabalhando < COBERTURA_MINIMA) ? (
            <Aviso
              texto={`Atenção: ${dados.cobertura
                .filter((c) => c.trabalhando < COBERTURA_MINIMA)
                .map((c) => `${NOMES_DIA[c.diaSemana]} (${c.trabalhando})`)
                .join(', ')} abaixo da cobertura mínima (${COBERTURA_MINIMA}).`}
            />
          ) : (
            <Aviso texto={`Cobertura ok em todos os dias (mínimo ${COBERTURA_MINIMA}).`} />
          )}

          {/* Análise de faltas do mês */}
          {analitica.dados && analitica.dados.total > 0 ? (
            <Cartao titulo="Faltas do mês">
              <Text style={styles.faltasTotal}>
                {analitica.dados.total} falta(s) no mês
              </Text>
              {(() => {
                const pior = [...analitica.dados.porDiaSemana].sort(
                  (a, b) => b.quantidade - a.quantidade,
                )[0];
                return pior && pior.quantidade > 0 ? (
                  <Text style={styles.faltasDica}>
                    Dia com mais faltas: {pior.nome} ({pior.quantidade})
                  </Text>
                ) : null;
              })()}
              <Text style={styles.faltasSubtitulo}>Quem mais faltou</Text>
              {analitica.dados.porOperador.slice(0, 5).map((o) => (
                <View key={o.id} style={styles.faltaLinha}>
                  <Text style={styles.faltaNome} numberOfLines={1}>
                    {o.nome}
                  </Text>
                  <Text style={styles.faltaQtd}>{o.quantidade}</Text>
                </View>
              ))}
            </Cartao>
          ) : null}

          {/* Gestão: adicionar/atualizar operador */}
          {podeGerenciar ? (
            <Cartao titulo="Adicionar / atualizar operador">
              {novoAberto ? (
                <>
                  <CampoTexto
                    rotulo="Nome"
                    value={nome}
                    onChangeText={setNome}
                    placeholder="Nome do operador"
                  />
                  <View style={styles.linhaHorarios}>
                    <CampoTexto
                      rotulo="Entrada Seg–Qui"
                      value={entSem}
                      onChangeText={setEntSem}
                      placeholder="08:00"
                      style={styles.horarioInput}
                    />
                    <CampoTexto
                      rotulo="Saída Seg–Qui"
                      value={saiSem}
                      onChangeText={setSaiSem}
                      placeholder="17:00"
                      style={styles.horarioInput}
                    />
                  </View>
                  <View style={styles.linhaHorarios}>
                    <CampoTexto
                      rotulo="Entrada Sex–Sáb"
                      value={entFds}
                      onChangeText={setEntFds}
                      placeholder="08:00"
                      style={styles.horarioInput}
                    />
                    <CampoTexto
                      rotulo="Saída Sex–Sáb"
                      value={saiFds}
                      onChangeText={setSaiFds}
                      placeholder="18:00"
                      style={styles.horarioInput}
                    />
                  </View>
                  <Text style={styles.rotuloFolga}>Dia de folga</Text>
                  <View style={styles.chipsFolga}>
                    {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                      const ativo = d === folga;
                      return (
                        <Text
                          key={d}
                          onPress={() => setFolga(d)}
                          style={[styles.chipFolga, ativo && styles.chipFolgaAtivo]}
                        >
                          {NOMES_DIA[d]}
                        </Text>
                      );
                    })}
                  </View>
                  <Botao titulo="Salvar" aoPressionar={salvarOperador} carregando={salvando} />
                  <Botao
                    titulo="Cancelar"
                    variante="texto"
                    aoPressionar={() => setNovoAberto(false)}
                  />
                </>
              ) : (
                <Botao
                  titulo="Adicionar operador"
                  variante="secundario"
                  aoPressionar={() => setNovoAberto(true)}
                />
              )}
            </Cartao>
          ) : null}
        </>
      )}
    </Tela>
  );
}

function Legenda({ cor, texto }: { cor: string; texto: string }): React.ReactElement {
  return (
    <View style={styles.legendaItem}>
      <View style={[styles.legendaPonto, { backgroundColor: cor }]} />
      <Text style={styles.legendaTexto}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  legenda: {
    flexDirection: 'row',
    gap: espacamento.md,
    marginBottom: espacamento.xs,
  },
  legendaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
  },
  legendaPonto: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  legendaTexto: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  dica: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    fontStyle: 'italic',
    marginBottom: espacamento.sm,
  },
  // Ao vivo
  aoVivoTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.md,
    marginBottom: espacamento.sm,
  },
  aoVivoHora: {
    fontSize: 30,
    fontWeight: '700',
    color: cores.primaria,
  },
  aoVivoNumeros: {
    flex: 1,
  },
  aoVivoDisponiveis: {
    fontSize: 26,
    fontWeight: '700',
    color: cores.verde,
  },
  aoVivoLegenda: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  aoVivoOk: {
    ...tipografia.corpo,
    color: cores.verde,
    fontWeight: '600',
  },
  // Faltas
  faltasTotal: {
    ...tipografia.titulo,
    color: cores.texto,
  },
  faltasDica: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
    marginBottom: espacamento.sm,
  },
  faltasSubtitulo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
    marginBottom: espacamento.xs,
  },
  faltaLinha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: espacamento.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  faltaNome: {
    ...tipografia.corpo,
    color: cores.texto,
    flex: 1,
    paddingRight: espacamento.sm,
  },
  faltaQtd: {
    ...tipografia.rotulo,
    fontWeight: '700',
    color: cores.vermelho,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  linhaCobertura: {
    marginTop: espacamento.sm,
    paddingTop: espacamento.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
  },
  colNome: {
    width: 96,
  },
  colNomeRotulo: {
    width: 96,
    ...tipografia.legenda,
    fontWeight: '700',
    color: cores.textoSecundario,
  },
  colDia: {
    width: COL_DIA,
    alignItems: 'center',
  },
  diaCabecalho: {
    ...tipografia.legenda,
    fontWeight: '700',
    color: cores.texto,
  },
  diaHoje: {
    color: cores.primaria,
  },
  diaData: {
    fontSize: 9,
    color: cores.textoSecundario,
  },
  nomeOperador: {
    width: 96,
    ...tipografia.legenda,
    color: cores.texto,
    paddingRight: 4,
  },
  celula: {
    width: COL_DIA - 4,
    height: 30,
    marginHorizontal: 2,
    borderRadius: raio.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  celulaTexto: {
    fontSize: 9,
    fontWeight: '700',
  },
  coberturaValor: {
    ...tipografia.rotulo,
    fontWeight: '700',
  },
  linhaHorarios: {
    flexDirection: 'row',
    gap: espacamento.sm,
  },
  horarioInput: {
    flex: 1,
  },
  rotuloFolga: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
    marginBottom: espacamento.xs,
  },
  chipsFolga: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.xs,
    marginBottom: espacamento.sm,
  },
  chipFolga: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    paddingVertical: espacamento.xs,
    paddingHorizontal: espacamento.sm,
    borderRadius: raio.pill,
    backgroundColor: cores.divisor,
    overflow: 'hidden',
  },
  chipFolgaAtivo: {
    backgroundColor: cores.primaria,
    color: cores.textoInverso,
  },
});

export default OperadoresScreen;
