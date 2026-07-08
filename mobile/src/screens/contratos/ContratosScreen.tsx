/**
 * Seção "Contratos" — contrato de experiência (45 + 45 dias) dos operadores.
 *
 * Mostra um resumo da carteira, filtros por etiqueta e um card por operador com
 * o tempo de casa, a etiqueta (experiência/efetivado) e o semáforo de urgência.
 * O ciclo é AUTOMÁTICO: dentro dos 90 dias fica "experiência" e, a partir do dia
 * 91, "efetivado" — não há decisão manual de marcos. Quem tem `CONTRATOS_GERIR`
 * (gerente) apenas define/edita a data de admissão. Tocar no card abre o perfil.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ApiError } from '../../api/client';
import { contratosService } from '../../api/services';
import {
  ContratoCard,
  EtiquetaContrato,
  ResumoCarteiraContratos,
  UrgenciaContrato,
} from '../../api/types';
import {
  Botao,
  CampoTexto,
  Carregando,
  Cartao,
  EstadoVazio,
  MensagemErro,
  Selo,
  Tela,
} from '../../components';
import { useAuth } from '../../auth/AuthContext';
import { useRequisicao } from '../../hooks/useRequisicao';
import { PropsTela } from '../../navigation/types';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { notificar } from '../../utils/dialogos';
import { formatarData } from '../../utils/formato';

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

const ROTULO_ETIQUETA: Record<EtiquetaContrato, string> = {
  experiencia: 'Experiência',
  efetivado: 'Efetivado',
  encerrado: 'Encerrado',
  sem_admissao: 'Sem admissão',
};

/** Cor do selo a partir da urgência (semáforo). */
function coresUrgencia(u: UrgenciaContrato): { cor: string; fundo: string } {
  switch (u) {
    case 'CRITICO':
      return { cor: cores.vermelho, fundo: cores.vermelhoFundo };
    case 'ATENCAO':
      return { cor: cores.amarelo, fundo: cores.amareloFundo };
    case 'OK':
      return { cor: cores.verde, fundo: cores.verdeFundo };
    default:
      return { cor: cores.textoSecundario, fundo: cores.divisor };
  }
}

/** Filtros de etiqueta (o "Todas" = undefined). */
const FILTROS: { v: EtiquetaContrato | 'todas'; r: string }[] = [
  { v: 'todas', r: 'Todas' },
  { v: 'experiencia', r: 'Experiência' },
  { v: 'efetivado', r: 'Efetivado' },
  { v: 'encerrado', r: 'Encerrado' },
  { v: 'sem_admissao', r: 'Sem admissão' },
];

/** Frase de status do contrato para o card (ciclo automático). */
function statusDoCard(c: ContratoCard): string {
  if (c.estado === 'SEM_ADMISSAO') return 'Defina a data de admissão.';
  if (c.estado === 'EFETIVADO') return 'Efetivado (mais de 90 dias de casa).';
  if (c.estado === 'ENCERRADO') return 'Contrato encerrado.';
  // EXPERIÊNCIA: efetiva sozinho ao passar de 90 dias.
  return `Em experiência · ${c.diasDeCasa} de 90 dias de casa.`;
}

interface DadosContratos {
  cards: ContratoCard[];
  resumo: ResumoCarteiraContratos;
}

