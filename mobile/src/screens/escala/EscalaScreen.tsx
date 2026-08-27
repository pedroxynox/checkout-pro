/**
 * Escala para PUBLICAR (enviar à equipe).
 *
 * Mostra a escala do **dia** ou da **semana** com todo o time e entrega os dois
 * formatos de envio: **PDF** (imprime/salva, funciona no app e no navegador) e
 * **imagem 4K** (só no navegador, onde existe canvas). O desenho dos dois vem do
 * mesmo SVG (`utils/escalaLayout`), então o que se vê no PDF é o que sai na
 * imagem.
 *
 * A prévia aqui é uma leitura nativa dos mesmos dados — não é o SVG renderizado.
 * Desenhar o SVG na tela exigiria interpretá-lo em runtime só para conferir algo
 * que o PDF já mostra fiel; a prévia serve para confirmar **conteúdo** (quem
 * está, quem falta, os horários), não a arte final.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { escalaExportacaoService } from '../../api/services';
import {
  EscalaDiaPublicada,
  EscalaSemanaPublicada,
  LinhaEscala,
  StatusEscala,
} from '../../api/services/escalaExportacao';
import {
  Botao,
  Carregando,
  Cartao,
  MensagemErro,
  Segmentado,
  Selo,
  SeletorData,
  Tela,
} from '../../components';
import { useConfigSistema } from '../../config/ConfigSistemaContext';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { notificar } from '../../utils/dialogos';
import {
  htmlDeImpressao,
  nomeArquivoEscala,
  svgEscalaDia,
  svgEscalaSemana,
} from '../../utils/escalaLayout';
import { formatarData, hojeISO } from '../../utils/formato';
import { baixarEscalaComoPng, suportaImagemPng } from '../../utils/imagemEscala';
import { imprimirRelatorio } from '../../utils/impressao';

type Periodo = 'DIA' | 'SEMANA';

const OPCOES_PERIODO: { valor: Periodo; rotulo: string }[] = [
  { valor: 'DIA', rotulo: 'Dia' },
  { valor: 'SEMANA', rotulo: 'Semana' },
];

const TITULO_FUNCAO: Record<string, string> = {
  SUPERVISOR: 'Supervisão',
  FISCAL: 'Fiscais',
  OPERADOR: 'Operadores de caixa',
};

const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Palavra e cor de cada estado na prévia (espelho do desenho impresso). */
function aparencia(status: StatusEscala): { rotulo: string; cor: string } {
  switch (status) {
    case 'FOLGA':
      return { rotulo: 'Folga', cor: cores.textoSecundario };
    case 'FALTA':
      return { rotulo: 'Falta', cor: cores.vermelho };
    case 'ATESTADO':
      return { rotulo: 'Atestado', cor: cores.azul };
    case 'FERIAS':
      return { rotulo: 'Férias', cor: cores.primaria };
    default:
      return { rotulo: '', cor: cores.texto };
  }
}

