/**
 * Quadro de Operadores (escala fixa, foco no dia).
 *
 * Mostra o roster do DIA selecionado (padrão: hoje): cada colaborador com o
 * horário do dia, ordenados por hora de ENTRADA e com os de folga ao fim.
 * 🟢 trabalha · 🔴 falta · ⚪ folga. Tocar numa linha que trabalha marca falta;
 * tocar numa falta a remove (com o impacto na cobertura do dia). Em cima, o
 * "Agora no caixa" (ao vivo). Embaixo, as faltas do mês e (gestor) o cadastro
 * de operador. Domingo entra depois.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ApiError } from '../../api/client';
import { operadoresService } from '../../api/services';
import {
  AnaliticaFaltas,
  AoVivoOperadores,
  ColaboradorDia,
  DiaOperadores,
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
const NOMES_DIA_LONGO = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
];

/** Cobertura mínima desejada por dia (abaixo disso, alerta). */
const COBERTURA_MINIMA = 20;

function corStatus(status: ColaboradorDia['status']): { fundo: string; texto: string } {
  if (status === 'TRABALHA') return { fundo: 'rgba(30,158,90,0.14)', texto: cores.verde };
  if (status === 'FALTA') return { fundo: 'rgba(210,59,59,0.16)', texto: cores.vermelho };
  return { fundo: cores.divisor, texto: cores.textoSecundario };
}

function rotuloStatus(status: ColaboradorDia['status']): string {
  if (status === 'TRABALHA') return 'Trabalha';
  if (status === 'FALTA') return 'Falta';
  return 'Folga';
}

/** Primeiro e último dia do mês atual (ISO). */
function mesAtualISO(): { inicio: string; fim: string } {
  const d = new Date();
  const ini = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const fim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { inicio: ini.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
}

/** Turnos para agrupar o roster do dia. */
const TURNOS: { chave: string; titulo: string }[] = [
  { chave: 'MANHA', titulo: 'Manhã' },
  { chave: 'TARDE', titulo: 'Tarde' },
  { chave: 'NOITE', titulo: 'Noite' },
  { chave: 'FOLGA', titulo: 'Folga' },
];

function turnoDe(c: ColaboradorDia): string {
  if (c.status === 'FOLGA') return 'FOLGA';
  const h = c.entrada ? parseInt(c.entrada.slice(0, 2), 10) : 0;
  if (h < 12) return 'MANHA';
  if (h < 18) return 'TARDE';
  return 'NOITE';
}

/** Inicial(is) do nome para o avatar (até 2 letras). */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}

/** Linha de um colaborador no roster do dia. */
function ColaboradorRow({
  c,
  onPress,
}: {
  c: ColaboradorDia;
  onPress: (c: ColaboradorDia) => void;
}): React.ReactElement {
  const cor = corStatus(c.status);
  return (
    <TouchableOpacity
      activeOpacity={c.status === 'FOLGA' ? 1 : 0.6}
      onPress={() => onPress(c)}
      style={[styles.linha, { borderLeftColor: cor.texto }]}
    >
      <View style={[styles.avatar, { backgroundColor: cor.fundo }]}>
        <Text style={[styles.avatarTexto, { color: cor.texto }]}>{iniciais(c.nome)}</Text>
      </View>
      <View style={styles.linhaInfo}>
        <Text style={styles.nomeColaborador} numberOfLines={1}>
          {c.nome}
        </Text>
        <Text style={styles.horarioInline}>
          {c.status === 'FOLGA' ? 'Dia de folga' : `${c.entrada} – ${c.saida}`}
        </Text>
      </View>
      <View style={[styles.chip, { backgroundColor: cor.fundo }]}>
        <Text style={[styles.chipTexto, { color: cor.texto }]}>{rotuloStatus(c.status)}</Text>
      </View>
    </TouchableOpacity>
  );
}

