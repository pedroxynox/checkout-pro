/**
 * Revisão e fechamento do ciclo (26→25) — uso gerencial (CENTRAL_JORNADA).
 * Mostra os totais do time e uma prévia das linhas (jornadas, extras, débitos,
 * atestados, TAC e inconsistências) para revisar antes de fechar, e permite
 * fechar/reabrir o ciclo.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { centralJornadaService, cicloFolhaService } from '../../api/services';
import { CentralExportacao } from '../../api/services/centralJornada';
import { EstadoCicloFolha } from '../../api/services/cicloFolha';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import {
  Botao,
  Cartao,
  Carregando,
  MensagemErro,
  Selo,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { formatarDuracao } from '../../utils/formato';
import { confirmar, notificar } from '../../utils/dialogos';
import { cores, espacamento, tipografia } from '../../theme';

const AZUL = '#2563EB';
const VERMELHO = cores.erro ?? '#DC2626';
const AMARELO = cores.amarelo ?? '#C99700';
const VERDE = cores.sucesso ?? '#1E9E5A';

export function ExportarCicloScreen(): React.ReactElement {
  const [ciclo, setCiclo] = useState(0);
  const req = useRequisicao<CentralExportacao>(
    () => centralJornadaService.exportacao(ciclo),
    [ciclo],
  );

  const { podeAcessar } = useAuth();
  const statusReq = useRequisicao<EstadoCicloFolha>(
    () => cicloFolhaService.status(ciclo),
    [ciclo],
  );

  const dados = req.dados;
  const cicloStatus = statusReq.dados;
  const podeFechar = podeAcessar('CENTRAL_JORNADA');
  const podeReabrir = podeAcessar('ADMIN_DADOS');

  async function fecharCiclo(): Promise<void> {
    const ok = await confirmar(
      'Fechar ciclo',
      `Fechar o ciclo ${cicloStatus?.periodo.rotulo ?? ''}? Depois de fechado, as batidas e faltas do período ficam bloqueadas para edição.`,
      'Fechar',
    );
    if (!ok) return;
    try {
      await cicloFolhaService.fechar(ciclo);
      statusReq.recarregar();
      notificar(
        'Ciclo fechado',
        'O ciclo foi fechado. As alterações ficam bloqueadas até uma reabertura autorizada.',
      );
    } catch (e) {
      notificar(
        'Erro',
        e instanceof ApiError ? e.message : 'Não foi possível fechar o ciclo.',
      );
    }
  }

  async function reabrirCiclo(): Promise<void> {
    const ok = await confirmar(
      'Reabrir ciclo',
      `Reabrir o ciclo ${cicloStatus?.periodo.rotulo ?? ''}? Isso libera novamente as edições do período.`,
      'Reabrir',
    );
    if (!ok) return;
    try {
      await cicloFolhaService.reabrir(ciclo);
      statusReq.recarregar();
      notificar(
        'Ciclo reaberto',
        'O ciclo foi reaberto. As edições do período estão liberadas.',
      );
    } catch (e) {
      notificar(
        'Erro',
        e instanceof ApiError ? e.message : 'Não foi possível reabrir o ciclo.',
      );
    }
  }

  return (
    <Tela aoAtualizar={req.recarregar} atualizando={req.atualizando}>
      {/* Seletor de ciclo (26→25) */}
      <Cartao style={styles.cardCiclo}>
        <Pressable
          onPress={() => setCiclo((c) => c - 1)}
          style={styles.setaBtn}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={22} color={cores.primaria} />
        </Pressable>
        <View style={styles.cicloCentro}>
          <Text style={styles.cicloLabel}>Ciclo de folha</Text>
          <Text style={styles.cicloRotulo}>{dados?.periodo.rotulo ?? '—'}</Text>
        </View>
        <Pressable
          onPress={() => setCiclo((c) => Math.min(0, c + 1))}
          style={[styles.setaBtn, ciclo >= 0 && styles.setaDesabilitada]}
          disabled={ciclo >= 0}
          hitSlop={10}
        >
          <Ionicons
            name="chevron-forward"
            size={22}
            color={ciclo >= 0 ? cores.textoSecundario : cores.primaria}
          />
        </Pressable>
      </Cartao>

      {req.carregando ? (
        <Carregando />
      ) : req.erro ? (
        <MensagemErro mensagem={req.erro} aoTentarNovamente={req.recarregar} />
      ) : dados ? (
        <>
          {/* Totais para revisão antes de fechar o ciclo */}
          <Cartao>
            <Text style={styles.secaoTitulo}>Revisão do ciclo</Text>
            <Text style={styles.revisaoNota}>
              Confira os números abaixo antes de fechar o ciclo.
            </Text>
            <View style={styles.chips}>
              <Selo texto={`Extras 50% ${formatarDuracao(dados.totais.extras50Ms)}`} cor={AZUL} fundo="#EFF6FF" />
              <Selo texto={`Extras 100% ${formatarDuracao(dados.totais.extras100Ms)}`} cor={AZUL} fundo="#EFF6FF" />
              <Selo texto={`Deve ${formatarDuracao(dados.totais.horasDevidasMs)}`} cor={VERMELHO} fundo="#FEECEC" />
              <Selo texto={`Atestado ${formatarDuracao(dados.totais.horasAtestadoMs)}`} cor={cores.texto} fundo={cores.fundo} />
              <Selo texto={`Faltas ${dados.totais.faltas}`} cor={VERMELHO} fundo="#FEECEC" />
              <Selo texto={`TAC ${dados.totais.diasTac}`} cor={AMARELO} fundo="#FBF3DA" />
              <Selo texto={`Inconsistências ${dados.totais.inconsistencias}`} cor={AMARELO} fundo="#FBF3DA" />
            </View>
          </Cartao>

          {/* Fechamento do ciclo: bloqueia edições depois de revisado */}
          {cicloStatus ? (
            <Cartao>
              <View style={styles.statusTopo}>
                <Text style={styles.secaoTitulo}>Fechamento do ciclo</Text>
                <Selo
                  texto={cicloStatus.status === 'FECHADO' ? 'Fechado' : 'Aberto'}
                  cor={cicloStatus.status === 'FECHADO' ? VERMELHO : VERDE}
                  fundo={cicloStatus.status === 'FECHADO' ? '#FEECEC' : '#E7F6EE'}
                />
              </View>
              {cicloStatus.status === 'FECHADO' ? (
                <>
                  <Text style={styles.statusInfo}>
                    Fechado
                    {cicloStatus.fechadoPorNome
                      ? ` por ${cicloStatus.fechadoPorNome}`
                      : ''}
                    . As batidas e faltas do período estão bloqueadas para
                    edição.
                  </Text>
                  {podeReabrir ? (
                    <View style={styles.botaoExportar}>
                      <Botao
                        titulo="Reabrir ciclo"
                        variante="secundario"
                        aoPressionar={() => void reabrirCiclo()}
                      />
                    </View>
                  ) : (
                    <Text style={styles.statusInfo}>
                      A reabertura exige autorização de administrador.
                    </Text>
                  )}
                </>
              ) : (
                <>
                  <Text style={styles.statusInfo}>
                    O ciclo está aberto. Feche-o após revisar para bloquear
                    alterações do período.
                  </Text>
                  {podeFechar ? (
                    <View style={styles.botaoExportar}>
                      <Botao
                        titulo="Fechar ciclo"
                        aoPressionar={() => void fecharCiclo()}
                      />
                    </View>
                  ) : null}
                </>
              )}
            </Cartao>
          ) : null}

        </>
      ) : null}
    </Tela>
  );
}

const styles = StyleSheet.create({
  cardCiclo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  setaBtn: { padding: espacamento.xs },
  setaDesabilitada: { opacity: 0.4 },
  cicloCentro: { alignItems: 'center', flex: 1 },
  cicloLabel: { ...tipografia.legenda, color: cores.textoSecundario },
  cicloRotulo: { ...tipografia.rotulo, color: cores.texto, fontWeight: '700' },
  secaoTitulo: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
    marginBottom: espacamento.xs,
  },
  revisaoNota: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.xs,
  },
  botaoExportar: { marginTop: espacamento.md },
  statusTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: espacamento.xs,
  },
  statusInfo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.xs,
  },
});