export function EscalaScreen(): React.ReactElement {
  const { dataInicial } = useConfigSistema();
  const [periodo, setPeriodo] = useState<Periodo>('DIA');
  const [data, setData] = useState(hojeISO());
  const [gerando, setGerando] = useState<'PDF' | 'IMAGEM' | null>(null);

  const dia = useRequisicao<EscalaDiaPublicada>(
    () =>
      periodo === 'DIA'
        ? escalaExportacaoService.dia(data)
        : Promise.resolve(null as unknown as EscalaDiaPublicada),
    [periodo, data],
  );
  const semana = useRequisicao<EscalaSemanaPublicada>(
    () =>
      periodo === 'SEMANA'
        ? escalaExportacaoService.semana(data)
        : Promise.resolve(null as unknown as EscalaSemanaPublicada),
    [periodo, data],
  );

  const req = periodo === 'DIA' ? dia : semana;
  const podeImagem = suportaImagemPng();

  /** O SVG do que está na tela, no formato final de publicação. */
  const imagem = useMemo(() => {
    if (periodo === 'DIA') {
      return dia.dados ? svgEscalaDia(dia.dados) : null;
    }
    return semana.dados ? svgEscalaSemana(semana.dados) : null;
  }, [periodo, dia.dados, semana.dados]);

  const referencia =
    periodo === 'DIA'
      ? (dia.dados?.dataISO ?? data)
      : (semana.dados?.inicioISO ?? data);

  async function baixarPdf(): Promise<void> {
    if (!imagem) return;
    setGerando('PDF');
    try {
      await imprimirRelatorio(
        htmlDeImpressao(
          imagem,
          periodo === 'DIA'
            ? `Escala do dia ${formatarData(referencia)}`
            : `Escala da semana ${formatarData(referencia)}`,
        ),
      );
    } catch {
      notificar('Erro', 'Não foi possível abrir o PDF da escala.');
    } finally {
      setGerando(null);
    }
  }

  async function baixarImagem(): Promise<void> {
    if (!imagem) return;
    setGerando('IMAGEM');
    try {
      await baixarEscalaComoPng(
        imagem,
        nomeArquivoEscala(periodo === 'DIA' ? 'dia' : 'semana', referencia, 'png'),
      );
    } catch (e) {
      notificar(
        'Erro',
        e instanceof Error ? e.message : 'Não foi possível gerar a imagem.',
      );
    } finally {
      setGerando(null);
    }
  }

  return (
    <Tela aoAtualizar={req.recarregar} atualizando={req.atualizando}>
      <Cartao>
        <Segmentado
          opcoes={OPCOES_PERIODO}
          selecionado={periodo}
          aoSelecionar={setPeriodo}
        />
        <View style={styles.seletor}>
          <SeletorData
            valor={data}
            aoMudar={setData}
            rotulo={periodo === 'DIA' ? 'Dia da escala' : 'Semana do dia'}
            dataMinima={dataInicial}
          />
        </View>
        {/* Publicar a escala de amanhã é o caso normal, então o futuro é
            liberado — o seletor não bloqueia dias à frente. */}
        {periodo === 'SEMANA' && semana.dados ? (
          <Text style={styles.periodoTexto}>
            Semana de {formatarData(semana.dados.inicioISO)} a{' '}
            {formatarData(semana.dados.fimISO)} (segunda a domingo).
          </Text>
        ) : null}
      </Cartao>

      {req.carregando ? (
        <Carregando />
      ) : req.erro ? (
        <MensagemErro mensagem={req.erro} aoTentarNovamente={req.recarregar} />
      ) : (
        <>
          <Cartao>
            <Text style={styles.secaoTitulo}>Enviar para a equipe</Text>
            <Text style={styles.ajuda}>
              O PDF e a imagem têm o mesmo desenho. A imagem sai em 4K
              {periodo === 'DIA' ? ' (retrato)' : ' (paisagem)'}, com os logos no
              rodapé.
            </Text>
            <Botao
              titulo="Baixar PDF"
              aoPressionar={() => void baixarPdf()}
              carregando={gerando === 'PDF'}
            />
            {podeImagem ? (
              <View style={styles.botaoSecundario}>
                <Botao
                  titulo="Baixar imagem 4K"
                  variante="secundario"
                  aoPressionar={() => void baixarImagem()}
                  carregando={gerando === 'IMAGEM'}
                />
              </View>
            ) : (
              <View style={styles.aviso}>
                <Ionicons
                  name="information-circle-outline"
                  size={18}
                  color={cores.azul}
                />
                <Text style={styles.avisoTexto}>
                  A imagem é gerada pelo navegador. Aqui no aplicativo use o PDF —
                  o desenho é o mesmo.
                </Text>
              </View>
            )}
            {/* Aviso que evita a decepção mais provável: mandar em 4K e a
                equipe receber uma imagem borrada. */}
            <View style={styles.aviso}>
              <Ionicons name="alert-circle-outline" size={18} color={cores.amarelo} />
              <Text style={styles.avisoTexto}>
                No WhatsApp, envie como <Text style={styles.negrito}>documento</Text>{' '}
                (ou mande o PDF): enviada como foto, a imagem é recomprimida e
                perde a nitidez.
              </Text>
            </View>
          </Cartao>

          {periodo === 'DIA' && dia.dados ? (
            <PreviaDia escala={dia.dados} />
          ) : null}
          {periodo === 'SEMANA' && semana.dados ? (
            <PreviaSemana escala={semana.dados} />
          ) : null}
        </>
      )}
    </Tela>
  );
}

/** Prévia da escala do dia: as mesmas seções e horários do documento. */
function PreviaDia({
  escala,
}: {
  escala: EscalaDiaPublicada;
}): React.ReactElement {
  const t = escala.totais;
  return (
    <>
      <Cartao>
        <Text style={styles.diaTitulo}>{formatarData(escala.dataISO)}</Text>
        <View style={styles.selos}>
          {escala.ehFeriado ? (
            <Selo
              texto={
                escala.nomeFeriado ? `Feriado · ${escala.nomeFeriado}` : 'Feriado'
              }
              cor={cores.vermelho}
              fundo={cores.vermelhoFundo}
            />
          ) : null}
          {escala.diaSemana === 0 && escala.grupoFolgaDomingo ? (
            <Selo
              texto={`Domingo · folga ${escala.grupoFolgaDomingo}`}
              cor={cores.azul}
              fundo={cores.azulFundo}
            />
          ) : null}
        </View>
        <Text style={styles.resumo}>
          {t.trabalhando} trabalhando · {t.folgas} de folga
          {t.faltas > 0 ? ` · ${t.faltas} falta(s)` : ''}
          {t.atestados > 0 ? ` · ${t.atestados} atestado(s)` : ''}
          {t.ferias > 0 ? ` · ${t.ferias} de férias` : ''}
        </Text>
      </Cartao>

      {escala.secoes.map((secao) => (
        <Cartao key={secao.funcao}>
          <Text style={styles.secaoTitulo}>
            {TITULO_FUNCAO[secao.funcao] ?? secao.funcao}
          </Text>
          {secao.linhas.map((linha) => (
            <LinhaPrevia key={linha.colaboradorId} linha={linha} />
          ))}
        </Cartao>
      ))}
    </>
  );
}

