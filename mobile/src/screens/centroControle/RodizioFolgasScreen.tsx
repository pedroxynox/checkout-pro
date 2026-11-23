/**
 * Rodízio de folgas do 5x2 (Centro de Controle, spec `jornada-5x2`, Fase 3).
 *
 * Cada grupo (G1/G2/G3) folga 2 dias por semana, e os dias mudam a cada semana
 * de um ciclo que começa numa segunda-feira e se repete. A tela edita a tabela
 * grupo × semana, confere avisos e prévia no backend (`simular`, sem gravar) e
 * salva a vigência. Substitui no Centro de Controle a tela do rodízio de
 * domingo, que continua valendo só para os dias do 6x1.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import {
  rodizioFolgasService,
  type AvisoRodizio,
  type PadraoRodizio,
  type RodizioFolgasConfig,
  type RodizioFolgasVigencia,
  type SemanaPreviaRodizio,
} from '../../api/services';
import {
  Aviso,
  Botao,
  CampoTexto,
  Cartao,
  Carregando,
  MensagemErro,
  Selo,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { confirmar, notificar } from '../../utils/dialogos';
import {
  dataBRParaISO,
  isoParaDataBR,
  mascaraDataBR,
} from '../../utils/formato';
import {
  GRUPOS_RODIZIO,
  MAX_SEMANAS,
  NOME_CURTO_DIA,
  PADRAO_5X2,
  SABADO,
  SEMANA_SEG_DOM,
  alternarFolga,
  comSemanas,
  copiarPadrao,
  pendenciasDoRodizio,
  textoFolgas,
} from '../../utils/rodizioFolgas';

/** Início da vigência semeada (decisão 5): usado quando ainda não há nenhuma. */
const INICIO_PADRAO = '2026-11-23';

/** "dd/mm" a partir de yyyy-mm-dd. */
function diaMes(iso: string): string {
  return isoParaDataBR(iso).slice(0, 5);
}