export function OperadoresScreen(): React.ReactElement {
  const { podeAcessar } = useAuth();
  const podeGerenciar = podeAcessar('OPERADORES_CRUD');

  const [diaSel, setDiaSel] = useState(hojeISO());
  const dia = useRequisicao<DiaOperadores>(
    () => operadoresService.dia(diaSel),
    [diaSel],
  );
  const dados = dia.dados;

  const aoVivo = useRequisicao<AoVivoOperadores>(() => operadoresService.aoVivo(), []);

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

  const recarregarTudo = () => {
    dia.recarregar();
    aoVivo.recarregar();
    analitica.recarregar();
  };

  const aoTocarColaborador = async (c: ColaboradorDia) => {
    if (c.status === 'FOLGA' || ocupado) return;

    if (c.status === 'FALTA' && c.ausenciaId) {
      const ok = await confirmar(
        'Remover falta',
        `Remover a falta de ${c.nome} em ${formatarData(diaSel)}?`,
        'Remover',
      );
      if (!ok) return;
      setOcupado(true);
      try {
        await operadoresService.removerAusencia(c.ausenciaId);
        recarregarTudo();
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
      `Marcar falta de ${c.nome} em ${formatarData(diaSel)}?`,
      'Marcar',
    );
    if (!ok) return;
    setOcupado(true);
    try {
      await operadoresService.registrarAusencia(c.id, diaSel);
      const restante = dados ? dados.trabalhando - 1 : null;
      recarregarTudo();
      if (restante != null) {
        const abaixo = restante < COBERTURA_MINIMA;
        notificar(
          'Falta marcada',
          `${c.nome}. Ficam ${restante} operadores no caixa nesse dia${
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
      dia.recarregar();
      notificar('Salvo', 'Operador adicionado/atualizado no quadro.');
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const ehHoje = diaSel === hojeISO();
  const coberturaBaixa = dados ? dados.trabalhando < COBERTURA_MINIMA : false;

  return (
    <Tela aoAtualizar={recarregarTudo} atualizando={dia.atualizando}>
      {/* Tablero "ao vivo": quem deveria estar agora */}
      {aoVivo.dados ? (
        <Cartao titulo="Agora no caixa">
          <View style={styles.aoVivoTopo}>
            <View style={styles.aoVivoRelogio}>
              <Text style={styles.aoVivoHora}>{aoVivo.dados.horaLocal}</Text>
              <Text style={styles.aoVivoLegenda}>agora</Text>
            </View>
            <View style={styles.aoVivoNumeros}>
              <Text style={styles.aoVivoDisponiveis}>
                {aoVivo.dados.disponiveis}
                <Text style={styles.aoVivoEsperados}>
                  {' '}
                  / {aoVivo.dados.esperados}
                </Text>
              </Text>
              <Text style={styles.aoVivoLegenda}>disponíveis no caixa</Text>
            </View>
          </View>
          {aoVivo.dados.esperados > 0 ? (
            <View style={styles.barraTrilha}>
              <View
                style={[
                  styles.barraPreenchida,
                  {
                    width: `${Math.round(
                      (aoVivo.dados.disponiveis / aoVivo.dados.esperados) * 100,
                    )}%` as `${number}%`,
                    backgroundColor:
                      aoVivo.dados.faltas > 0 ? cores.amarelo : cores.verde,
                  },
                ]}
              />
            </View>
          ) : null}
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

      <SeletorData valor={diaSel} aoMudar={setDiaSel} rotulo="Dia" />

      {dia.carregando ? (
        <Carregando />
      ) : dia.erro ? (
        <MensagemErro mensagem={dia.erro} aoTentarNovamente={dia.recarregar} />
      ) : !dados || dados.colaboradores.length === 0 ? (
        <EstadoVazio
          icone="people-outline"
          titulo="Sem operadores"
          descricao="Nenhum operador no quadro ainda."
        />
      ) : (
        <>
          {/* Cabeçalho do dia + resumo */}
          <Cartao>
            <Text style={styles.diaTitulo}>
              {ehHoje ? 'Hoje · ' : ''}
              {NOMES_DIA_LONGO[dados.diaSemana]}, {formatarData(dados.dataISO)}
            </Text>
            <View style={styles.resumoLinha}>
              <Resumo valor={dados.trabalhando} rotulo="Trabalham" cor={cores.verde} />
              <Resumo valor={dados.faltas} rotulo="Faltas" cor={cores.vermelho} />
              <Resumo valor={dados.folgas} rotulo="Folgas" cor={cores.textoSecundario} />
            </View>
            {coberturaBaixa ? (
              <Aviso
                texto={`Cobertura baixa: ${dados.trabalhando} no caixa (mínimo ${COBERTURA_MINIMA}).`}
              />
            ) : null}
            <Text style={styles.dica}>
              Ordenados por hora de entrada · folgas ao fim. Toque para marcar/remover falta.
            </Text>
          </Cartao>

          {/* Lista de colaboradores agrupada por turno */}
          {TURNOS.map((t) => {
            const itens = dados.colaboradores.filter((c) => turnoDe(c) === t.chave);
            if (itens.length === 0) return null;
            return (
              <View key={t.chave}>
                <View style={styles.secaoHeader}>
                  <Text style={styles.secaoTitulo}>{t.titulo}</Text>
                  <View style={styles.secaoBadge}>
                    <Text style={styles.secaoBadgeTexto}>{itens.length}</Text>
                  </View>
                </View>
                {itens.map((c) => (
                  <ColaboradorRow key={c.id} c={c} onPress={aoTocarColaborador} />
                ))}
              </View>
            );
          })}

          {/* Análise de faltas do mês */}
          {analitica.dados && analitica.dados.total > 0 ? (
            <Cartao titulo="Faltas do mês">
              <Text style={styles.faltasTotal}>{analitica.dados.total} falta(s) no mês</Text>
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

function Resumo({
  valor,
  rotulo,
  cor,
}: {
  valor: number;
  rotulo: string;
  cor: string;
}): React.ReactElement {
  return (
    <View style={styles.resumoBox}>
      <Text style={[styles.resumoValor, { color: cor }]}>{valor}</Text>
      <Text style={styles.resumoRotulo}>{rotulo}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Ao vivo
  aoVivoTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.lg,
    marginBottom: espacamento.sm,
  },
  aoVivoRelogio: {
    alignItems: 'center',
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
    fontSize: 28,
    fontWeight: '700',
    color: cores.verde,
  },
  aoVivoEsperados: {
    fontSize: 18,
    fontWeight: '600',
    color: cores.textoSecundario,
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
  barraTrilha: {
    width: '100%',
    height: 8,
    borderRadius: raio.pill,
    backgroundColor: cores.divisor,
    overflow: 'hidden',
    marginBottom: espacamento.sm,
  },
  barraPreenchida: {
    height: '100%',
    borderRadius: raio.pill,
  },
  // Cabeçalho do dia
  diaTitulo: {
    ...tipografia.secao,
    color: cores.texto,
    marginBottom: espacamento.md,
  },
  resumoLinha: {
    flexDirection: 'row',
    gap: espacamento.sm,
    marginBottom: espacamento.sm,
  },
  resumoBox: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: cores.superficieAlternativa,
    borderRadius: raio.md,
    paddingVertical: espacamento.sm,
  },
  resumoValor: {
    ...tipografia.titulo,
    fontWeight: '700',
  },
  resumoRotulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  dica: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    fontStyle: 'italic',
  },
  // Seção (turno)
  secaoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    marginTop: espacamento.md,
    marginBottom: espacamento.xs,
  },
  secaoTitulo: {
    ...tipografia.rotulo,
    fontWeight: '700',
    color: cores.texto,
  },
  secaoBadge: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: raio.pill,
    backgroundColor: cores.divisor,
    alignItems: 'center',
  },
  secaoBadgeTexto: {
    fontSize: 11,
    fontWeight: '700',
    color: cores.textoSecundario,
  },
  // Linha de colaborador
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: cores.superficie,
    borderRadius: raio.md,
    borderLeftWidth: 3,
    paddingVertical: espacamento.sm,
    paddingHorizontal: espacamento.md,
    marginBottom: espacamento.xs,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTexto: {
    fontSize: 13,
    fontWeight: '700',
  },
  linhaInfo: {
    flex: 1,
    paddingHorizontal: espacamento.sm,
  },
  nomeColaborador: {
    ...tipografia.corpo,
    fontWeight: '600',
    color: cores.texto,
  },
  horarioInline: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 1,
  },
  chip: {
    paddingHorizontal: espacamento.sm,
    paddingVertical: 3,
    borderRadius: raio.pill,
    minWidth: 64,
    alignItems: 'center',
  },
  chipTexto: {
    fontSize: 11,
    fontWeight: '700',
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
  // Gestão
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
