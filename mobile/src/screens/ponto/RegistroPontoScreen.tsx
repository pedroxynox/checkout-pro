/**
 * Registro de Ponto (leitor de comprovante) — Fase A.
 *
 * Permite escolher um colaborador (fiscal), ver a jornada do dia calculada a
 * partir das batidas e registrar/corrigir/remover batidas manualmente (a hora
 * do comprovante). Há um "modo lote" para registrar vários comprovantes em sequência.
 * A leitura automática por câmera/OCR entra na Fase B.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { fiscaisService, pontoService } from '../../api/services';
import {
  BatidaPontoView,
  JornadaDiaPonto,
  MeuResumoFiscal,
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
import { confirmar, notificar } from '../../utils/dialogos';
import { formatarData, formatarDuracao, hojeISO } from '../../utils/formato';
import { capturarComprovante } from './leitorComprovante';
import { LeitorComprovanteAoVivo } from './leitorAoVivo';

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

/** Hora "HH:mm" a partir do ISO gravado (a hora do comprovante, sem fuso). */
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

  // Autosserviço do fiscal logado: se o usuário atual é fiscal, pode informar
  // a própria falta de hoje (antes ficava na aba Fiscais, removida). Fica null
  // quando o usuário não é fiscal — aí o card nem aparece.
  const [meuFiscal, setMeuFiscal] = useState<MeuResumoFiscal | null>(null);

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

  // Modo lote (vários comprovantes em sequência) + contador da sessão.
  const [loteAtivo, setLoteAtivo] = useState(false);
  const [sessao, setSessao] = useState(0);

  // Leitura do comprovante (Fase B): estado do OCR e o que foi lido.
  const [scannerAberto, setScannerAberto] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [leituraInfo, setLeituraInfo] = useState<{
    nome: string | null;
    hora: string | null;
  } | null>(null);
  const [horaPendente, setHoraPendente] = useState<string | null>(null);

  // Descobre se o usuário logado é fiscal (para o autosserviço de falta).
  useEffect(() => {
    fiscaisService
      .meuResumo()
      .then(setMeuFiscal)
      .catch(() => setMeuFiscal(null));
  }, []);

  async function informarMinhaFalta(): Promise<void> {
    const ok = await confirmar(
      'Informar falta',
      'Deseja informar sua falta de hoje? Os gestores serão avisados.',
      'Confirmar',
    );
    if (!ok) return;
    try {
      await fiscaisService.informarFalta();
      setMeuFiscal((m) => (m ? { ...m, faltaHoje: true } : m));
      notificar('Falta registrada', 'Os gestores foram avisados.');
    } catch (e) {
      notificar(
        'Erro',
        e instanceof ApiError ? e.message : 'Não foi possível registrar.',
      );
    }
  }

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
    // Se a hora veio do comprovante, já abre o formulário preenchido.
    if (horaPendente) {
      setHoraTexto(horaPendente);
      setHoraPendente(null);
      setMostrarForm(true);
    }
  }

  /**
   * Interpreta no servidor o texto lido (pelo leitor ao vivo ou pela foto):
   * preenche a hora e sugere o colaborador; o usuário confirma antes de gravar.
   */
  async function processarTextoLido(texto: string): Promise<void> {
    setLendo(true);
    setErro(null);
    try {
      const r = await pontoService.lerComprovante({ texto });
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
      setErro(
        e instanceof ApiError
          ? e.message
          : 'Não foi possível ler o comprovante do ponto.',
      );
    } finally {
      setLendo(false);
    }
  }

  /** Reforço manual: tira uma única foto e lê (fallback do leitor ao vivo). */
  async function tirarFoto(): Promise<void> {
    setErro(null);
    let captura: { texto?: string } | null;
    try {
      captura = await capturarComprovante();
    } catch {
      setErro('Não foi possível abrir a câmera.');
      return;
    }
    if (!captura || !captura.texto) return;
    await processarTextoLido(captura.texto);
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
      {/* Autosserviço do fiscal logado: informar a própria falta de hoje. */}
      {meuFiscal && data === hojeISO() ? (
        meuFiscal.folgaHoje ? (
          <View style={[styles.minhaFaltaInfo, { backgroundColor: '#EEF2FF' }]}>
            <Ionicons name="bed-outline" size={18} color="#6366F1" />
            <Text style={[styles.minhaFaltaTexto, { color: '#4338CA' }]}>
              Hoje é seu dia de folga.
            </Text>
          </View>
        ) : meuFiscal.faltaHoje ? (
          <View
            style={[styles.minhaFaltaInfo, { backgroundColor: cores.vermelhoFundo }]}
          >
            <Ionicons name="information-circle" size={18} color={cores.vermelho} />
            <Text style={[styles.minhaFaltaTexto, { color: cores.vermelho }]}>
              Você informou falta hoje. Os gestores foram avisados.
            </Text>
          </View>
        ) : (
          <Cartao>
            <Text style={styles.secaoTitulo}>Minha jornada</Text>
            <Text style={styles.minhaAjuda}>
              Não vai trabalhar hoje? Avise sua falta para os gestores.
            </Text>
            <Botao
              titulo="Informar minha falta de hoje"
              variante="secundario"
              aoPressionar={() => void informarMinhaFalta()}
            />
          </Cartao>
        )
      ) : null}

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
          Modo lote (registrar vários comprovantes em sequência)
        </Text>
      </Pressable>
      {loteAtivo && sessao > 0 ? (
        <Text style={styles.sessaoTexto}>
          Batidas registradas nesta sessão: {sessao}
        </Text>
      ) : null}

      {/* Leitor do comprovante: só no APK (lê no aparelho com ML Kit). A câmera
          escaneia sozinha e captura quando a leitura fica boa; a foto única é
          um reforço manual. Na web, sem leitor on-device, o registro é manual. */}
      {Platform.OS !== 'web' ? (
        <>
          <Botao
            titulo="Ler comprovante (automático)"
            aoPressionar={() => setScannerAberto(true)}
            carregando={lendo}
          />
          <Pressable onPress={() => void tirarFoto()} style={styles.linkFoto}>
            <Ionicons name="camera-outline" size={16} color={cores.primaria} />
            <Text style={styles.linkFotoTexto}>Tirar foto do comprovante</Text>
          </Pressable>
          {leituraInfo ? (
            <View style={styles.leituraBanner}>
              <Ionicons name="scan-outline" size={16} color={cores.primaria} />
              <Text style={styles.leituraTexto}>
                Lido: {leituraInfo.nome ?? 'nome não identificado'}
                {leituraInfo.hora ? ` · ${leituraInfo.hora}` : ' · sem hora'}
              </Text>
            </View>
          ) : null}

          <LeitorComprovanteAoVivo
            visivel={scannerAberto}
            aoLer={(texto) => {
              setScannerAberto(false);
              void processarTextoLido(texto);
            }}
            aoCancelar={() => setScannerAberto(false)}
          />
        </>
      ) : null}

      {/* Seleção do colaborador */}
      {!pessoa ? (
        <Cartao>
          <CampoTexto
            rotulo="Colaborador (nome no comprovante do ponto)"
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
              descricao="Registre a primeira batida (entrada) do comprovante."
            />
          ) : null}

          {/* Formulário de batida */}
          {mostrarForm ? (
            <Cartao>
              <Text style={styles.secaoTitulo}>
                {editandoId ? 'Corrigir hora da batida' : 'Registrar batida'}
              </Text>
              <CampoTexto
                rotulo="Hora do comprovante (HH:mm)"
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
  linkFoto: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacamento.xs,
    marginTop: espacamento.sm,
    marginBottom: espacamento.sm,
  },
  linkFotoTexto: {
    ...tipografia.rotulo,
    color: cores.primaria,
    fontWeight: '600',
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
  minhaAjuda: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.sm,
  },
  minhaFaltaInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    borderRadius: raio.md,
    padding: espacamento.md,
    marginBottom: espacamento.sm,
  },
  minhaFaltaTexto: {
    ...tipografia.rotulo,
    flex: 1,
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
