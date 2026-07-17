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
  CandidatoPonto,
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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../auth/AuthContext';
import { useConfigSistema } from '../../config/ConfigSistemaContext';
import { useOfflineContexto } from '../../offline/OfflineContext';
import { gerarId } from '../../offline/OfflineStore';

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

/** Frase curta que explica cada estado da jornada (evita confundi-los). */
function descricaoStatus(s: StatusJornadaPonto): string {
  switch (s) {
    case 'TRABALHANDO':
      return 'Em expediente agora — a jornada está em andamento.';
    case 'EM_INTERVALO':
      return 'Em intervalo agora — o intervalo não conta como trabalho.';
    case 'ENCERRADO':
      return 'Jornada do dia concluída (finalizada).';
    case 'INCOMPLETO':
      return 'Faltou registrar uma batida — o dia não pôde ser fechado.';
    default:
      return 'Nenhuma batida registrada neste dia.';
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

/** Cor do indicador de confiança da leitura (verde/âmbar/vermelho). */
function corConfianca(c: number | null): string {
  if (c == null) return cores.textoSecundario;
  if (c >= 0.8) return cores.verde;
  if (c >= 0.55) return cores.amarelo;
  return cores.vermelho;
}

/** Rótulo curto da confiança da leitura. */
function rotuloConfianca(c: number): string {
  if (c >= 0.8) return 'alta confiança';
  if (c >= 0.55) return 'confira';
  return 'baixa confiança';
}

export function RegistroPontoScreen(): React.ReactElement {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { podeAcessar } = useAuth();
  const { dataInicial } = useConfigSistema();
  // Fila offline: se não houver conexão, a batida é guardada no dispositivo e
  // enviada ao reconectar (sem duplicar, via chave de idempotência).
  const { enfileirar: enfileirarOffline } = useOfflineContexto();
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
    confianca: number | null;
  } | null>(null);
  const [horaPendente, setHoraPendente] = useState<string | null>(null);
  // Sugestões da leitura (com confiança) e o nome exatamente como foi LIDO —
  // guardado para o leitor "aprender" a pessoa ao confirmar a batida.
  const [candidatos, setCandidatos] = useState<CandidatoPonto[]>([]);
  const [nomeLidoPendente, setNomeLidoPendente] = useState<string | null>(null);
  const [confiancaPendente, setConfiancaPendente] = useState<number | null>(
    null,
  );

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
    // Digitou uma busca manual → tira as sugestões da leitura para não confundir.
    setCandidatos([]);
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
      const resp = await pontoService.jornadaDoDia(
        pessoa.id,
        data,
        pessoa.tipoPessoa,
      );
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
    setCandidatos([]);
    setErro(null);
    // Se a hora veio do comprovante, já abre o formulário preenchido.
    if (horaPendente) {
      setHoraTexto(horaPendente);
      setHoraPendente(null);
      setMostrarForm(true);
    }
  }

  /** Escolhe a pessoa e já preenche a hora lida (usado no acerto automático). */
  function escolherComHora(p: PessoaPonto, hora: string | null): void {
    setPessoa(p);
    setBusca('');
    setResultados([]);
    setCandidatos([]);
    setHoraPendente(null);
    setErro(null);
    if (hora) {
      setHoraTexto(hora);
      setMostrarForm(true);
    }
  }

  /**
   * Interpreta no servidor o texto lido (pelo leitor ao vivo ou pela foto):
   * preenche a hora e sugere o colaborador. Quando a leitura é bem confiável e
   * há um candidato claramente melhor, já seleciona sozinho (o usuário só
   * confirma a hora); senão, mostra as sugestões ordenadas por confiança.
   */
  async function processarTextoLido(texto: string): Promise<void> {
    setLendo(true);
    setErro(null);
    try {
      const r = await pontoService.lerComprovante({ texto });
      const confiancaGeral = r.confianca?.geral ?? null;
      setLeituraInfo({ nome: r.nome, hora: r.hora, confianca: confiancaGeral });
      setNomeLidoPendente(r.nome);
      setConfiancaPendente(confiancaGeral);
      if (r.data) setData(r.data);

      // Já havia uma pessoa escolhida: só preenche a hora lida.
      if (pessoa) {
        if (r.hora) {
          setHoraTexto(r.hora);
          setMostrarForm(true);
        }
        return;
      }

      const sugestoes = r.candidatos ?? [];
      const top = sugestoes[0];
      const segundo = sugestoes[1];
      // Acerto automático: candidato memorizado, ou muito confiável e bem à
      // frente do 2º (evita escolher errado quando há dois nomes parecidos).
      const autoSelecionar =
        !!top &&
        (top.aprendido || top.confianca >= 0.85) &&
        (!segundo || top.confianca - segundo.confianca >= 0.2);

      if (autoSelecionar) {
        escolherComHora(top, r.hora);
      } else if (sugestoes.length > 0) {
        setCandidatos(sugestoes);
        setResultados([]);
        setHoraPendente(r.hora);
      } else {
        setErro(
          'Não identifiquei o colaborador. Busque pelo nome e registre a hora.',
        );
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
    setCandidatos([]);
  }

  function abrirRegistro(): void {
    if (limiteBatidasAtingido) {
      setErroForm('Limite de 4 batidas atingido para este dia.');
      return;
    }
    setEditandoId(null);
    setHoraTexto('');
    setErroForm(null);
    // Registro manual (sem leitura): não é do leitor, então não aprende alias.
    setNomeLidoPendente(null);
    setConfiancaPendente(null);
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
    if (!editandoId && limiteBatidasAtingido) {
      setErroForm('Limite de 4 batidas atingido para este dia.');
      return;
    }
    if (!HORA_VALIDA.test(horaTexto)) {
      setErroForm('Informe a hora no formato HH:mm (ex.: 07:56).');
      return;
    }
    // Aviso de consequência (tarefa 52): corrigir a hora num dia com horas
    // extras/TAC recalcula esses valores — confirma antes de aplicar.
    if (editandoId) {
      const jornada = dados?.jornada;
      if (jornada && (jornada.horasExtrasMs > 0 || jornada.tac)) {
        const ok = await confirmar(
          'Confirmar correção',
          'Este dia tem horas extras/TAC. Corrigir a hora vai recalcular esses valores. Deseja continuar?',
          'Corrigir',
        );
        if (!ok) return;
      }
    }
    setSalvando(true);
    setErroForm(null);
    // Chave de idempotência da batida, fixada ANTES da tentativa online e
    // reusada se cair na fila offline: se o servidor gravar mas a resposta se
    // perder, o reenvio com o mesmo clienteId não duplica.
    const clienteId = gerarId();
    try {
      const horaISO = `${data}T${horaTexto}:00.000Z`;
      // Veio do leitor quando temos um nome lido pendente (e não é edição):
      // marcamos origem LEITOR e mandamos o nome lido para o leitor aprender.
      const veioDoLeitor = !editandoId && !!nomeLidoPendente;
      const resp = editandoId
        ? await pontoService.editarBatida(editandoId, { hora: horaISO })
        : await pontoService.registrarBatida({
            clienteId,
            pessoaId: pessoa.id,
            tipoPessoa: pessoa.tipoPessoa,
            colaboradorId: pessoa.colaboradorId ?? undefined,
            data,
            hora: horaISO,
            origem: veioDoLeitor ? 'LEITOR' : 'MANUAL',
            nomeLido: veioDoLeitor ? nomeLidoPendente ?? undefined : undefined,
            confianca: veioDoLeitor ? confiancaPendente ?? undefined : undefined,
          });
      setDados(resp);
      setMostrarForm(false);
      setHoraTexto('');
      if (!editandoId) {
        setSessao((s) => s + 1);
        setNomeLidoPendente(null);
        setConfiancaPendente(null);
        // No modo lote, volta para escolher o próximo colaborador.
        if (loteAtivo) trocarPessoa();
      }
      setEditandoId(null);
    } catch (e) {
      // Sem conexão (ApiError status 0) numa batida NOVA: guarda na fila offline
      // e informa; será enviada ao reconectar, sem duplicar (idempotência pela
      // chave da ação). Edições exigem a batida no servidor, então não caem aqui.
      const semRede = e instanceof ApiError && e.status === 0;
      if (!editandoId && semRede) {
        try {
          const horaISO = `${data}T${horaTexto}:00.000Z`;
          const veioDoLeitor = !!nomeLidoPendente;
          await enfileirarOffline(
            'REGISTRO_BATIDA',
            {
              // Mesmo clienteId da tentativa online (idempotência ponta a ponta).
              clienteId,
              pessoaId: pessoa.id,
              tipoPessoa: pessoa.tipoPessoa,
              colaboradorId: pessoa.colaboradorId ?? undefined,
              data,
              hora: horaISO,
              origem: veioDoLeitor ? 'LEITOR' : 'MANUAL',
              nomeLido: veioDoLeitor ? nomeLidoPendente ?? undefined : undefined,
              confianca: veioDoLeitor ? confiancaPendente ?? undefined : undefined,
            },
            pessoa.id,
          );
          setMostrarForm(false);
          setHoraTexto('');
          setSessao((s) => s + 1);
          setNomeLidoPendente(null);
          setConfiancaPendente(null);
          if (loteAtivo) trocarPessoa();
          setEditandoId(null);
          notificar(
            'Sem conexão',
            'A batida foi guardada no aparelho e será enviada automaticamente ao reconectar.',
          );
        } catch {
          setErroForm('Não foi possível guardar a batida no aparelho.');
        }
      } else {
        setErroForm(
          e instanceof ApiError ? e.message : 'Não foi possível salvar a batida.',
        );
      }
    } finally {
      setSalvando(false);
    }
  }

  async function removerBatida(b: BatidaPontoView): Promise<void> {
    if (!pessoa) return;
    // Consequência (tarefa 52): se o dia tem horas extras ou TAC, a exclusão vai
    // recalcular esses valores — avisa antes, junto da confirmação (tarefa 29).
    const jornada = dados?.jornada;
    const consequencia =
      jornada && (jornada.horasExtrasMs > 0 || jornada.tac)
        ? ' Atenção: isso vai recalcular as horas extras/TAC do dia.'
        : '';
    const ok = await confirmar(
      'Excluir batida',
      `Excluir a batida das ${horaLabel(b.hora)} (${ROTULO_TIPO[b.tipo]}) de ${pessoa.nome} em ${formatarData(data)}?${consequencia}`,
      'Excluir',
    );
    if (!ok) return;
    try {
      const resp = await pontoService.removerBatida(b.id);
      setDados(resp);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível remover a batida.');
    }
  }

  const limiteBatidasAtingido = (dados?.batidas.length ?? 0) >= 4;
  const dataDiferenteDeHoje = data !== hojeISO();

  return (
    <Tela aoAtualizar={pessoa ? carregarJornada : undefined} atualizando={carregando}>
      {/* Atalho para a Central de Jornada (controle do ciclo 26→25). */}
      {podeAcessar('CENTRAL_JORNADA') && (
        <Pressable
          onPress={() => navigation.navigate('CentralJornada')}
          style={styles.cardCentral}
        >
          <View style={styles.cardCentralIcone}>
            <Ionicons name="albums-outline" size={22} color={cores.primaria} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardCentralTitulo}>Central de Jornada</Text>
            <Text style={styles.cardCentralSub}>
              Carga, horas extras, faltas e saldo por colaborador (ciclo 26→25)
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={cores.textoSecundario} />
        </Pressable>
      )}

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

      <SeletorData
        valor={data}
        aoMudar={setData}
        rotulo="Dia"
        dataMinima={dataInicial}
        permitirFuturo={false}
      />

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
      {Platform.OS !== 'web' && (!pessoa || !limiteBatidasAtingido) ? (
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
              <Ionicons
                name="scan-outline"
                size={16}
                color={corConfianca(leituraInfo.confianca)}
              />
              <Text style={styles.leituraTexto}>
                Lido: {leituraInfo.nome ?? 'nome não identificado'}
                {leituraInfo.hora ? ` · ${leituraInfo.hora}` : ' · sem hora'}
              </Text>
              {leituraInfo.confianca != null ? (
                <Text
                  style={[
                    styles.leituraConf,
                    { color: corConfianca(leituraInfo.confianca) },
                  ]}
                >
                  {rotuloConfianca(leituraInfo.confianca)}
                </Text>
              ) : null}
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

      {/* Sugestões da leitura (ordenadas por confiança), quando não há acerto
          automático. O usuário toca no colaborador certo para continuar. */}
      {!pessoa && candidatos.length > 0 ? (
        <Cartao>
          <Text style={styles.secaoTitulo}>Sugestões da leitura</Text>
          {candidatos.map((c, i) => (
            <Pressable
              key={c.id}
              onPress={() => selecionarPessoa(c)}
              style={styles.resultado}
              accessibilityRole="button"
            >
              <Ionicons name="person-outline" size={18} color={cores.primaria} />
              <View style={styles.candidatoInfo}>
                <Text style={styles.candidatoNome}>{c.nome}</Text>
                {c.aprendido ? (
                  <Text style={[styles.candidatoTag, { color: cores.primaria }]}>
                    memorizado · {Math.round(c.confianca * 100)}%
                  </Text>
                ) : i === 0 ? (
                  <Text style={[styles.candidatoTag, { color: cores.verde }]}>
                    mais provável · {Math.round(c.confianca * 100)}%
                  </Text>
                ) : (
                  <Text style={styles.candidatoTagFraco}>
                    {Math.round(c.confianca * 100)}%
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={16} color={cores.textoSecundario} />
            </Pressable>
          ))}
        </Cartao>
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
                  {/* Corrigir/remover batidas exige PONTO_EDITAR (gestão). O
                      fiscal só registra batidas novas, então não vê estes botões. */}
                  {podeAcessar('PONTO_EDITAR') ? (
                    <>
                      <Pressable onPress={() => abrirEdicao(b)} hitSlop={8} style={styles.acao}>
                        <Ionicons name="create-outline" size={18} color={cores.primaria} />
                      </Pressable>
                      <Pressable onPress={() => void removerBatida(b)} hitSlop={8} style={styles.acao}>
                        <Ionicons name="trash-outline" size={18} color={cores.vermelho} />
                      </Pressable>
                    </>
                  ) : null}
                </View>
              ))}
            </Cartao>
          ) : dados ? (
            <EstadoVazio
              titulo="Sem batidas neste dia"
              descricao="Registre a primeira batida (entrada) do comprovante."
            />
          ) : null}

          {limiteBatidasAtingido && !editandoId ? (
            <View style={styles.limiteBatidasAviso}>
              <Ionicons name="checkmark-circle-outline" size={18} color={cores.textoSecundario} />
              <Text style={styles.limiteBatidasTexto}>
                Limite de 4 batidas atingido. Você ainda pode corrigir ou excluir uma batida.
              </Text>
            </View>
          ) : null}

          {/* Formulário de batida */}
          {mostrarForm && (editandoId || !limiteBatidasAtingido) ? (
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
          ) : !limiteBatidasAtingido ? (
            <Botao
              titulo="Registrar batida"
              aoPressionar={abrirRegistro}
            />
          ) : null}
        </>
      )}
    </Tela>
  );
}

