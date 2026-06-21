/**
 * Log de jornada da equipe de fiscais (uso gerencial — funcionalidade
 * FISCAIS_JORNADA). Mostra, por fiscal, o tempo trabalhando, o tempo de
 * intervalo e a carga horária do dia com cores de status.
 *
 * Os fiscais veem apenas as próprias horas (na tela de Fiscais); aqui é a
 * visão consolidada de toda a equipe para gestores.
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fiscaisService } from '../../api/services';
import { ItemJornadaFiscal, StatusFiscal } from '../../api/types';
import {
  Carregando,
  Cartao,
  EstadoVazio,
  MensagemErro,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { formatarDuracao } from '../../utils/formato';
import { ROTULO_STATUS_FISCAL } from '../../utils/rotulos';
import { cores, espacamento, raio, tipografia } from '../../theme';

const VERDE = cores.sucesso ?? '#1E9E5A';
const AMARELO = cores.amarelo ?? '#C99700';
const CINZA = cores.textoSecundario;

function corStatus(status: StatusFiscal): string {
  if (status === 'DISPONIVEL') return VERDE;
  if (status === 'INTERVALO') return AMARELO;
  return CINZA;
}

function corFundoStatus(status: StatusFiscal): string {
  if (status === 'DISPONIVEL') return cores.verdeFundo ?? '#E4F6EC';
  if (status === 'INTERVALO') return cores.amareloFundo ?? '#FBF3DA';
  return cores.fundo;
}

function iconeStatus(status: StatusFiscal): keyof typeof Ionicons.glyphMap {
  if (status === 'DISPONIVEL') return 'checkmark-circle';
  if (status === 'INTERVALO') return 'cafe';
  return 'exit-outline';
}

export function JornadaFiscaisScreen(): React.ReactElement {
  const jornada = useRequisicao<ItemJornadaFiscal[]>(
    () => fiscaisService.jornada(),
    [],
  );

  return (
    <Tela aoAtualizar={jornada.recarregar} atualizando={jornada.atualizando}>
      <Text style={styles.titulo}>Jornada de hoje</Text>
      {jornada.carregando ? (
        <Carregando />
      ) : jornada.erro ? (
        <MensagemErro
          mensagem={jornada.erro}
          aoTentarNovamente={jornada.recarregar}
        />
      ) : !jornada.dados || jornada.dados.length === 0 ? (
        <EstadoVazio
          icone="time-outline"
          titulo="Sem registros"
          descricao="Ainda não há ponto registrado hoje."
        />
      ) : (
        jornada.dados.map((f) => (
          <Cartao key={f.fiscalId} style={styles.cartaoFiscal}>
            {/* Borda lateral colorida */}
            <View style={[styles.bordaLateral, { backgroundColor: corStatus(f.status) }]} />

            {/* Cabeçalho: ícone + nome + badge status */}
            <View style={styles.topo}>
              <View style={[styles.iconeContainer, { backgroundColor: corFundoStatus(f.status) }]}>
                <Ionicons
                  name={iconeStatus(f.status)}
                  size={18}
                  color={corStatus(f.status)}
                />
              </View>
              <Text style={styles.nome}>{f.primeiroNome}</Text>
              <View style={[styles.badgeStatus, { backgroundColor: corFundoStatus(f.status) }]}>
                <View style={[styles.pontinho, { backgroundColor: corStatus(f.status) }]} />
                <Text style={[styles.statusTexto, { color: corStatus(f.status) }]}>
                  {ROTULO_STATUS_FISCAL[f.status]}
                </Text>
              </View>
            </View>

            {/* Tempos */}
            <View style={styles.tempos}>
              <Item rotulo="Trabalhando" valor={formatarDuracao(f.tempoTrabalhandoMs)} cor={VERDE} />
              <Item rotulo="Intervalo" valor={formatarDuracao(f.tempoIntervaloMs)} cor={AMARELO} />
              <Item rotulo="Carga" valor={formatarDuracao(f.cargaHorariaMs)} cor={cores.texto} />
            </View>
          </Cartao>
        ))
      )}
    </Tela>
  );
}

function Item({
  rotulo,
  valor,
  cor,
}: {
  rotulo: string;
  valor: string;
  cor: string;
}): React.ReactElement {
  return (
    <View style={styles.item}>
      <Text style={[styles.itemValor, { color: cor }]}>{valor}</Text>
      <Text style={styles.itemRotulo}>{rotulo}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  titulo: {
    ...tipografia.secao,
    color: cores.texto,
    marginBottom: espacamento.md,
  },
  cartaoFiscal: {
    overflow: 'hidden',
    position: 'relative',
  },
  bordaLateral: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: raio.lg,
    borderBottomLeftRadius: raio.lg,
  },
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
  },
  iconeContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nome: {
    ...tipografia.rotulo,
    color: cores.texto,
    flex: 1,
  },
  badgeStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    paddingHorizontal: espacamento.sm,
    paddingVertical: 4,
    borderRadius: raio.pill,
  },
  pontinho: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusTexto: {
    ...tipografia.legenda,
    fontWeight: '700',
  },
  tempos: {
    flexDirection: 'row',
    gap: espacamento.sm,
    marginTop: espacamento.md,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: cores.fundo,
    borderRadius: raio.md,
    paddingVertical: espacamento.sm,
  },
  itemValor: {
    ...tipografia.rotulo,
    fontWeight: '700',
  },
  itemRotulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
});

export default JornadaFiscaisScreen;
