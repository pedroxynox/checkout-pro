/**
 * Registro de Ponto (leitor de papelito) — Fase A.
 *
 * Permite escolher um colaborador (fiscal), ver a jornada do dia calculada a
 * partir das batidas e registrar/corrigir/remover batidas manualmente (a hora
 * do papelito). Há um "modo lote" para registrar vários papelitos em sequência.
 * A leitura automática por câmera/OCR entra na Fase B.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { pontoService } from '../../api/services';
import {
  BatidaPontoView,
  JornadaDiaPonto,
  PessoaPonto,
  StatusJornadaPonto,
  TipoBatida,
} from '../../api/types';
import {
  Botao,
  Carregando,
  CampoTexto,
  Cartao,
  EstadoVazio,
  MensagemErro,
  Selo,
  SeletorData,
  Tela,
} from '../../components';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { formatarData, formatarDuracao, hojeISO } from '../../utils/formato';
import { capturarPapelito } from './leitorPapelito';

const ROTULO_TIPO: Record<TipoBatida, string> = {
  ENTRADA: 'Entrada',
  SAIDA_INTERVALO: 'Saída p/ intervalo',
  RETORNO_INTERVALO: 'Retorno do intervalo',
  ENCERRAMENTO: 'Encerramento',
  EXTRA: 'Batida extra',
};

function seloStatus(s: StatusJornadaPonto): { texto: string; cor: string; fundo: string } {
  switch (s) {
    case 'TRABALHANDO':
      return { texto: 'Trabalhando', cor: cores.verde, fundo: cores.verdeFundo };
    case 'EM_INTERVALO':
      return { texto: 'Em intervalo', cor: cores.amarelo, fundo: cores.amareloFundo };
    case 'ENCERRADO':
      return { texto: 'Encerrado', cor: cores.textoSecundario, fundo: cores.superficieAlternativa };
    case 'INCOMPLETO':
      return { texto: 'Incompleto', cor: cores.vermelho, fundo: cores.vermelhoFundo };
    default:
      return { texto: 'Sem registro', cor: cores.textoSecundario, fundo: cores.superficieAlternativa };
  }
}

/** Hora "HH:mm" a partir do ISO gravado (a hora do papelito, sem fuso). */
function horaLabel(iso: string): string {
  return iso.slice(11, 16);
}

