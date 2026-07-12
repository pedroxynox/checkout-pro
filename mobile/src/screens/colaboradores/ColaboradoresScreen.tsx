/**
 * Seção "Colaboradores" (somente leitura).
 *
 * Lista todos os colaboradores (busca por nome/matrícula). Tocar num item abre
 * o PERFIL do colaborador. O cadastro/edição NÃO acontece aqui — fica no
 * "Centro de Controle ▸ Colaboradores" (apenas gestor).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colaboradoresService } from '../../api/services';
import { Colaborador, FuncaoColaborador, TurnoColaborador } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import {
  Carregando,
  CampoTexto,
  EstadoVazio,
  MensagemErro,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { PropsTela } from '../../navigation/types';
import { cores, espacamento, raio, tipografia } from '../../theme';

const FUNCOES: Record<FuncaoColaborador, string> = {
  OPERADOR: 'Operador',
  FISCAL: 'Fiscal',
  SUPERVISOR: 'Supervisor',
  GESTOR: 'Gestor',
};

const TURNOS: Record<TurnoColaborador, string> = {
  ABERTURA: 'Abertura',
  INTERMEDIARIO: 'Intermediário',
  FECHAMENTO: 'Fechamento',
  APOIO: 'Apoio',
};

/** Filtro ativo pelos cards de contagem (Total = todos). */
type FiltroCard = 'TOTAL' | 'FISCAIS' | TurnoColaborador;

