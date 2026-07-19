/**
 * Painel de inconsistências da jornada (uso gerencial — CENTRAL_JORNADA).
 * Reúne, por ciclo de folha (26→25), os problemas que precisam de revisão:
 * jornadas incompletas, batidas duplicadas, conflito ponto↔ausência, atraso
 * (fora da escala) e TAC.
 *
 * Para não sobrecarregar a tela, os problemas ficam AGRUPADOS POR DIA em seções
 * recolhíveis (tocar no dia expande/recolhe). A busca é apenas por pessoa.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { centralJornadaService } from '../../api/services';
import {
  CentralInconsistencias,
  InconsistenciaItem,
  TipoInconsistencia,
} from '../../api/services/centralJornada';
import {
  Cartao,
  Carregando,
  CampoTexto,
  EstadoVazio,
  MensagemErro,
  Selo,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, raio, tipografia } from '../../theme';

const VERMELHO = cores.erro ?? '#DC2626';
const AMARELO = cores.amarelo ?? '#C99700';
const NOMES_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function dataCurta(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${NOMES_SEMANA[d.getUTCDay()]} ${dd}/${mm}`;
}

function rotuloFuncao(f: string): string {
  if (f === 'FISCAL') return 'Fiscal';
  if (f === 'SUPERVISOR') return 'Supervisor';
  if (f === 'OPERADOR') return 'Operador';
  return 'Gestor';
}

/** Rótulo e cores de cada tipo de inconsistência. */
function estiloTipo(t: TipoInconsistencia): {
  rotulo: string;
  cor: string;
  fundo: string;
} {
  switch (t) {
    case 'INCOMPLETA':
      return { rotulo: 'Incompleta', cor: AMARELO, fundo: '#FBF3DA' };
    case 'DUPLICADA':
      return { rotulo: 'Duplicada', cor: VERMELHO, fundo: '#FEECEC' };
    case 'CONFLITO_AUSENCIA':
      return { rotulo: 'Conflito', cor: VERMELHO, fundo: '#FEECEC' };
    case 'ATRASO':
      return { rotulo: 'Atraso', cor: AMARELO, fundo: '#FBF3DA' };
    default:
      return { rotulo: 'TAC', cor: VERMELHO, fundo: '#FEECEC' };
  }
}

