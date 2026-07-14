/**
 * Painel de configuração do rodízio de domingo (Centro de Controle).
 *
 * O domingo funciona por rodízio de 3 grupos (G1/G2/G3): a cada domingo um
 * grupo folga e os outros dois trabalham. A ordem do ciclo NÃO é fixa — o
 * gestor define, para os 3 domingos do ciclo (a partir de um domingo de
 * referência), qual grupo folga em cada um. Ex.: 19/07 folga G1, 26/07 folga
 * G3, 02/08 folga G2 — e o ciclo repete. A prévia mostra os próximos domingos.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { configSistemaService, EscalaDomingoConfig } from '../../api/services';
import {
  Botao,
  Carregando,
  CampoTexto,
  Cartao,
  MensagemErro,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { notificar } from '../../utils/dialogos';
import { dataBRParaISO, isoParaDataBR, mascaraDataBR } from '../../utils/formato';

type Grupo = 'G1' | 'G2' | 'G3';
const GRUPOS: Grupo[] = ['G1', 'G2', 'G3'];

/** Os dois grupos que trabalham quando `folga` está de folga. */
function gruposQueTrabalham(folga: string): string {
  return GRUPOS.filter((g) => g !== folga).join(' e ');
}

/** "dd/mm" a partir de um ISO yyyy-mm-dd. */
function diaMes(iso: string): string {
  const br = isoParaDataBR(iso);
  return br ? br.slice(0, 5) : iso;
}

