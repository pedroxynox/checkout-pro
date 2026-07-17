/**
 * Painel de inconsistências da jornada (uso gerencial — CENTRAL_JORNADA).
 * Reúne, por ciclo de folha (26→25), os problemas que precisam de revisão:
 * jornadas incompletas, batidas duplicadas, conflito ponto↔ausência, atraso
 * (fora da escala) e TAC. Filtros por pessoa, função e tipo facilitam a
 * revisão diária de supervisores e gerentes.
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

/** Opções do filtro por tipo (TODOS + os cinco tipos). */
const FILTROS_TIPO: { chave: TipoInconsistencia | 'TODOS'; rotulo: string }[] = [
  { chave: 'TODOS', rotulo: 'Todos' },
  { chave: 'INCOMPLETA', rotulo: 'Incompletas' },
  { chave: 'DUPLICADA', rotulo: 'Duplicadas' },
  { chave: 'CONFLITO_AUSENCIA', rotulo: 'Conflitos' },
  { chave: 'ATRASO', rotulo: 'Atrasos' },
  { chave: 'TAC', rotulo: 'TAC' },
];

const FILTROS_FUNCAO: { chave: string; rotulo: string }[] = [
  { chave: 'TODOS', rotulo: 'Todas' },
  { chave: 'FISCAL', rotulo: 'Fiscais' },
  { chave: 'SUPERVISOR', rotulo: 'Supervisores' },
  { chave: 'OPERADOR', rotulo: 'Operadores' },
];

function Chip({
  ativo,
  rotulo,
  aoTocar,
}: {
  ativo: boolean;
  rotulo: string;
  aoTocar: () => void;
}): React.ReactElement {
  return (
    <Pressable
      onPress={aoTocar}
      style={[styles.chip, ativo && styles.chipAtivo]}
      accessibilityRole="button"
    >
      <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]}>
        {rotulo}
      </Text>
    </Pressable>
  );
}

export function InconsistenciasScreen(): React.ReactElement {
  const [ciclo, setCiclo] = useState(0);
  const [busca, setBusca] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<TipoInconsistencia | 'TODOS'>(
    'TODOS',
  );
  const [funcaoFiltro, setFuncaoFiltro] = useState<string>('TODOS');

  const req = useRequisicao<CentralInconsistencias>(
    () => centralJornadaService.inconsistencias(ciclo),
    [ciclo],
  );

  const itensFiltrados = useMemo(() => {
    const itens = req.dados?.itens ?? [];
    const alvo = busca.trim().toLowerCase();
    return itens.filter((i) => {
      if (tipoFiltro !== 'TODOS' && i.tipo !== tipoFiltro) return false;
      if (funcaoFiltro !== 'TODOS' && i.funcao !== funcaoFiltro) return false;
      if (alvo && !i.nome.toLowerCase().includes(alvo)) return false;
      return true;
    });
  }, [req.dados, busca, tipoFiltro, funcaoFiltro]);

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
          <Text style={styles.cicloRotulo}>{req.dados?.periodo.rotulo ?? '—'}</Text>
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

          {/* Filtros: busca por nome + tipo + função */}
          <Cartao>
            <CampoTexto
              rotulo="Buscar por pessoa"
              placeholder="Nome do colaborador…"
              value={busca}
              onChangeText={setBusca}
              autoCorrect={false}
            />
            <Text style={styles.filtroTitulo}>Tipo</Text>
            <View style={styles.chipsLinha}>
              {FILTROS_TIPO.map((f) => (
                <Chip
                  key={f.chave}
                  rotulo={f.rotulo}
                  ativo={tipoFiltro === f.chave}
                  aoTocar={() => setTipoFiltro(f.chave)}
                />
              ))}
            </View>
            <Text style={styles.filtroTitulo}>Função</Text>
            <View style={styles.chipsLinha}>
              {FILTROS_FUNCAO.map((f) => (
                <Chip
                  key={f.chave}
                  rotulo={f.rotulo}
                  ativo={funcaoFiltro === f.chave}
                  aoTocar={() => setFuncaoFiltro(f.chave)}
                />
              ))}
            </View>
          </Cartao>

          {/* Lista filtrada */}
          {itensFiltrados.length === 0 ? (
            <EstadoVazio
              icone="checkmark-done-outline"
              titulo="Nada a revisar"
              descricao="Nenhuma inconsistência com os filtros atuais."
            />
          ) : (
            itensFiltrados.map((item, i) => (
              <ItemInconsistencia key={`${item.colaboradorId}-${item.data}-${item.tipo}-${i}`} item={item} />
            ))
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
    <Cartao style={styles.cardItem}>
      <View style={styles.itemTopo}>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemNome}>{item.nome}</Text>
          <Text style={styles.itemSub}>
            {rotuloFuncao(item.funcao)} • {dataCurta(item.data)}
            {item.ehFeriado ? ' • Feriado' : ''}
          </Text>
        </View>
        <Selo texto={est.rotulo} cor={est.cor} fundo={est.fundo} />
      </View>
      <Text style={styles.itemDetalhe}>{item.detalhe}</Text>
    </Cartao>
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
  filtroTitulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
    marginBottom: espacamento.xs,
  },
  chipsLinha: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.xs,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: espacamento.sm,
    borderRadius: raio.lg,
    borderWidth: 1,
    borderColor: cores.divisor,
    backgroundColor: cores.superficie ?? '#fff',
  },
  chipAtivo: {
    backgroundColor: cores.primaria,
    borderColor: cores.primaria,
  },
  chipTexto: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  chipTextoAtivo: {
    color: '#fff',
    fontWeight: '700',
  },
  cardItem: {
    marginTop: espacamento.sm,
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