/** Painel com os números da jornada do dia. */
function PainelJornada({ dados }: { dados: JornadaDiaPonto }): React.ReactElement {
  const j = dados.jornada;
  const status = seloStatus(j.status);
  const [verComoCalcula, setVerComoCalcula] = useState(false);
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

      {/* Descrição do estado atual, para não confundir os cinco status. */}
      <Text style={styles.statusDescricao}>{descricaoStatus(j.status)}</Text>

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

      {/* Explicação do cálculo (tarefa 46): de onde saem os números. */}
      <Pressable
        onPress={() => setVerComoCalcula((v) => !v)}
        style={styles.comoCalculaBtn}
        accessibilityRole="button"
      >
        <Ionicons
          name={verComoCalcula ? 'chevron-up' : 'help-circle-outline'}
          size={16}
          color={cores.primaria}
        />
        <Text style={styles.comoCalculaTexto}>
          {verComoCalcula ? 'Ocultar como é calculado' : 'Como é calculado?'}
        </Text>
      </Pressable>
      {verComoCalcula ? (
        <View style={styles.comoCalculaBox}>
          <Text style={styles.comoCalculaLinha}>
            • Trabalhado: soma dos períodos entre a entrada e a saída, sem contar
            o intervalo.
          </Text>
          <Text style={styles.comoCalculaLinha}>
            • Horas extras: o que passou da carga base do dia (
            {formatarDuracao(j.baseMs)}) —{' '}
            {j.horasExtras100Ms > 0
              ? '100% (domingo/feriado)'
              : '50% (dia útil)'}
            .
          </Text>
          <Text style={styles.comoCalculaLinha}>
            • Intervalo: tempo entre a saída e o retorno; não conta como
            trabalho.
          </Text>
          <Text style={styles.comoCalculaLinha}>
            {j.tac
              ? `• TAC neste dia: ${j.motivosTac.join('; ')}.`
              : '• TAC: acima de 1h50 de extras, ou intervalo abaixo de 1h / acima de 3h.'}
          </Text>
        </View>
      ) : null}

      {j.alertaIminente ? (
        <View style={[styles.faixa, { backgroundColor: cores.amareloFundo }]}>
          <Ionicons name="time-outline" size={16} color={cores.amarelo} />
          <Text style={[styles.faixaTexto, { color: cores.amarelo }]}>
            {j.horasExtrasMs >= 100 * 60_000
              ? 'Risco alto de TAC: já atingiu 1h40 de horas extras.'
              : 'Risco de TAC: já atingiu 1h30 de horas extras.'}
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
  cardCentral: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.md,
    backgroundColor: cores.superficie ?? '#fff',
    borderRadius: raio.lg,
    padding: espacamento.md,
    marginBottom: espacamento.md,
    borderWidth: 1,
    borderColor: cores.divisor,
  },
  cardCentralIcone: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: cores.primariaClara ?? '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardCentralTitulo: { ...tipografia.rotulo, color: cores.texto, fontWeight: '700' },
  cardCentralSub: { ...tipografia.legenda, color: cores.textoSecundario, marginTop: 2 },
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
  leituraConf: {
    ...tipografia.legenda,
    fontWeight: '700',
  },
  candidatoInfo: {
    flex: 1,
  },
  candidatoNome: {
    ...tipografia.corpo,
    color: cores.texto,
    fontWeight: '600',
  },
  candidatoTag: {
    ...tipografia.legenda,
    fontWeight: '700',
  },
  candidatoTagFraco: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
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
  statusDescricao: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.xs,
    marginBottom: espacamento.sm,
  },
  comoCalculaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    marginTop: espacamento.sm,
  },
  comoCalculaTexto: {
    ...tipografia.rotulo,
    color: cores.primaria,
    fontWeight: '600',
  },
  comoCalculaBox: {
    marginTop: espacamento.xs,
    gap: espacamento.xs,
  },
  comoCalculaLinha: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
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
  limiteBatidasAviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    borderRadius: raio.md,
    backgroundColor: cores.superficieAlternativa,
    padding: espacamento.md,
    marginBottom: espacamento.sm,
  },
  limiteBatidasTexto: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    flex: 1,
  },
  botoesForm: {
    flexDirection: 'row',
    gap: espacamento.sm,
  },
});

export default RegistroPontoScreen;