export function InconsistenciasScreen(): React.ReactElement {
  const [ciclo, setCiclo] = useState(0);
  const [busca, setBusca] = useState('');
  const [diasAbertos, setDiasAbertos] = useState<Set<string>>(new Set());

  const req = useRequisicao<CentralInconsistencias>(
    () => centralJornadaService.inconsistencias(ciclo),
    [ciclo],
  );

  // Filtra apenas por pessoa (nome) e agrupa por dia (mais recente primeiro).
  const porDia = useMemo(() => {
    const itens = req.dados?.itens ?? [];
    const alvo = busca.trim().toLowerCase();
    const filtrados = alvo
      ? itens.filter((i) => i.nome.toLowerCase().includes(alvo))
      : itens;
    const mapa = new Map<string, InconsistenciaItem[]>();
    for (const item of filtrados) {
      const arr = mapa.get(item.data) ?? [];
      arr.push(item);
      mapa.set(item.data, arr);
    }
    return [...mapa.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [req.dados, busca]);

  function alternarDia(data: string): void {
    setDiasAbertos((prev) => {
      const proximo = new Set(prev);
      if (proximo.has(data)) proximo.delete(data);
      else proximo.add(data);
      return proximo;
    });
  }

  const totais = req.dados?.totais;

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
          <Text style={styles.cicloRotulo}>
            {req.dados?.periodo.rotulo ?? '—'}
          </Text>
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
      ) : (
        <>
          {/* Resumo dos problemas do ciclo */}
          {totais && (
            <Cartao style={styles.cardResumo}>
              <Text style={styles.resumoTexto}>
                {totais.total === 0
                  ? 'Nenhuma inconsistência neste ciclo. 🎉'
                  : `${totais.total} inconsistência(s): ${totais.incompletas} incompleta(s), ${totais.duplicadas} duplicada(s), ${totais.conflitos} conflito(s), ${totais.atrasos} atraso(s), ${totais.tac} TAC.`}
              </Text>
            </Cartao>
          )}

          {/* Busca apenas por pessoa */}
          <Cartao>
            <CampoTexto
              rotulo="Buscar por pessoa"
              placeholder="Nome do colaborador…"
              value={busca}
              onChangeText={setBusca}
              autoCorrect={false}
            />
          </Cartao>

          {/* Problemas agrupados por dia (seções recolhíveis) */}
          {porDia.length === 0 ? (
            <EstadoVazio
              icone="checkmark-done-outline"
              titulo="Nada a revisar"
              descricao={
                busca.trim()
                  ? 'Nenhuma inconsistência para essa pessoa.'
                  : 'Nenhuma inconsistência neste ciclo.'
              }
            />
          ) : (
            porDia.map(([data, itens]) => {
              const aberto = diasAbertos.has(data);
              return (
                <Cartao key={data} style={styles.cardDia}>
                  <Pressable
                    onPress={() => alternarDia(data)}
                    style={styles.diaHeader}
                    accessibilityRole="button"
                  >
                    <Text style={styles.diaTitulo}>
                      {dataCurta(data)}
                      {itens[0]?.ehFeriado ? ' • Feriado' : ''}
                    </Text>
                    <View style={styles.diaBadge}>
                      <Text style={styles.diaBadgeTexto}>{itens.length}</Text>
                    </View>
                    <Ionicons
                      name={aberto ? 'chevron-up' : 'chevron-down'}
                      size={20}
                      color={cores.textoSecundario}
                    />
                  </Pressable>

                  {aberto &&
                    itens.map((item, i) => (
                      <ItemInconsistencia
                        key={`${item.colaboradorId}-${item.tipo}-${i}`}
                        item={item}
                      />
                    ))}
                </Cartao>
              );
            })
          )}
        </>
      )}
    </Tela>
  );
}

function ItemInconsistencia({
  item,
}: {
  item: InconsistenciaItem;
}): React.ReactElement {
  const est = estiloTipo(item.tipo);
  return (
    <View style={styles.itemLinha}>
      <View style={{ flex: 1 }}>
        <View style={styles.itemTopo}>
          <Text style={styles.itemNome} numberOfLines={1}>
            {item.nome}
          </Text>
          <Selo texto={est.rotulo} cor={est.cor} fundo={est.fundo} />
        </View>
        <Text style={styles.itemSub}>{rotuloFuncao(item.funcao)}</Text>
        <Text style={styles.itemDetalhe}>{item.detalhe}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardCiclo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  setaBtn: {
    padding: espacamento.xs,
  },
  setaDesabilitada: {
    opacity: 0.4,
  },
  cicloCentro: {
    alignItems: 'center',
    flex: 1,
  },
  cicloLabel: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  cicloRotulo: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
  },
  cardResumo: {
    marginTop: espacamento.md,
  },
  resumoTexto: {
    ...tipografia.corpo,
    color: cores.texto,
  },
  cardDia: {
    marginTop: espacamento.sm,
  },
  diaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
  },
  diaTitulo: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
    flex: 1,
  },
  diaBadge: {
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: raio.lg,
    backgroundColor: '#FEECEC',
    alignItems: 'center',
  },
  diaBadgeTexto: {
    ...tipografia.legenda,
    color: VERMELHO,
    fontWeight: '700',
  },
  itemLinha: {
    marginTop: espacamento.sm,
    paddingTop: espacamento.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
  },
  itemTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
  },
  itemNome: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
    flex: 1,
  },
  itemSub: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  itemDetalhe: {
    ...tipografia.corpo,
    color: cores.texto,
    marginTop: espacamento.xs,
  },
});
