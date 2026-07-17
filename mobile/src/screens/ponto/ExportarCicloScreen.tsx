/**
 * Exportação do ciclo (26→25) para revisão antes do fechamento (uso gerencial —
 * CENTRAL_JORNADA). Mostra os totais do time e uma prévia das linhas (jornadas,
 * extras, débitos, atestados, TAC e inconsistências) e permite compartilhar o
 * relatório em CSV (para planilha/folha) pela folha de compartilhamento do
 * aparelho.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { centralJornadaService } from '../../api/services';
import {
  CentralExportacao,
  LinhaExportacaoCiclo,
} from '../../api/services/centralJornada';
import {
  Botao,
  Cartao,
  Carregando,
  EstadoVazio,
  MensagemErro,
  Selo,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { formatarDuracao } from '../../utils/formato';
import { notificar } from '../../utils/dialogos';
import { cores, espacamento, tipografia } from '../../theme';

const AZUL = '#2563EB';
const VERMELHO = cores.erro ?? '#DC2626';
const AMARELO = cores.amarelo ?? '#C99700';
const NOMES_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MAX_PREVIA = 20;

function dataCurta(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${NOMES_SEMANA[d.getUTCDay()]} ${dd}/${mm}`;
}

function rotuloTipo(tipo: LinhaExportacaoCiclo['tipo']): string {
  switch (tipo) {
    case 'FALTA':
      return 'Falta';
    case 'FALTA_DEBITO':
      return 'Falta (débito)';
    case 'ATESTADO':
      return 'Atestado';
    case 'INCOMPLETO':
      return 'Incompleta';
    default:
      return 'Trabalho';
  }
}

async function compartilhar(csv: string, rotulo: string): Promise<void> {
  try {
    await Share.share({ message: csv }, { subject: `Ponto ${rotulo}` });
  } catch {
    notificar('Erro', 'Não foi possível abrir o compartilhamento.');
  }
}

export function ExportarCicloScreen(): React.ReactElement {
  const [ciclo, setCiclo] = useState(0);
  const req = useRequisicao<CentralExportacao>(
    () => centralJornadaService.exportacao(ciclo),
    [ciclo],
  );

  const dados = req.dados;
  const previa = dados?.linhas.slice(0, MAX_PREVIA) ?? [];
  const restante = (dados?.linhas.length ?? 0) - previa.length;

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
              Confira os números antes de fechar o ciclo. O relatório completo
              vai no CSV.
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
            <View style={styles.botaoExportar}>
              <Botao
                titulo="Compartilhar CSV"
                aoPressionar={() =>
                  void compartilhar(dados.csv, dados.periodo.rotulo)
                }
              />
            </View>
          </Cartao>

          {/* Prévia das linhas do relatório */}
          {previa.length === 0 ? (
            <EstadoVazio
              icone="document-text-outline"
              titulo="Sem movimento no ciclo"
              descricao="Não há jornadas, faltas ou atestados para exportar."
            />
          ) : (
            <Cartao>
              <Text style={styles.secaoTitulo}>
                Prévia ({dados.linhas.length} linha
                {dados.linhas.length === 1 ? '' : 's'})
              </Text>
              {previa.map((l, i) => (
                <View key={`${l.colaboradorId}-${l.data}-${i}`} style={styles.linha}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linhaNome} numberOfLines={1}>
                      {l.nome}
                    </Text>
                    <Text style={styles.linhaSub}>
                      {dataCurta(l.data)} • {rotuloTipo(l.tipo)}
                      {l.trabalhadoMs > 0
                        ? ` • ${formatarDuracao(l.trabalhadoMs)}`
                        : ''}
                    </Text>
                    {l.problemas.length > 0 ? (
                      <Text style={styles.linhaProblema}>
                        {l.problemas.join(' • ')}
                      </Text>
                    ) : null}
                  </View>
                  {l.tac ? (
                    <Selo texto="TAC" cor={AMARELO} fundo="#FBF3DA" />
                  ) : null}
                </View>
              ))}
              {restante > 0 ? (
                <Text style={styles.maisLinhas}>
                  + {restante} linha{restante === 1 ? '' : 's'} no CSV completo.
                </Text>
              ) : null}
            </Cartao>
          )}
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
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    paddingVertical: espacamento.sm,
    borderTopWidth: 1,
    borderTopColor: cores.divisor,
  },
  linhaNome: { ...tipografia.rotulo, color: cores.texto, fontWeight: '600' },
  linhaSub: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  linhaProblema: { ...tipografia.legenda, color: AMARELO, marginTop: 2 },
  maisLinhas: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
    fontStyle: 'italic',
  },
});