export function ContratosScreen({
  navigation,
}: PropsTela<'Contratos'>): React.ReactElement {
  const { podeAcessar } = useAuth();
  const podeGerir = podeAcessar('CONTRATOS_GERIR');

  const req = useRequisicao<DadosContratos>(
    async () => {
      const [cards, resumo] = await Promise.all([
        contratosService.listar(),
        contratosService.resumo(),
      ]);
      return { cards, resumo };
    },
    [],
  );

  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<EtiquetaContrato | 'todas'>('todas');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [admissaoInput, setAdmissaoInput] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const cardsFiltrados = useMemo(() => {
    const dados = req.dados?.cards ?? [];
    const b = busca.trim().toLowerCase();
    return dados.filter((c) => {
      if (filtro !== 'todas' && c.etiqueta !== filtro) return false;
      if (!b) return true;
      return (
        c.nome.toLowerCase().includes(b) ||
        c.matricula.toLowerCase().includes(b)
      );
    });
  }, [req.dados, busca, filtro]);

  const abrirAdmissao = (c: ContratoCard) => {
    setEditandoId(c.colaboradorId);
    setAdmissaoInput(c.dataAdmissao ? c.dataAdmissao.slice(0, 10) : '');
  };

  const salvarAdmissao = async () => {
    if (!editandoId) return;
    if (!DATA_ISO.test(admissaoInput.trim())) {
      notificar('Data inválida', 'Use o formato AAAA-MM-DD (ex.: 2026-05-01).');
      return;
    }
    setOcupado(true);
    try {
      await contratosService.definirAdmissao(editandoId, admissaoInput.trim());
      setEditandoId(null);
      setAdmissaoInput('');
      req.recarregar();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao salvar.');
    } finally {
      setOcupado(false);
    }
  };

  const resumo = req.dados?.resumo;
  const cardsResumo = resumo
    ? [
        { rotulo: 'Experiência', valor: resumo.emExperiencia, destaque: true },
        { rotulo: 'Efetivados', valor: resumo.efetivados },
        { rotulo: 'Total', valor: resumo.total },
      ]
    : [];

  return (
    <Tela aoAtualizar={req.recarregar} atualizando={req.atualizando}>
      {/* Editor de admissão (inline) */}
      {editandoId && (
        <Cartao titulo="Data de admissão">
          <CampoTexto
            rotulo="Admissão (AAAA-MM-DD)"
            value={admissaoInput}
            onChangeText={setAdmissaoInput}
            placeholder="Ex.: 2026-05-01"
            autoCapitalize="none"
          />
          <Text style={styles.ajuda}>
            Pode ser uma data passada (admissões históricas são aceitas).
          </Text>
          <Botao titulo="Salvar admissão" aoPressionar={salvarAdmissao} carregando={ocupado} />
          <Botao
            titulo="Cancelar"
            variante="texto"
            aoPressionar={() => {
              setEditandoId(null);
              setAdmissaoInput('');
            }}
          />
        </Cartao>
      )}

      {resumo && cardsResumo.length > 0 && (
        <View style={styles.contadores}>
          {cardsResumo.map((c) => (
            <View
              key={c.rotulo}
              style={[styles.cardConta, c.destaque && styles.cardContaDestaque]}
            >
              <Text
                style={[styles.cardContaNum, c.destaque && styles.cardContaNumDestaque]}
              >
                {c.valor}
              </Text>
              <Text style={styles.cardContaRotulo} numberOfLines={1}>
                {c.rotulo}
              </Text>
            </View>
          ))}
        </View>
      )}

      <CampoTexto
        rotulo="Buscar"
        value={busca}
        onChangeText={setBusca}
        placeholder="Nome ou matrícula"
      />

      <View style={styles.chips}>
        {FILTROS.map((f) => (
          <Text
            key={f.v}
            onPress={() => setFiltro(f.v)}
            style={[styles.chip, filtro === f.v && styles.chipAtivo]}
          >
            {f.r}
          </Text>
        ))}
      </View>

      {req.carregando ? (
        <Carregando />
      ) : req.erro ? (
        <MensagemErro mensagem={req.erro} aoTentarNovamente={req.recarregar} />
      ) : cardsFiltrados.length === 0 ? (
        <EstadoVazio
          icone="document-text-outline"
          titulo="Sem contratos"
          descricao="Operadores com data de admissão aparecerão aqui."
        />
      ) : (
        cardsFiltrados.map((c) => {
          const { cor, fundo } = coresUrgencia(c.urgencia);
          return (
            <View key={c.colaboradorId} style={styles.card}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() =>
                  navigation.navigate('PerfilColaborador', {
                    colaboradorId: c.colaboradorId,
                  })
                }
                style={styles.cardTopo}
              >
                <View style={styles.cardInfo}>
                  <Text style={styles.cardNome} numberOfLines={1}>
                    {c.nome}
                  </Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    Mat. {c.matricula}
                    {c.dataAdmissao
                      ? ` · desde ${formatarData(c.dataAdmissao)} · ${c.diasDeCasa} dias de casa`
                      : ''}
                  </Text>
                  <Text style={styles.cardStatus} numberOfLines={2}>
                    {statusDoCard(c)}
                  </Text>
                </View>
                <Selo texto={ROTULO_ETIQUETA[c.etiqueta]} cor={cor} fundo={fundo} />
              </TouchableOpacity>

              {podeGerir && (
                <View style={styles.acoes}>
                  {c.estado === 'SEM_ADMISSAO' ? (
                    <Botao
                      titulo="Definir admissão"
                      variante="secundario"
                      aoPressionar={() => abrirAdmissao(c)}
                    />
                  ) : (
                    <TouchableOpacity
                      onPress={() => abrirAdmissao(c)}
                      hitSlop={8}
                      style={styles.editarAdmissao}
                    >
                      <Ionicons name="calendar-outline" size={14} color={cores.textoSecundario} />
                      <Text style={styles.editarAdmissaoTxt}>Editar admissão</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          );
        })
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  ajuda: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: -espacamento.xs,
    marginBottom: espacamento.sm,
  },
  contadores: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.xs,
    marginBottom: espacamento.sm,
  },
  cardConta: {
    flexGrow: 1,
    flexBasis: 78,
    minWidth: 78,
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.xs,
    marginBottom: espacamento.sm,
  },
  chip: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    paddingVertical: espacamento.xs,
    paddingHorizontal: espacamento.sm,
    borderRadius: raio.pill,
    backgroundColor: cores.divisor,
    overflow: 'hidden',
  },
  chipAtivo: { backgroundColor: cores.primaria, color: cores.textoInverso },
  card: {
    backgroundColor: cores.superficie,
    borderRadius: raio.md,
    padding: espacamento.sm,
    marginBottom: espacamento.xs,
    borderWidth: 1,
    borderColor: cores.divisor,
  },
  cardTopo: { flexDirection: 'row', alignItems: 'flex-start' },
  cardInfo: { flex: 1, paddingRight: espacamento.sm },
  cardNome: { ...tipografia.corpo, fontWeight: '600', color: cores.texto },
  cardMeta: { ...tipografia.legenda, color: cores.textoSecundario, marginTop: 1 },
  cardStatus: { ...tipografia.legenda, color: cores.texto, marginTop: 4 },
  acoes: {
    marginTop: espacamento.sm,
    borderTopWidth: 1,
    borderTopColor: cores.divisor,
    paddingTop: espacamento.sm,
  },
  editarAdmissao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: espacamento.xs,
    paddingVertical: 4,
  },
  editarAdmissaoTxt: { ...tipografia.legenda, color: cores.textoSecundario },
});

export default ContratosScreen;