export function ColaboradoresScreen({
  navigation,
}: PropsTela<'Colaboradores'>): React.ReactElement {
  const { podeAcessar } = useAuth();
  const lista = useRequisicao<Colaborador[]>(
    () => colaboradoresService.listar(),
    [],
  );
  const [busca, setBusca] = useState('');
  // Filtro pelos cards de contagem. Começa em "Total" e volta a "Total" ao
  // sair da tela (ver efeito abaixo).
  const [filtroCard, setFiltroCard] = useState<FiltroCard>('TOTAL');

  // Ao sair da tela (blur), reseta o filtro para "Total" — na próxima visita
  // a lista volta ao padrão. addListener já devolve a função de limpeza.
  useEffect(
    () => navigation.addListener('blur', () => setFiltroCard('TOTAL')),
    [navigation],
  );

  const filtrados = useMemo(() => {
    const dados = lista.dados ?? [];
    const b = busca.trim().toLowerCase();
    const passaCard = (c: Colaborador): boolean => {
      if (filtroCard === 'TOTAL') return true;
      if (filtroCard === 'FISCAIS') return c.funcao === 'FISCAL';
      // Turnos contam apenas operadores (fiscais têm o seu próprio card).
      return c.funcao === 'OPERADOR' && c.turno === filtroCard;
    };
    const base = dados.filter(
      (c) =>
        passaCard(c) &&
        (!b ||
          c.nome.toLowerCase().includes(b) ||
          c.matricula.toLowerCase().includes(b)),
    );
    // Ativos primeiro; inativos (desligados) ao final. Ordenação estável:
    // mantém a ordem do backend (função/nome) dentro de cada grupo.
    return [...base].sort((a, b2) =>
      a.ativo === b2.ativo ? 0 : a.ativo ? -1 : 1,
    );
  }, [lista.dados, busca, filtroCard]);

  // Índice do primeiro inativo (para o divisor "Inativos" na lista).
  const primeiroInativoIdx = useMemo(
    () => filtrados.findIndex((c) => !c.ativo),
    [filtrados],
  );

  // Conteo do quadro (somente colaboradores ATIVOS): total, fiscais e por
  // turno. Os turnos (Abertura/Intermediário/Fechamento/Apoio) contam APENAS
  // operadores — os fiscais têm a sua própria contagem e não entram nos turnos.
  const contagem = useMemo(() => {
    const ativos = (lista.dados ?? []).filter((c) => c.ativo);
    const operadores = ativos.filter((c) => c.funcao === 'OPERADOR');
    const porTurno = (t: TurnoColaborador): number =>
      operadores.filter((c) => c.turno === t).length;
    return {
      total: ativos.length,
      FISCAIS: ativos.filter((c) => c.funcao === 'FISCAL').length,
      ABERTURA: porTurno('ABERTURA'),
      INTERMEDIARIO: porTurno('INTERMEDIARIO'),
      FECHAMENTO: porTurno('FECHAMENTO'),
      APOIO: porTurno('APOIO'),
    };
  }, [lista.dados]);

  const cardsContagem: { chave: FiltroCard; rotulo: string; valor: number }[] = [
    { chave: 'TOTAL', rotulo: 'Total', valor: contagem.total },
    { chave: 'FISCAIS', rotulo: 'Fiscais', valor: contagem.FISCAIS },
    { chave: 'ABERTURA', rotulo: 'Abertura', valor: contagem.ABERTURA },
    { chave: 'INTERMEDIARIO', rotulo: 'Intermediário', valor: contagem.INTERMEDIARIO },
    { chave: 'FECHAMENTO', rotulo: 'Fechamento', valor: contagem.FECHAMENTO },
    { chave: 'APOIO', rotulo: 'Apoio', valor: contagem.APOIO },
  ];

  return (
    <Tela aoAtualizar={lista.recarregar} atualizando={lista.atualizando}>
      {/* Atalho para Contratos de experiência (tempo de casa e marcos 45/90). */}
      {podeAcessar('CONTRATOS_VISUALIZAR') && (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Contratos')}
          style={styles.cardContratos}
        >
          <View style={styles.contratosIcone}>
            <Ionicons name="document-text-outline" size={20} color={cores.primaria} />
          </View>
          <View style={styles.itemInfo}>
            <Text style={styles.itemNome}>Contratos de experiência</Text>
            <Text style={styles.itemMeta} numberOfLines={1}>
              Tempo de casa e marcos de 45/90 dias
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={cores.textoSecundario} />
        </TouchableOpacity>
      )}

      {/* Atalho para Sanções (advertências e suspensões dos colaboradores). */}
      {podeAcessar('ESCALA_VISUALIZAR') && (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Sancoes')}
          style={styles.cardContratos}
        >
          <View style={styles.contratosIcone}>
            <Ionicons name="shield-outline" size={20} color={cores.primaria} />
          </View>
          <View style={styles.itemInfo}>
            <Text style={styles.itemNome}>Sanções</Text>
            <Text style={styles.itemMeta} numberOfLines={1}>
              Advertências e suspensões dos colaboradores
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={cores.textoSecundario} />
        </TouchableOpacity>
      )}

      <CampoTexto
        rotulo="Buscar"
        value={busca}
        onChangeText={setBusca}
        placeholder="Nome ou matrícula"
      />

      {!lista.carregando && !lista.erro && (lista.dados?.length ?? 0) > 0 && (
        <View style={styles.contadores}>
          {cardsContagem.map((c) => {
            const ativo = filtroCard === c.chave;
            return (
              <TouchableOpacity
                key={c.rotulo}
                activeOpacity={0.7}
                onPress={() => setFiltroCard(c.chave)}
                accessibilityRole="button"
                accessibilityState={{ selected: ativo }}
                accessibilityLabel={`Filtrar por ${c.rotulo}`}
                style={[styles.cardConta, ativo && styles.cardContaDestaque]}
              >
                <Text
                  style={[
                    styles.cardContaNum,
                    ativo && styles.cardContaNumDestaque,
                  ]}
                >
                  {c.valor}
                </Text>
                <Text style={styles.cardContaRotulo} numberOfLines={1}>
                  {c.rotulo}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {lista.carregando ? (
        <Carregando />
      ) : lista.erro ? (
        <MensagemErro mensagem={lista.erro} aoTentarNovamente={lista.recarregar} />
      ) : filtrados.length === 0 ? (
        <EstadoVazio
          icone="people-outline"
          titulo="Sem colaboradores"
          descricao="Os colaboradores cadastrados aparecerão aqui."
        />
      ) : (
        filtrados.map((c, i) => (
          <React.Fragment key={c.id}>
            {i === primeiroInativoIdx ? (
              <View style={styles.divisorInativos}>
                <Text style={styles.divisorInativosTexto}>
                  Inativos (desligados)
                </Text>
              </View>
            ) : null}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() =>
              navigation.navigate('PerfilColaborador', { colaboradorId: c.id })
            }
            style={[styles.item, !c.ativo && styles.itemInativo]}
          >
            <View style={[styles.avatar, { backgroundColor: cores.primariaClara }]}>
              <Ionicons
                name={c.genero === 'M' ? 'man' : 'woman'}
                size={20}
                color={cores.primaria}
              />
            </View>
            <View style={styles.itemInfo}>
              <Text style={styles.itemNome} numberOfLines={1}>
                {c.nome}
                {!c.ativo ? ' (inativo)' : ''}
              </Text>
              <Text style={styles.itemMeta} numberOfLines={1}>
                {[FUNCOES[c.funcao], c.turno ? TURNOS[c.turno] : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={cores.textoSecundario} />
          </TouchableOpacity>
          </React.Fragment>
        ))
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  cardContratos: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: cores.superficie,
    borderRadius: raio.md,
    padding: espacamento.sm,
    marginBottom: espacamento.sm,
    borderWidth: 1,
    borderColor: cores.divisor,
  },
  divisorInativos: {
    marginTop: espacamento.md,
    marginBottom: espacamento.xs,
    paddingTop: espacamento.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
  },
  divisorInativosTexto: {
    ...tipografia.rotulo,
    fontWeight: '700',
    color: cores.textoSecundario,
  },
  contratosIcone: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: cores.primariaClara,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contadores: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.xs,
    marginBottom: espacamento.sm,
  },
  cardConta: {
    flexGrow: 1,
    flexBasis: 92,
    minWidth: 92,
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.divisor,
    borderRadius: raio.md,
    paddingVertical: espacamento.sm,
    paddingHorizontal: espacamento.sm,
    alignItems: 'center',
  },
  cardContaDestaque: {
    backgroundColor: cores.primariaClara,
    borderColor: cores.primariaClara,
  },
  cardContaNum: { ...tipografia.subtitulo, color: cores.texto },
  cardContaNumDestaque: { color: cores.primaria },
  cardContaRotulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: cores.superficie,
    borderRadius: raio.md,
    padding: espacamento.sm,
    marginBottom: espacamento.xs,
    borderWidth: 1,
    borderColor: cores.divisor,
  },
  itemInativo: { opacity: 0.55 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: { flex: 1, paddingHorizontal: espacamento.sm },
  itemNome: { ...tipografia.corpo, fontWeight: '600', color: cores.texto },
  itemMeta: { ...tipografia.legenda, color: cores.textoSecundario, marginTop: 1 },
});

export default ColaboradoresScreen;