/** Soma `dias` a um ISO yyyy-mm-dd (UTC) e devolve dd/mm. */
function isoMaisDiasDiaMes(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + dias);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(
    d.getUTCMonth() + 1,
  ).padStart(2, '0')}`;
}

export function ConfigEscalaDomingoScreen(): React.ReactElement {
  const req = useRequisicao<EscalaDomingoConfig>(
    () => configSistemaService.obterEscalaDomingo(),
    [],
  );

  const [dataBR, setDataBR] = useState('');
  // Quem folga em cada um dos 3 domingos do ciclo (índices 0,1,2).
  const [ordem, setOrdem] = useState<(Grupo | null)[]>([null, null, null]);
  const [salvando, setSalvando] = useState(false);

  // Pré-preenche com a configuração atual (se já existir).
  useEffect(() => {
    const cfg = req.dados;
    if (!cfg) return;
    if (cfg.ancoraData) setDataBR(isoParaDataBR(cfg.ancoraData));
    if (cfg.ordem && cfg.ordem.length === 3) setOrdem([...cfg.ordem]);
  }, [req.dados]);

  const isoRef = dataBRParaISO(dataBR.trim());

  const salvar = async (): Promise<void> => {
    if (!isoRef) {
      notificar('Data inválida', 'Use o formato dd/mm/aaaa (ex.: 19/07/2026).');
      return;
    }
    if (new Date(`${isoRef}T00:00:00.000Z`).getUTCDay() !== 0) {
      notificar(
        'Precisa ser um domingo',
        'O 1º domingo do ciclo deve cair num domingo.',
      );
      return;
    }
    const escolhidos = ordem.filter((g): g is Grupo => g != null);
    const semRepetir = new Set(escolhidos).size === 3;
    if (escolhidos.length !== 3 || !semRepetir) {
      notificar(
        'Complete o ciclo',
        'Escolha um grupo diferente (G1, G2 e G3) para cada um dos 3 domingos.',
      );
      return;
    }
    setSalvando(true);
    try {
      await configSistemaService.definirEscalaDomingo(isoRef, escolhidos);
      req.recarregar();
      notificar('Rodízio salvo', 'A ordem do ciclo foi definida. Confira a prévia.');
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const proximos = req.dados?.proximos ?? [];

  return (
    <Tela aoAtualizar={req.recarregar} atualizando={req.atualizando}>
      <Text style={styles.intro}>
        No domingo os colaboradores giram em 3 grupos (G1, G2 e G3): a cada
        domingo um grupo folga e os outros dois trabalham. Defina o 1º domingo
        do ciclo e quem folga em cada um dos 3 domingos — a ordem repete a partir
        daí.
      </Text>

      <Cartao titulo="Ciclo de domingo">
        <CampoTexto
          rotulo="1º domingo do ciclo"
          value={dataBR}
          onChangeText={(t) => setDataBR(mascaraDataBR(t))}
          placeholder="dd/mm/aaaa (ex.: 19/07/2026)"
          keyboardType="number-pad"
          maxLength={10}
        />

        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.linhaCiclo}>
            <View style={styles.linhaCicloTopo}>
              <Text style={styles.linhaCicloRotulo}>
                {i + 1}º domingo{isoRef ? ` · ${isoMaisDiasDiaMes(isoRef, i * 7)}` : ''}
              </Text>
              <Text style={styles.linhaCicloAjuda}>folga</Text>
            </View>
            <View style={styles.chips}>
              {GRUPOS.map((g) => (
                <Text
                  key={g}
                  onPress={() =>
                    setOrdem((prev) => {
                      const novo = [...prev];
                      novo[i] = novo[i] === g ? null : g;
                      return novo;
                    })
                  }
                  style={[styles.chip, ordem[i] === g && styles.chipAtivo]}
                >
                  {g}
                </Text>
              ))}
            </View>
          </View>
        ))}

        <Botao titulo="Salvar rodízio" aoPressionar={salvar} carregando={salvando} />
      </Cartao>

      {req.carregando ? (
        <Carregando />
      ) : req.erro ? (
        <MensagemErro mensagem={req.erro} aoTentarNovamente={req.recarregar} />
      ) : proximos.length > 0 ? (
        <Cartao titulo="Próximos domingos">
          {proximos.map((d) => (
            <View key={d.data} style={styles.linhaPreview}>
              <View style={styles.dataBox}>
                <Ionicons name="calendar-outline" size={16} color={cores.primaria} />
                <Text style={styles.dataTexto}>{diaMes(d.data)}</Text>
              </View>
              <Text style={styles.previewTexto}>
                Folga <Text style={styles.folgaGrupo}>{d.grupoFolga}</Text>
                {'  ·  '}
                Trabalham {gruposQueTrabalham(d.grupoFolga)}
              </Text>
            </View>
          ))}
        </Cartao>
      ) : (
        <Text style={styles.semAncora}>
          Ainda sem ciclo definido. Preencha acima para ver a prévia.
        </Text>
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  intro: {
    ...tipografia.corpo,
    color: cores.textoSecundario,
    marginBottom: espacamento.md,
  },
  linhaCiclo: {
    marginTop: espacamento.sm,
    marginBottom: espacamento.xs,
  },
  linhaCicloTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: espacamento.xs,
  },
  linhaCicloRotulo: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
  },
  linhaCicloAjuda: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  chips: {
    flexDirection: 'row',
    gap: espacamento.sm,
    marginBottom: espacamento.sm,
  },
  chip: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    paddingVertical: espacamento.sm,
    paddingHorizontal: espacamento.lg,
    borderRadius: raio.md,
    borderWidth: 1,
    borderColor: cores.borda,
    overflow: 'hidden',
  },
  chipAtivo: {
    backgroundColor: cores.primaria,
    color: cores.textoInverso,
    borderColor: cores.primaria,
  },
  linhaPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.md,
    paddingVertical: espacamento.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
  },
  dataBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    minWidth: 64,
  },
  dataTexto: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
  },
  previewTexto: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    flex: 1,
  },
  folgaGrupo: {
    color: cores.texto,
    fontWeight: '700',
  },
  semAncora: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    textAlign: 'center',
    marginTop: espacamento.md,
  },
});

export default ConfigEscalaDomingoScreen;
