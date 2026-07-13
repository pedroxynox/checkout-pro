/**
 * Painel de configuração do rodízio de domingo (Centro de Controle).
 *
 * O domingo funciona por rodízio de 3 grupos (G1/G2/G3): a cada domingo um
 * grupo folga e os outros dois trabalham. Aqui o gestor define o "ponto de
 * partida": um domingo de referência e qual grupo folga nele. A partir disso o
 * sistema calcula sozinho a rotação. A prévia dos próximos domingos ajuda a
 * conferir se bate com a realidade.
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

const GRUPOS: ('G1' | 'G2' | 'G3')[] = ['G1', 'G2', 'G3'];

/** Os dois grupos que trabalham quando `folga` está de folga. */
function gruposQueTrabalham(folga: string): string {
  return GRUPOS.filter((g) => g !== folga).join(' e ');
}

/** "dd/mm" a partir de um ISO yyyy-mm-dd (para a prévia compacta). */
function diaMes(iso: string): string {
  const br = isoParaDataBR(iso);
  return br ? br.slice(0, 5) : iso;
}

export function ConfigEscalaDomingoScreen(): React.ReactElement {
  const req = useRequisicao<EscalaDomingoConfig>(
    () => configSistemaService.obterEscalaDomingo(),
    [],
  );

  const [dataBR, setDataBR] = useState('');
  const [grupo, setGrupo] = useState<'G1' | 'G2' | 'G3' | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Pré-preenche com a âncora atual (se já configurada).
  useEffect(() => {
    const cfg = req.dados;
    if (!cfg) return;
    if (cfg.ancoraData) setDataBR(isoParaDataBR(cfg.ancoraData));
    if (cfg.ancoraGrupo) setGrupo(cfg.ancoraGrupo);
  }, [req.dados]);

  const salvar = async (): Promise<void> => {
    const iso = dataBRParaISO(dataBR.trim());
    if (!iso) {
      notificar('Data inválida', 'Use o formato dd/mm/aaaa (ex.: 19/07/2026).');
      return;
    }
    // Precisa ser domingo.
    if (new Date(`${iso}T00:00:00.000Z`).getUTCDay() !== 0) {
      notificar(
        'Precisa ser um domingo',
        'A data de referência deve cair num domingo. Escolha um domingo.',
      );
      return;
    }
    if (!grupo) {
      notificar('Escolha o grupo', 'Selecione qual grupo folga nesse domingo.');
      return;
    }
    setSalvando(true);
    try {
      await configSistemaService.definirEscalaDomingo(iso, grupo);
      req.recarregar();
      notificar(
        'Rodízio salvo',
        'O ponto de partida foi definido. A prévia mostra os próximos domingos.',
      );
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
        domingo um grupo folga e os outros dois trabalham. Defina abaixo um
        domingo de referência e qual grupo folga nele — o resto é calculado
        automaticamente.
      </Text>

      <Cartao titulo="Ponto de partida">
        <CampoTexto
          rotulo="Domingo de referência"
          value={dataBR}
          onChangeText={(t) => setDataBR(mascaraDataBR(t))}
          placeholder="dd/mm/aaaa (ex.: 19/07/2026)"
          keyboardType="number-pad"
          maxLength={10}
        />

        <Text style={styles.rotulo}>Grupo que folga nesse domingo</Text>
        <View style={styles.chips}>
          {GRUPOS.map((g) => (
            <Text
              key={g}
              onPress={() => setGrupo(g)}
              style={[styles.chip, grupo === g && styles.chipAtivo]}
            >
              {g}
            </Text>
          ))}
        </View>

        <Botao titulo="Salvar ponto de partida" aoPressionar={salvar} carregando={salvando} />
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
          Ainda sem ponto de partida definido. Preencha acima para ver a prévia.
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
  rotulo: {
    ...tipografia.rotulo,
    color: cores.texto,
    marginTop: espacamento.sm,
    marginBottom: espacamento.xs,
  },
  chips: {
    flexDirection: 'row',
    gap: espacamento.sm,
    marginBottom: espacamento.md,
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