/** Máscara HH:mm enquanto digita (só dígitos, insere ":"). */
function mascaraHora(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}:${d.slice(2)}`;
}

const HORA_VALIDA = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function RegistroPontoScreen(): React.ReactElement {
  const [data, setData] = useState(hojeISO());

  // Busca/seleção do colaborador.
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<PessoaPonto[]>([]);
  const [pessoa, setPessoa] = useState<PessoaPonto | null>(null);

  // Jornada do dia da pessoa selecionada.
  const [dados, setDados] = useState<JornadaDiaPonto | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Formulário de batida (registrar ou editar).
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [horaTexto, setHoraTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  // Modo lote (vários papelitos em sequência) + contador da sessão.
  const [loteAtivo, setLoteAtivo] = useState(false);
  const [sessao, setSessao] = useState(0);

  // Leitura do papelito (Fase B): estado do OCR e o que foi lido.
  const [lendo, setLendo] = useState(false);
  const [leituraInfo, setLeituraInfo] = useState<{
    nome: string | null;
    hora: string | null;
  } | null>(null);
  const [horaPendente, setHoraPendente] = useState<string | null>(null);

  // Busca de colaboradores (debounce) enquanto nenhum está selecionado.
  useEffect(() => {
    if (pessoa || busca.trim().length < 2) {
      setResultados([]);
      return;
    }
    const t = setTimeout(() => {
      pontoService
        .buscarPessoas(busca.trim())
        .then(setResultados)
        .catch(() => setResultados([]));
    }, 350);
    return () => clearTimeout(t);
  }, [busca, pessoa]);

  const carregarJornada = useCallback(async () => {
    if (!pessoa) return;
    setCarregando(true);
    setErro(null);
    try {
      const resp = await pontoService.jornadaDoDia(pessoa.id, data);
      setDados(resp);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível carregar a jornada.');
    } finally {
      setCarregando(false);
    }
  }, [pessoa, data]);

  useEffect(() => {
    if (pessoa) void carregarJornada();
    else setDados(null);
  }, [pessoa, data, carregarJornada]);

  function selecionarPessoa(p: PessoaPonto): void {
    setPessoa(p);
    setBusca('');
    setResultados([]);
    setErro(null);
    // Se a hora veio do papelito, já abre o formulário preenchido.
    if (horaPendente) {
      setHoraTexto(horaPendente);
      setHoraPendente(null);
      setMostrarForm(true);
    }
  }

  /**
   * Lê o papelito: no Android a câmera lê no aparelho (ML Kit); na web tira foto
   * e o servidor faz o OCR. Preenche a hora e sugere o colaborador; o usuário
   * confirma antes de gravar.
   */
  async function lerPapelito(): Promise<void> {
    setErro(null);
    let captura: { texto?: string; imagem?: string } | null;
    try {
      captura = await capturarPapelito();
    } catch {
      setErro('Não foi possível abrir a câmera/galeria.');
      return;
    }
    if (!captura) return;
    setLendo(true);
    try {
      const r = await pontoService.lerPapelito(captura);
      setLeituraInfo({ nome: r.nome, hora: r.hora });
      if (r.data) setData(r.data);
      if (pessoa) {
        if (r.hora) {
          setHoraTexto(r.hora);
          setMostrarForm(true);
        }
      } else if (r.candidatos.length > 0) {
        setResultados(r.candidatos);
        setHoraPendente(r.hora);
      } else {
        setErro('Não identifiquei o colaborador. Busque pelo nome e registre a hora.');
      }
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível ler o papelito.');
    } finally {
      setLendo(false);
    }
  }

  function trocarPessoa(): void {
    setPessoa(null);
    setDados(null);
    setMostrarForm(false);
    setEditandoId(null);
  }

  function abrirRegistro(): void {
    setEditandoId(null);
    setHoraTexto('');
    setErroForm(null);
    setMostrarForm(true);
  }

  function abrirEdicao(b: BatidaPontoView): void {
    setEditandoId(b.id);
    setHoraTexto(horaLabel(b.hora));
    setErroForm(null);
    setMostrarForm(true);
  }

  async function salvarBatida(): Promise<void> {
    if (!pessoa) return;
    if (!HORA_VALIDA.test(horaTexto)) {
      setErroForm('Informe a hora no formato HH:mm (ex.: 07:56).');
      return;
    }
    setSalvando(true);
    setErroForm(null);
    try {
      const horaISO = `${data}T${horaTexto}:00.000Z`;
      const resp = editandoId
        ? await pontoService.editarBatida(editandoId, { hora: horaISO })
        : await pontoService.registrarBatida({
            pessoaId: pessoa.id,
            tipoPessoa: 'FISCAL',
            data,
            hora: horaISO,
          });
      setDados(resp);
      setMostrarForm(false);
      setHoraTexto('');
      if (!editandoId) {
        setSessao((s) => s + 1);
        // No modo lote, volta para escolher o próximo colaborador.
        if (loteAtivo) trocarPessoa();
      }
      setEditandoId(null);
    } catch (e) {
      setErroForm(e instanceof ApiError ? e.message : 'Não foi possível salvar a batida.');
    } finally {
      setSalvando(false);
    }
  }

  async function removerBatida(id: string): Promise<void> {
    try {
      const resp = await pontoService.removerBatida(id);
      setDados(resp);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível remover a batida.');
    }
  }

  const dataDiferenteDeHoje = data !== hojeISO();

  return (
    <Tela aoAtualizar={pessoa ? carregarJornada : undefined} atualizando={carregando}>
      <SeletorData valor={data} aoMudar={setData} rotulo="Dia" />

      {/* Modo lote */}
      <Pressable
        onPress={() => setLoteAtivo((v) => !v)}
        style={styles.loteLinha}
        accessibilityRole="switch"
        accessibilityState={{ checked: loteAtivo }}
      >
        <Ionicons
          name={loteAtivo ? 'checkbox' : 'square-outline'}
          size={20}
          color={loteAtivo ? cores.primaria : cores.textoSecundario}
        />
        <Text style={styles.loteTexto}>
          Modo lote (registrar vários papelitos em sequência)
        </Text>
      </Pressable>
      {loteAtivo && sessao > 0 ? (
        <Text style={styles.sessaoTexto}>
          Batidas registradas nesta sessão: {sessao}
        </Text>
      ) : null}

      {/* Leitor do papelito: câmera no app (ML Kit) / foto na web (servidor). */}
      <Botao
        titulo="Ler papelito (foto)"
        variante="secundario"
        aoPressionar={() => void lerPapelito()}
        carregando={lendo}
      />
      {leituraInfo ? (
        <View style={styles.leituraBanner}>
          <Ionicons name="scan-outline" size={16} color={cores.primaria} />
          <Text style={styles.leituraTexto}>
            Lido: {leituraInfo.nome ?? 'nome não identificado'}
            {leituraInfo.hora ? ` · ${leituraInfo.hora}` : ' · sem hora'}
          </Text>
        </View>
      ) : null}

      {/* Seleção do colaborador */}
      {!pessoa ? (
        <Cartao>
          <CampoTexto
            rotulo="Colaborador (nome do papelito)"
            placeholder="Digite o nome…"
            value={busca}
            onChangeText={setBusca}
            autoCorrect={false}
          />
          {resultados.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => selecionarPessoa(p)}
              style={styles.resultado}
              accessibilityRole="button"
            >
              <Ionicons name="person-outline" size={18} color={cores.primaria} />
              <Text style={styles.resultadoNome}>{p.nome}</Text>
              <Ionicons name="chevron-forward" size={16} color={cores.textoSecundario} />
            </Pressable>
          ))}
          {busca.trim().length >= 2 && resultados.length === 0 ? (
            <Text style={styles.vazioBusca}>Nenhum colaborador encontrado.</Text>
          ) : null}
        </Cartao>
      ) : (
        <>
          <Cartao>
            <View style={styles.cabecalhoPessoa}>
              <View style={styles.pessoaInfo}>
                <Text style={styles.pessoaNome} numberOfLines={1}>
                  {pessoa.nome}
                </Text>
                <Text style={styles.pessoaData}>{formatarData(data)}</Text>
              </View>
              <Pressable onPress={trocarPessoa} hitSlop={8}>
                <Text style={styles.trocar}>Trocar</Text>
              </Pressable>
            </View>

            {dataDiferenteDeHoje ? (
              <View style={styles.aviso}>
                <Ionicons name="alert-circle-outline" size={16} color={cores.amarelo} />
                <Text style={styles.avisoTexto}>
                  Você está registrando um dia diferente de hoje.
                </Text>
              </View>
            ) : null}
          </Cartao>

          {erro ? <MensagemErro mensagem={erro} /> : null}

          {carregando && !dados ? (
            <Carregando />
          ) : dados ? (
            <PainelJornada dados={dados} />
          ) : null}

          {/* Lista de batidas */}
          {dados && dados.batidas.length > 0 ? (
            <Cartao>
              <Text style={styles.secaoTitulo}>Batidas do dia</Text>
              {dados.batidas.map((b) => (
                <View key={b.id} style={styles.batidaLinha}>
                  <Text style={styles.batidaHora}>{horaLabel(b.hora)}</Text>
                  <View style={styles.batidaInfo}>
                    <Text style={styles.batidaTipo}>{ROTULO_TIPO[b.tipo]}</Text>
                    {b.registradoPorNome ? (
                      <Text style={styles.batidaSub} numberOfLines={1}>
                        por {b.registradoPorNome}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable onPress={() => abrirEdicao(b)} hitSlop={8} style={styles.acao}>
                    <Ionicons name="create-outline" size={18} color={cores.primaria} />
                  </Pressable>
                  <Pressable onPress={() => void removerBatida(b.id)} hitSlop={8} style={styles.acao}>
                    <Ionicons name="trash-outline" size={18} color={cores.vermelho} />
                  </Pressable>
                </View>
              ))}
            </Cartao>
          ) : dados ? (
            <EstadoVazio
              titulo="Sem batidas neste dia"
              descricao="Registre a primeira batida (entrada) do papelito."
            />
          ) : null}

          {/* Formulário de batida */}
          {mostrarForm ? (
            <Cartao>
              <Text style={styles.secaoTitulo}>
                {editandoId ? 'Corrigir hora da batida' : 'Registrar batida'}
              </Text>
              <CampoTexto
                rotulo="Hora do papelito (HH:mm)"
                placeholder="07:56"
                value={horaTexto}
                onChangeText={(t) => setHoraTexto(mascaraHora(t))}
                keyboardType="number-pad"
                maxLength={5}
                erro={erroForm}
              />
              <View style={styles.botoesForm}>
                <Botao
                  titulo="Cancelar"
                  variante="secundario"
                  aoPressionar={() => {
                    setMostrarForm(false);
                    setEditandoId(null);
                    setErroForm(null);
                  }}
                />
                <Botao
                  titulo={editandoId ? 'Salvar correção' : 'Registrar'}
                  aoPressionar={() => void salvarBatida()}
                  carregando={salvando}
                />
              </View>
            </Cartao>
          ) : (
            <Botao
              titulo="Registrar batida"
              aoPressionar={abrirRegistro}
            />
          )}
        </>
      )}
    </Tela>
  );
}

/** Painel com os números da jornada do dia. */
function PainelJornada({ dados }: { dados: JornadaDiaPonto }): React.ReactElement {
  const j = dados.jornada;
  const status = seloStatus(j.status);
  const extras =
    j.horasExtrasMs > 0
      ? `${formatarDuracao(j.horasExtrasMs)} (${j.horasExtras100Ms > 0 ? '100%' : '50%'})`
      : '—';

  return (
    <Cartao>
      <View style={styles.painelTopo}>
        <Text style={styles.secaoTitulo}>Jornada do dia</Text>
        <Selo texto={status.texto} cor={status.cor} fundo={status.fundo} />
      </View>

      <View style={styles.metricas}>
        <View style={styles.metrica}>
          <Text style={styles.metricaValor}>{formatarDuracao(j.trabalhadoMs)}</Text>
          <Text style={styles.metricaRotulo}>Trabalhado</Text>
        </View>
        <View style={styles.metrica}>
          <Text style={styles.metricaValor}>{formatarDuracao(j.intervaloMs)}</Text>
          <Text style={styles.metricaRotulo}>Intervalo</Text>
        </View>
        <View style={styles.metrica}>
          <Text style={styles.metricaValor}>{extras}</Text>
          <Text style={styles.metricaRotulo}>Horas extras</Text>
        </View>
      </View>

      <Text style={styles.baseTexto}>
        Carga base do dia: {formatarDuracao(j.baseMs)}
      </Text>

      {j.alertaIminente ? (
        <View style={[styles.faixa, { backgroundColor: cores.amareloFundo }]}>
          <Ionicons name="time-outline" size={16} color={cores.amarelo} />
          <Text style={[styles.faixaTexto, { color: cores.amarelo }]}>
            Perto do limite: já passou de 1h45 de horas extras.
          </Text>
        </View>
      ) : null}

      {j.tac ? (
        <View style={[styles.faixa, { backgroundColor: cores.vermelhoFundo }]}>
          <Ionicons name="warning-outline" size={16} color={cores.vermelho} />
          <Text style={[styles.faixaTexto, { color: cores.vermelho }]}>
            TAC: {j.motivosTac.join('; ')}.
          </Text>
        </View>
      ) : null}

      {j.faltando.length > 0 ? (
        <Text style={styles.faltando}>Falta registrar: {j.faltando.join(', ')}.</Text>
      ) : null}
    </Cartao>
  );
}

const styles = StyleSheet.create({
  loteLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    marginBottom: espacamento.xs,
  },
  loteTexto: {
    ...tipografia.corpo,
    color: cores.texto,
    flex: 1,
  },
  sessaoTexto: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.sm,
  },
  leituraBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    marginTop: espacamento.xs,
    marginBottom: espacamento.sm,
  },
  leituraTexto: {
    ...tipografia.legenda,
    color: cores.texto,
    flex: 1,
    fontWeight: '600',
  },
  resultado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    paddingVertical: espacamento.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
  },
  resultadoNome: {
    ...tipografia.corpo,
    color: cores.texto,
    flex: 1,
    fontWeight: '600',
  },
  vazioBusca: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    paddingVertical: espacamento.sm,
  },
  cabecalhoPessoa: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pessoaInfo: {
    flex: 1,
  },
  pessoaNome: {
    ...tipografia.subtitulo,
    color: cores.texto,
  },
  pessoaData: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  trocar: {
    ...tipografia.corpo,
    color: cores.primaria,
    fontWeight: '600',
  },
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    marginTop: espacamento.sm,
  },
  avisoTexto: {
    ...tipografia.legenda,
    color: cores.amarelo,
    flex: 1,
  },
  painelTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: espacamento.sm,
  },
  secaoTitulo: {
    ...tipografia.rotulo,
    fontWeight: '700',
    color: cores.texto,
    marginBottom: espacamento.sm,
  },
  metricas: {
    flexDirection: 'row',
    gap: espacamento.sm,
  },
  metrica: {
    flex: 1,
    backgroundColor: cores.fundo,
    borderRadius: raio.md,
    paddingVertical: espacamento.sm,
    alignItems: 'center',
  },
  metricaValor: {
    ...tipografia.corpo,
    fontWeight: '700',
    color: cores.texto,
    textAlign: 'center',
  },
  metricaRotulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  baseTexto: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
  },
  faixa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    borderRadius: raio.md,
    padding: espacamento.sm,
    marginTop: espacamento.sm,
  },
  faixaTexto: {
    ...tipografia.legenda,
    fontWeight: '600',
    flex: 1,
  },
  faltando: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
  },
  batidaLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    paddingVertical: espacamento.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
  },
  batidaHora: {
    ...tipografia.subtitulo,
    fontWeight: '700',
    color: cores.texto,
    width: 64,
  },
  batidaInfo: {
    flex: 1,
  },
  batidaTipo: {
    ...tipografia.corpo,
    color: cores.texto,
    fontWeight: '600',
  },
  batidaSub: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  acao: {
    padding: espacamento.xs,
  },
  botoesForm: {
    flexDirection: 'row',
    gap: espacamento.sm,
  },
});

export default RegistroPontoScreen;