export function RodizioFolgasScreen(): React.ReactElement {
  const req = useRequisicao<RodizioFolgasConfig>(
    () => rodizioFolgasService.obter(),
    [],
  );

  // Vigência em edição (a data de início), ou null para uma nova.
  const [editando, setEditando] = useState<string | null>(null);
  const [dataBR, setDataBR] = useState('');
  const [padrao, setPadrao] = useState<PadraoRodizio>(copiarPadrao(PADRAO_5X2));
  const [conferido, setConferido] = useState<{
    avisos: AvisoRodizio[];
    previa: SemanaPreviaRodizio[];
  } | null>(null);
  const [ocupado, setOcupado] = useState<'conferir' | 'salvar' | null>(null);
  const [iniciado, setIniciado] = useState(false);

  const abrir = (v: RodizioFolgasVigencia): void => {
    setEditando(v.vigenteDesde);
    setDataBR(isoParaDataBR(v.vigenteDesde));
    setPadrao(copiarPadrao(v.padrao));
    setConferido(null);
  };

  const nova = (): void => {
    const lista = req.dados?.vigencias ?? [];
    const base = req.dados?.vigente ?? lista[lista.length - 1];
    setEditando(null);
    setDataBR('');
    setPadrao(copiarPadrao(base?.padrao ?? PADRAO_5X2));
    setConferido(null);
  };

  // Na primeira carga, abre a vigência em vigor (ou a última, ou a da decisão 5).
  useEffect(() => {
    const cfg = req.dados;
    if (!cfg || iniciado) return;
    setIniciado(true);
    const inicial =
      cfg.vigente ?? cfg.vigencias[cfg.vigencias.length - 1] ?? null;
    if (inicial) {
      setEditando(inicial.vigenteDesde);
      setDataBR(isoParaDataBR(inicial.vigenteDesde));
      setPadrao(copiarPadrao(inicial.padrao));
    } else {
      setDataBR(isoParaDataBR(INICIO_PADRAO));
    }
  }, [req.dados, iniciado]);

  const inicioISO = dataBRParaISO(dataBR.trim());
  const semanas = padrao.G1.length;
  const pendencias = pendenciasDoRodizio(inicioISO, padrao);

  const mudar = (novo: PadraoRodizio): void => {
    setPadrao(novo);
    setConferido(null);
  };

  const entrada = () => ({
    vigenteDesde: inicioISO ?? '',
    semanasNoCiclo: semanas,
    padrao,
  });

  const conferir = async (): Promise<void> => {
    if (pendencias.length > 0) {
      notificar('Falta completar', pendencias.join('\n'));
      return;
    }
    setOcupado('conferir');
    try {
      const r = await rodizioFolgasService.simular(entrada());
      setConferido({ avisos: r.vigencia.avisos, previa: r.previa });
    } catch (e) {
      notificar(
        'Erro',
        e instanceof ApiError ? e.message : 'Falha ao conferir.',
      );
    } finally {
      setOcupado(null);
    }
  };

  const salvar = async (): Promise<void> => {
    if (pendencias.length > 0 || !inicioISO) {
      notificar('Falta completar', pendencias.join('\n'));
      return;
    }
    const ok = await confirmar(
      'Salvar rodízio',
      `Salvar o rodízio a partir de ${isoParaDataBR(inicioISO)}? Quem tem grupo passa a folgar por esta tabela desde essa data.`,
      'Salvar',
    );
    if (!ok) return;
    setOcupado('salvar');
    try {
      await rodizioFolgasService.definir(entrada());
      setEditando(inicioISO);
      setConferido(null);
      req.recarregar();
      notificar('Rodízio salvo', 'Confira a prévia das próximas semanas.');
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao salvar.');
    } finally {
      setOcupado(null);
    }
  };

  const cfg = req.dados;
  const vigenciaAberta = cfg?.vigencias.find(
    (v) => v.vigenteDesde === editando,
  );
  // Os avisos e a prévia mostrados: os conferidos agora, ou os já gravados.
  const avisos = conferido?.avisos ?? vigenciaAberta?.avisos ?? [];
  const previa = conferido?.previa ?? cfg?.previa ?? [];

  if (req.carregando && !cfg) {
    return (
      <Tela>
        <Carregando />
      </Tela>
    );
  }
  if (req.erro && !cfg) {
    return (
      <Tela>
        <MensagemErro mensagem={req.erro} aoTentarNovamente={req.recarregar} />
      </Tela>
    );
  }

  return (
    <Tela aoAtualizar={req.recarregar} atualizando={req.atualizando}>
      <Text style={styles.intro}>
        No 5x2, cada grupo (G1, G2 e G3) folga 2 dias por semana, e os dias
        mudam a cada semana do ciclo. A semana vai de segunda a domingo, e
        ninguém de grupo folga no sábado. Quem não tem grupo folga nas folgas
        fixas da ficha.
      </Text>

      <Cartao titulo="Vigências">
        {(cfg?.vigencias ?? []).length === 0 ? (
          <Text style={styles.ajuda}>Nenhum rodízio salvo ainda.</Text>
        ) : (
          [...(cfg?.vigencias ?? [])].reverse().map((v) => (
            <View key={v.vigenteDesde} style={styles.linhaVigencia}>
              <View style={{ flex: 1 }}>
                <Text style={styles.vigenciaTitulo}>
                  A partir de {isoParaDataBR(v.vigenteDesde)}
                </Text>
                <Text style={styles.ajuda}>
                  {v.semanasNoCiclo} semana(s) no ciclo
                  {v.avisos.length > 0 ? ` · ${v.avisos.length} aviso(s)` : ''}
                </Text>
              </View>
              {cfg?.vigente?.vigenteDesde === v.vigenteDesde ? (
                <Selo
                  texto="Em vigor"
                  cor={cores.verde}
                  fundo={cores.verdeFundo}
                />
              ) : null}
              <Text style={styles.acaoLink} onPress={() => abrir(v)}>
                {editando === v.vigenteDesde ? 'Aberta' : 'Abrir'}
              </Text>
            </View>
          ))
        )}
        <Botao
          titulo="Nova vigência"
          variante="secundario"
          aoPressionar={nova}
        />
      </Cartao>

      <Cartao
        titulo={
          editando
            ? `Rodízio a partir de ${isoParaDataBR(editando)}`
            : 'Nova vigência'
        }
      >
        <CampoTexto
          rotulo="Começa na segunda-feira"
          value={dataBR}
          onChangeText={(t) => {
            setDataBR(mascaraDataBR(t));
            setConferido(null);
          }}
          placeholder="dd/mm/aaaa (ex.: 23/11/2026)"
          keyboardType="number-pad"
          maxLength={10}
        />

        <Text style={styles.secao}>Semanas no ciclo</Text>
        <View style={styles.chips}>
          {Array.from({ length: MAX_SEMANAS }, (_, i) => i + 1).map((n) => (
            <Text
              key={n}
              onPress={() => mudar(comSemanas(padrao, n))}
              style={[styles.chip, semanas === n && styles.chipAtivo]}
            >
              {n}
            </Text>
          ))}
        </View>

        {GRUPOS_RODIZIO.map((g) => (
          <View key={g} style={styles.grupo}>
            <Text style={styles.grupoTitulo}>{g}</Text>
            {padrao[g].map((dias, s) => (
              <View key={s} style={styles.linhaSemana}>
                <Text style={styles.rotuloSemana}>
                  Semana {s + 1} · {textoFolgas(dias)}
                </Text>
                <View style={styles.chips}>
                  {SEMANA_SEG_DOM.map((d) => {
                    const ativo = dias.includes(d);
                    const bloqueado = d === SABADO;
                    return (
                      <Text
                        key={d}
                        accessibilityLabel={`${g} semana ${s + 1} ${NOME_CURTO_DIA[d]}`}
                        onPress={
                          bloqueado
                            ? undefined
                            : () => mudar(alternarFolga(padrao, g, s, d))
                        }
                        style={[
                          styles.chipDia,
                          ativo && styles.chipAtivo,
                          bloqueado && styles.chipBloqueado,
                        ]}
                      >
                        {NOME_CURTO_DIA[d]}
                      </Text>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        ))}
        <Text style={styles.ajuda}>
          Marque 2 dias por semana em cada grupo. O sábado fica apagado: ninguém
          de grupo folga nele.
        </Text>

        {pendencias.length > 0 ? (
          <Text style={styles.pendencias}>{pendencias.join('\n')}</Text>
        ) : null}

        <Botao
          titulo="Conferir"
          variante="secundario"
          aoPressionar={conferir}
          carregando={ocupado === 'conferir'}
          desabilitado={ocupado != null}
        />
        <Botao
          titulo="Salvar rodízio"
          aoPressionar={salvar}
          carregando={ocupado === 'salvar'}
          desabilitado={ocupado != null}
        />
      </Cartao>

      {avisos.length > 0 ? (
        <Cartao titulo="Avisos">
          {avisos.map((a, i) => (
            <Aviso key={`${a.tipo}-${i}`} tom="alerta" texto={a.mensagem} />
          ))}
          <Text style={styles.ajuda}>Os avisos não impedem salvar.</Text>
        </Cartao>
      ) : conferido ? (
        <Aviso tom="sucesso" texto="Conferido: nenhum aviso." />
      ) : null}

      {previa.length > 0 ? (
        <Cartao titulo={conferido ? 'Prévia (não salva)' : 'Próximas semanas'}>
          {previa.map((semana) => (
            <View key={semana.inicio} style={styles.semanaPrevia}>
              <Text style={styles.semanaTitulo}>
                Semana de {diaMes(semana.inicio)}
                {semana.semanaDoCiclo != null
                  ? ` · semana ${semana.semanaDoCiclo} do ciclo`
                  : ' · antes do rodízio'}
              </Text>
              {semana.dias.map((d) => (
                <View key={d.data} style={styles.diaPrevia}>
                  <Text style={styles.diaTexto}>
                    {NOME_CURTO_DIA[d.diaSemana]} {diaMes(d.data)}
                  </Text>
                  <Text style={styles.folgaTexto}>
                    {d.grupos.length > 0
                      ? `Folga ${d.grupos.join(' e ')}${
                          d.fonte === 'DOMINGO_ANTIGO'
                            ? ' (rodízio de domingo do 6x1)'
                            : ''
                        }`
                      : d.diaSemana === SABADO && d.fonte === 'RODIZIO'
                        ? 'Todos trabalham'
                        : '—'}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </Cartao>
      ) : null}
    </Tela>
  );
}

const styles = StyleSheet.create({
  intro: {
    ...tipografia.corpo,
    color: cores.textoSecundario,
    marginBottom: espacamento.md,
  },
  ajuda: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.xs,
  },
  pendencias: {
    ...tipografia.legenda,
    color: cores.amarelo,
    marginVertical: espacamento.sm,
  },
  secao: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
    marginTop: espacamento.sm,
    marginBottom: espacamento.xs,
  },
  linhaVigencia: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    paddingVertical: espacamento.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  vigenciaTitulo: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
  },
  acaoLink: {
    ...tipografia.rotulo,
    color: cores.primaria,
    fontWeight: '600',
  },
  grupo: {
    marginTop: espacamento.md,
  },
  grupoTitulo: {
    ...tipografia.subtitulo,
    color: cores.texto,
  },
  linhaSemana: {
    marginTop: espacamento.xs,
  },
  rotuloSemana: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.xs,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.xs,
  },
  chip: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    paddingVertical: espacamento.xs,
    paddingHorizontal: espacamento.md,
    borderRadius: raio.md,
    borderWidth: 1,
    borderColor: cores.borda,
    overflow: 'hidden',
  },
  chipDia: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    paddingVertical: espacamento.xs,
    paddingHorizontal: espacamento.sm,
    borderRadius: raio.md,
    borderWidth: 1,
    borderColor: cores.borda,
    overflow: 'hidden',
    minWidth: 40,
    textAlign: 'center',
  },
  chipAtivo: {
    backgroundColor: cores.primaria,
    color: cores.textoInverso,
    borderColor: cores.primaria,
  },
  chipBloqueado: {
    opacity: 0.35,
  },
  semanaPrevia: {
    marginBottom: espacamento.md,
  },
  semanaTitulo: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
    marginBottom: espacamento.xs,
  },
  diaPrevia: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
  },
  diaTexto: {
    ...tipografia.legenda,
    color: cores.texto,
    minWidth: 72,
  },
  folgaTexto: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    flex: 1,
    textAlign: 'right',
  },
});

export default RodizioFolgasScreen;