/** Uma pessoa na prévia do dia. */
function LinhaPrevia({ linha }: { linha: LinhaEscala }): React.ReactElement {
  const ap = aparencia(linha.status);
  const horario =
    linha.entrada && linha.saida ? `${linha.entrada} – ${linha.saida}` : null;
  return (
    <View style={styles.linha}>
      <View style={styles.linhaEsq}>
        <Text style={styles.linhaNome} numberOfLines={1}>
          {linha.nome}
        </Text>
        {linha.horarioEspecial ? (
          <Text style={styles.linhaSub}>Horário especial</Text>
        ) : null}
      </View>
      {linha.status === 'TRABALHA' ? (
        <Text style={styles.linhaHora}>{horario ?? '—'}</Text>
      ) : (
        <View style={styles.linhaDir}>
          <Text style={[styles.linhaEstado, { color: ap.cor }]}>{ap.rotulo}</Text>
          {horario ? <Text style={styles.linhaSub}>{horario}</Text> : null}
        </View>
      )}
    </View>
  );
}

/** Prévia da semana: uma linha por pessoa com os sete dias resumidos. */
function PreviaSemana({
  escala,
}: {
  escala: EscalaSemanaPublicada;
}): React.ReactElement {
  return (
    <>
      {escala.secoes.map((secao) => (
        <Cartao key={secao.funcao}>
          <Text style={styles.secaoTitulo}>
            {TITULO_FUNCAO[secao.funcao] ?? secao.funcao}
          </Text>
          {secao.pessoas.map((pessoa) => (
            <View key={pessoa.colaboradorId} style={styles.semanaPessoa}>
              <Text style={styles.linhaNome} numberOfLines={1}>
                {pessoa.nome}
              </Text>
              <View style={styles.semanaDias}>
                {pessoa.celulas.map((celula, i) => {
                  const ap = aparencia(celula.status);
                  return (
                    <View key={escala.dias[i].dataISO} style={styles.semanaCelula}>
                      <Text
                        style={[
                          styles.semanaDia,
                          escala.dias[i].ehFeriado && styles.semanaDiaFeriado,
                        ]}
                      >
                        {DIAS_CURTOS[escala.dias[i].diaSemana]}
                      </Text>
                      <Text
                        style={[
                          styles.semanaValor,
                          celula.status !== 'TRABALHA' && { color: ap.cor },
                        ]}
                      >
                        {celula.status === 'TRABALHA'
                          ? (celula.entrada ?? '—')
                          : ap.rotulo}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </Cartao>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  seletor: { marginTop: espacamento.md },
  periodoTexto: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
  },
  secaoTitulo: {
    ...tipografia.rotulo,
    fontWeight: '700',
    color: cores.texto,
    marginBottom: espacamento.sm,
  },
  ajuda: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.md,
  },
  botaoSecundario: { marginTop: espacamento.sm },
  aviso: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacamento.xs,
    marginTop: espacamento.md,
    padding: espacamento.sm,
    borderRadius: raio.sm,
    backgroundColor: cores.superficieAlternativa,
  },
  avisoTexto: { ...tipografia.legenda, color: cores.texto, flex: 1 },
  negrito: { fontWeight: '700' },
  diaTitulo: { ...tipografia.subtitulo, color: cores.texto },
  selos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.xs,
    marginTop: espacamento.xs,
  },
  resumo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    paddingVertical: espacamento.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
  },
  linhaEsq: { flex: 1 },
  linhaDir: { alignItems: 'flex-end' },
  linhaNome: { ...tipografia.corpo, color: cores.texto, fontWeight: '600' },
  linhaSub: { ...tipografia.legenda, color: cores.textoSecundario },
  linhaHora: { ...tipografia.corpo, color: cores.texto, fontWeight: '700' },
  linhaEstado: { ...tipografia.corpo, fontWeight: '700' },
  semanaPessoa: {
    paddingVertical: espacamento.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
  },
  semanaDias: {
    flexDirection: 'row',
    marginTop: espacamento.xs,
  },
  semanaCelula: { flex: 1, alignItems: 'center' },
  semanaDia: { ...tipografia.legenda, color: cores.textoSecundario },
  semanaDiaFeriado: { color: cores.vermelho, fontWeight: '700' },
  semanaValor: {
    ...tipografia.legenda,
    color: cores.texto,
    fontWeight: '600',
  },
});

export default EscalaScreen;
