/**
 * Quadro de Operadores (escala fixa, foco no dia).
 *
 * Mostra o roster do DIA selecionado (padrão: hoje): cada colaborador com o
 * horário do dia, ordenados por hora de ENTRADA e com os de folga ao fim.
 * 🟢 trabalha · 🔴 falta · ⚪ folga. Tocar numa linha que trabalha marca falta;
 * tocar numa falta a remove (com o impacto na cobertura do dia). Em cima, o
 * "Agora no caixa" (ao vivo). Embaixo, as faltas do mês e (gestor) o cadastro
 * de operador. Domingo entra depois.
 */
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { escalaService, fiscaisService, operadoresService } from '../../api/services';
import {
  AnaliticaFaltas,
  AoVivoOperadores,
  AusenciaDetalhada,
  ColaboradorDia,
  DiaOperadores,
  FaltasPorOperador,
  IncidenciaEscala,
  ItemEscalaConsolidada,
  MotivoJustificativa,
  StatusCelula,
  StatusFiscal,
  StatusJustificativa,
} from '../../api/types';
import { ConexaoFiscais, conectarPainelFiscais } from '../../api/socket';
import { ROTULO_STATUS_FISCAL } from '../../utils/rotulos';
import { useAuth } from '../../auth/AuthContext';
import {
  Aviso,
  Botao,
  Carregando,
  Cartao,
  EstadoVazio,
  MensagemErro,
  Selo,
  SeletorData,
  Tela,
} from '../../components';
import { useConfigSistema } from '../../config/ConfigSistemaContext';
import { useRequisicao } from '../../hooks/useRequisicao';
import { RootStackParamList } from '../../navigation/types';
import { AusenciasAPrazoCard } from './AusenciasAPrazo';
import { JustificativasLista } from './JustificativasScreen';
import { cores, espacamento, raio, sombra, tipografia } from '../../theme';
import { formatarData, hojeISO } from '../../utils/formato';

const NOMES_DIA_LONGO = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
];

/** Cobertura mínima desejada por dia (abaixo disso, alerta). */
const COBERTURA_MINIMA = 20;

function corStatus(status: ColaboradorDia['status']): { fundo: string; texto: string } {
  if (status === 'TRABALHA') return { fundo: 'rgba(30,158,90,0.14)', texto: cores.verde };
  if (status === 'FALTA') return { fundo: 'rgba(210,59,59,0.16)', texto: cores.vermelho };
  return { fundo: cores.divisor, texto: cores.textoSecundario };
}

function rotuloStatus(status: ColaboradorDia['status']): string {
  if (status === 'TRABALHA') return 'Trabalha';
  if (status === 'FALTA') return 'Falta';
  return 'Folga';
}

/** Os dois grupos que trabalham quando `folga` está de folga no domingo. */
function gruposQueTrabalhamDomingo(folga: string): string {
  return ['G1', 'G2', 'G3'].filter((g) => g !== folga).join(' e ');
}

/** Cor do status AO VIVO do fiscal (derivado das batidas do ponto). */
function corStatusFiscal(status: StatusFiscal): string {
  if (status === 'DISPONIVEL') return cores.verde;
  if (status === 'INTERVALO') return cores.amarelo;
  return cores.textoSecundario;
}

/** Primeiro e último dia do mês atual (ISO). */
function mesAtualISO(): { inicio: string; fim: string } {
  const d = new Date();
  const ini = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const fim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { inicio: ini.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
}

/**
 * Turnos (definidos no Cadastro de cada colaborador) para agrupar o roster do
 * dia. A folga NÃO entra aqui — vai para um card separado no fim ("Folga
 * operadores"). "Sem turno" agrupa quem ainda não tem turno definido no
 * cadastro (deve ser corrigido no cadastro do colaborador).
 */
const TURNOS: { chave: string; titulo: string }[] = [
  { chave: 'ABERTURA', titulo: 'Abertura' },
  { chave: 'INTERMEDIARIO', titulo: 'Intermediário' },
  { chave: 'FECHAMENTO', titulo: 'Fechamento' },
  { chave: 'APOIO', titulo: 'Horários de apoio' },
  { chave: 'SEM_TURNO', titulo: 'Sem turno definido' },
];

/**
 * Turno do colaborador conforme o **Cadastro** (fonte da verdade). A escala
 * não adivinha mais pela hora de entrada: usa o turno fixo selecionado no
 * cadastro (Abertura/Intermediário/Fechamento/Apoio). Quem está de folga vai
 * para o card de folga; quem ainda não tem turno definido cai em "Sem turno".
 */
function turnoDe(c: ColaboradorDia): string {
  if (c.status === 'FOLGA') return 'FOLGA';
  return c.turno ?? 'SEM_TURNO';
}

/** Ícone de avatar por gênero ('M'/'F'); fallback simples pelo nome. */
function iconeGenero(genero: string | null, nome: string): 'man' | 'woman' {
  if (genero === 'M') return 'man';
  if (genero === 'F') return 'woman';
  const primeiro = nome.trim().split(/\s+/)[0].toLowerCase();
  return primeiro.endsWith('a') ? 'woman' : 'man';
}

/** Relógio "HH:MM:SS" no fuso de Brasília. */
function relogioBrasilia(): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date());
}

/** Conta apenas os presentes (TRABALHA) por turno do cadastro — exclui faltas. */
function contarTurnos(cols: ColaboradorDia[]): {
  ABERTURA: number;
  INTERMEDIARIO: number;
  FECHAMENTO: number;
  APOIO: number;
  SEM_TURNO: number;
} {
  const c = {
    ABERTURA: 0,
    INTERMEDIARIO: 0,
    FECHAMENTO: 0,
    APOIO: 0,
    SEM_TURNO: 0,
  };
  for (const x of cols) {
    if (x.status !== 'TRABALHA') continue; // exclui folgas e faltas
    const t = turnoDe(x);
    if (
      t === 'ABERTURA' ||
      t === 'INTERMEDIARIO' ||
      t === 'FECHAMENTO' ||
      t === 'APOIO' ||
      t === 'SEM_TURNO'
    ) {
      c[t] += 1;
    }
  }
  return c;
}

/**
 * Linha de um colaborador no roster do dia. Tocar na linha abre o **perfil**.
 *
 * A marcação de falta e de "não retorno" NÃO é mais feita aqui: o sistema
 * detecta ambas automaticamente pelo Relógio Ponto (falta = sem ponto até 2h
 * após a entrada; não retorno = intervalo acima de 3h). Esta linha apenas
 * EXIBE o estado (Trabalha / Falta / No retorno / Folga) e o status ao vivo.
 */
function ColaboradorRow({
  c,
  onAbrirPerfil,
  semRetornoAtivo,
  statusAoVivo,
}: {
  c: ColaboradorDia;
  onAbrirPerfil: (c: ColaboradorDia) => void;
  semRetornoAtivo: boolean;
  /**
   * Status AO VIVO do fiscal (Disponível/Intervalo/Fora), vindo das batidas do
   * ponto. Só é passado para fiscais e quando o dia exibido é hoje.
   */
  statusAoVivo?: StatusFiscal | null;
}): React.ReactElement {
  const folga = c.status === 'FOLGA';
  const ehFalta = c.status === 'FALTA';
  // "Sem retorno" só se aplica a quem trabalha (não folga, não falta).
  const semRet = semRetornoAtivo && !ehFalta && !folga;

  // Cor/rotulo efetivos: falta (vermelho) > sem retorno (azul) > status.
  const cor = ehFalta
    ? { fundo: 'rgba(210,59,59,0.16)', texto: cores.vermelho }
    : semRet
      ? { fundo: cores.primariaClara, texto: cores.primaria }
      : corStatus(c.status);
  const rotulo = ehFalta ? 'Falta' : semRet ? 'No retorno' : rotuloStatus(c.status);

  return (
    <TouchableOpacity
      activeOpacity={0.6}
      onPress={() => onAbrirPerfil(c)}
      style={[styles.linha, { borderLeftColor: cor.texto }]}
      accessibilityLabel={`Abrir perfil de ${c.nome}`}
    >
      <View style={[styles.avatar, { backgroundColor: cor.fundo }]}>
        <Ionicons name={iconeGenero(c.genero, c.nome)} size={20} color={cor.texto} />
      </View>
      <View style={styles.linhaInfo}>
        <Text style={styles.nomeColaborador} numberOfLines={1}>
          {c.nome}
        </Text>
        <Text style={styles.horarioInline}>
          {folga ? 'Dia de folga' : `${c.entrada} – ${c.saida}`}
        </Text>
        {/* Status ao vivo do fiscal (só hoje). Complementa o selo de escala. */}
        {statusAoVivo ? (
          <View style={styles.statusVivoLinha}>
            <View
              style={[
                styles.statusVivoDot,
                { backgroundColor: corStatusFiscal(statusAoVivo) },
              ]}
            />
            <Text
              style={[styles.statusVivoTexto, { color: corStatusFiscal(statusAoVivo) }]}
            >
              {ROTULO_STATUS_FISCAL[statusAoVivo]}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={[styles.chip, { backgroundColor: cor.fundo }]}>
        <Text style={[styles.chipTexto, { color: cor.texto }]}>{rotulo}</Text>
      </View>
    </TouchableOpacity>
  );
}

/**
 * Converte um fiscal da escala consolidada num `ColaboradorDia`, para ser
 * exibido e tratado EXATAMENTE como um operador (abrir perfil, marcar falta e
 * marcar "não retorno"). Retorna null quando o fiscal não tem ficha de
 * colaborador vinculada — sem id não há como agir nem abrir o perfil.
 */
function fiscalComoColaboradorDia(
  f: ItemEscalaConsolidada,
  ausenciaId: string | null,
): ColaboradorDia | null {
  if (!f.colaboradorId) return null;
  const ef = f.efetiva;
  const folga = ef === 'FOLGA';
  const status: StatusCelula = folga
    ? 'FOLGA'
    : ausenciaId
      ? 'FALTA'
      : 'TRABALHA';
  return {
    id: f.colaboradorId,
    nome: f.nome ?? f.funcionarioId,
    genero: null,
    // A seção de Fiscais é renderizada em bloco próprio (não é agrupada por
    // `turnoDe`), então o turno não é lido aqui.
    turno: null,
    status,
    entrada: folga ? null : (ef.entrada ?? null),
    saida: folga ? null : (ef.saida ?? null),
    ausenciaId,
  };
}

/** Linha de um fiscal SEM ficha de colaborador (só leitura, sem ações). */
function FiscalSemFichaRow({
  f,
}: {
  f: ItemEscalaConsolidada;
}): React.ReactElement {
  const ef = f.efetiva;
  const folga = ef === 'FOLGA';
  const cor = folga ? cores.textoSecundario : cores.primaria;
  const fundo = folga ? cores.divisor : cores.primariaClara;
  return (
    <View style={[styles.linha, { borderLeftColor: cor }]}>
      <View style={[styles.avatar, { backgroundColor: fundo }]}>
        <Ionicons name={iconeGenero(null, f.nome ?? '')} size={20} color={cor} />
      </View>
      <View style={styles.linhaInfo}>
        <Text style={styles.nomeColaborador} numberOfLines={1}>
          {f.nome ?? f.funcionarioId}
        </Text>
        <Text style={styles.horarioInline}>
          {ef === 'FOLGA'
            ? 'Dia de folga'
            : `${ef.entrada ?? '--'} – ${ef.saida ?? '--'}`}
        </Text>
      </View>
      <View style={[styles.chip, { backgroundColor: cores.divisor }]}>
        <Text style={[styles.chipTexto, { color: cores.textoSecundario }]}>
          Sem ficha
        </Text>
      </View>
    </View>
  );
}

/** Item compacto de folga (cards "Folga operadores" / "Folga fiscais" no fim). */
function FolgaItem({
  nome,
  icone,
}: {
  nome: string;
  icone: React.ComponentProps<typeof Ionicons>['name'];
}): React.ReactElement {
  return (
    <View style={styles.folgaItem}>
      <View style={styles.folgaAvatar}>
        <Ionicons name={icone} size={18} color={cores.textoSecundario} />
      </View>
      <Text style={styles.folgaNome} numberOfLines={1}>
        {nome}
      </Text>
      <Text style={styles.folgaTag}>Folga</Text>
    </View>
  );
}

/**
 * Linha inteligente de um operador no card "Faltas do mês" (risco + padrões).
 * Se `onPress` for informado (dentro do modal), a linha vira tocável e mostra
 * uma seta — ao tocar, abre o detalhe do colaborador no mês.
 */
function FaltaOperadorRow({
  o,
  onPress,
}: {
  o: FaltasPorOperador;
  onPress?: () => void;
}): React.ReactElement {
  const corRisco =
    o.risco === 'ALTO'
      ? cores.vermelho
      : o.risco === 'MEDIO'
        ? cores.amarelo
        : cores.verde;
  const tags: string[] = [];
  if (o.diaRecorrente) tags.push(`${o.diaRecorrente.nome} recorrente`);
  if (o.faltasEmenda >= 2) tags.push(`${o.faltasEmenda}× emenda`);
  if (o.sequenciaMax >= 2) tags.push(`${o.sequenciaMax} dias seguidos`);
  if (o.tendencia > 0) tags.push(`▲ ${o.tendencia} vs. anterior`);
  const conteudo = (
    <>
      <View style={[styles.riscoDot, { backgroundColor: corRisco }]} />
      <View style={styles.faltaItemInfo}>
        <Text style={styles.faltaNomeFull} numberOfLines={1}>
          {o.nome}
        </Text>
        {tags.length > 0 ? (
          <Text style={styles.faltaTags} numberOfLines={1}>
            {tags.join(' · ')}
          </Text>
        ) : null}
      </View>
      <View style={styles.faltaNums}>
        <Text style={styles.faltaQtdFull}>{o.quantidade}</Text>
        <Text style={styles.faltaTaxa}>{o.taxa}%</Text>
      </View>
      {onPress ? (
        <Ionicons
          name="chevron-forward"
          size={16}
          color={cores.textoSecundario}
        />
      ) : null}
    </>
  );
  if (onPress) {
    return (
      <TouchableOpacity
        style={styles.faltaItem}
        activeOpacity={0.7}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityHint="Ver as ocorrências detalhadas deste colaborador"
      >
        {conteudo}
      </TouchableOpacity>
    );
  }
  return <View style={styles.faltaItem}>{conteudo}</View>;
}

/** Rótulo/cor do selo de justificativa (usa "Não justificada", não "Injustificada"). */
function seloJustificativa(s: StatusJustificativa): {
  texto: string;
  cor: string;
  fundo: string;
} {
  if (s === 'JUSTIFICADA')
    return { texto: 'Justificada', cor: cores.verde, fundo: cores.verdeFundo };
  if (s === 'INJUSTIFICADA')
    return {
      texto: 'Não justificada',
      cor: cores.vermelho,
      fundo: cores.vermelhoFundo,
    };
  return { texto: 'Pendente', cor: cores.amarelo, fundo: cores.amareloFundo };
}

/** Rótulo amigável do motivo da justificativa. */
const ROTULO_MOTIVO_DETALHE: Record<MotivoJustificativa, string> = {
  ATESTADO_MEDICO: 'Atestado médico',
  ABONADA: 'Abonada',
  LICENCA: 'Licença',
  ATRASO_JUSTIFICADO: 'Atraso justificado',
  OUTRO: 'Outro',
};

/** Uma ocorrência detalhada (falta ou não-retorno) de um colaborador no mês. */
interface OcorrenciaDetalhe {
  id: string;
  data: string;
  status: StatusJustificativa;
  motivo: MotivoJustificativa | null;
  registradaPorNome: string | null;
  justificadaPorNome: string | null;
  /** Só para faltas não justificadas: se houve advertência por esta falta. */
  advertido: boolean;
}

/**
 * Detalhe do colaborador dentro do painel mensal: lista, dia a dia, as suas
 * faltas (ou não-retornos) do mês com o estado da justificativa, o motivo,
 * quem registrou/justificou e — para as faltas NÃO justificadas — se o
 * colaborador foi advertido por aquela falta.
 */
function DetalheColaboradorMes({
  colaborador,
  tipo,
  inicio,
  fim,
}: {
  colaborador: FaltasPorOperador;
  tipo: 'FALTA' | 'NAO_RETORNO';
  inicio: string;
  fim: string;
}): React.ReactElement {
  const detalhe = useRequisicao<OcorrenciaDetalhe[]>(async () => {
    if (tipo === 'FALTA') {
      const [faltas, advertencias] = await Promise.all([
        operadoresService.listarAusencias(inicio, fim).catch(() => []),
        escalaService
          .listarIncidencias({
            colaboradorId: colaborador.id,
            tipo: 'ADVERTENCIA',
            inicio,
            fim,
          })
          .catch(() => [] as IncidenciaEscala[]),
      ]);
      const advDatas = new Set(
        advertencias
          .filter(
            (a) => (a.causaTipo ?? '').toUpperCase() === 'FALTA' && a.causaData,
          )
          .map((a) => (a.causaData as string).slice(0, 10)),
      );
      return faltas
        .filter((f) => f.pessoaId === colaborador.id)
        .map((f) => ({
          id: f.id,
          data: f.data,
          status: f.statusJustificativa,
          motivo: f.motivoJustificativa ?? null,
          registradaPorNome: f.registradaPorNome,
          justificadaPorNome: f.justificadaPorNome ?? null,
          advertido: advDatas.has(f.data.slice(0, 10)),
        }));
    }
    const incidencias = await escalaService
      .listarIncidencias({
        colaboradorId: colaborador.id,
        tipo: 'NAO_RETORNO_INTERVALO',
        inicio,
        fim,
      })
      .catch(() => [] as IncidenciaEscala[]);
    return incidencias.map((i) => ({
      id: i.id,
      data: i.data,
      status: i.statusJustificativa ?? 'PENDENTE',
      motivo: i.motivoJustificativa ?? null,
      registradaPorNome: i.registradoPorNome ?? null,
      justificadaPorNome: i.justificadaPorNome ?? null,
      advertido: false,
    }));
  }, [colaborador.id, tipo, inicio, fim]);

  if (detalhe.carregando) {
    return <Carregando />;
  }
  const itens = detalhe.dados ?? [];
  const substantivo = tipo === 'FALTA' ? 'falta' : 'não-retorno';

  return (
    <ScrollView
      style={styles.modalLista}
      contentContainerStyle={{ paddingVertical: espacamento.xs }}
    >
      {itens.length === 0 ? (
        <EstadoVazio
          titulo={`Sem ${substantivo}s no mês`}
          descricao="Não há ocorrências detalhadas para mostrar."
        />
      ) : (
        itens
          .slice()
          .sort((a, b) => b.data.localeCompare(a.data))
          .map((it) => {
            const selo = seloJustificativa(it.status);
            const justificada = it.status === 'JUSTIFICADA';
            return (
              <View key={it.id} style={styles.detalheItem}>
                <View style={styles.detalheLinhaTopo}>
                  <Text style={styles.detalheData}>
                    {formatarData(it.data)}
                  </Text>
                  <Selo texto={selo.texto} cor={selo.cor} fundo={selo.fundo} />
                </View>
                {justificada && it.motivo ? (
                  <Text style={styles.detalheInfo}>
                    Motivo: {ROTULO_MOTIVO_DETALHE[it.motivo]}
                  </Text>
                ) : null}
                {it.registradaPorNome ? (
                  <Text style={styles.detalheInfo}>
                    Registrou: {it.registradaPorNome}
                  </Text>
                ) : null}
                {justificada && it.justificadaPorNome ? (
                  <Text style={styles.detalheInfo}>
                    Justificou: {it.justificadaPorNome}
                  </Text>
                ) : null}
                {tipo === 'FALTA' && !justificada ? (
                  <View style={styles.detalheAdvertencia}>
                    <Ionicons
                      name={
                        it.advertido ? 'warning' : 'shield-checkmark-outline'
                      }
                      size={14}
                      color={it.advertido ? cores.vermelho : cores.verde}
                    />
                    <Text
                      style={[
                        styles.detalheAdvertenciaTexto,
                        { color: it.advertido ? cores.vermelho : cores.verde },
                      ]}
                    >
                      {it.advertido
                        ? 'Advertido por esta falta'
                        : 'Sem advertência'}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })
      )}
    </ScrollView>
  );
}

/** Tendência (▲ +x% / ▼ x%) vs. período anterior. Verde cai, vermelho sobe. */
function TendenciaTexto({
  pct,
}: {
  pct: number | null | undefined;
}): React.ReactElement | null {
  if (pct == null) return null;
  const corT =
    pct > 0 ? cores.vermelho : pct < 0 ? cores.verde : cores.textoSecundario;
  const seta = pct > 0 ? '▲ +' : pct < 0 ? '▼ ' : '';
  return (
    <Text style={[styles.faltasTend, { color: corT }]}>
      {seta}
      {pct}% vs. período anterior
    </Text>
  );
}

/** Cabeçalho comum (total + taxa + tendência) do painel mensal. */
function ResumoAnaliticaTopo({
  dados,
  unidade,
  rotuloTaxa,
  rotuloDiaPior,
}: {
  dados: AnaliticaFaltas;
  unidade: string;
  rotuloTaxa: string;
  rotuloDiaPior: string;
}): React.ReactElement {
  const pior = [...dados.porDiaSemana].sort(
    (a, b) => b.quantidade - a.quantidade,
  )[0];
  return (
    <>
      <View style={styles.faltasTopo}>
        <View>
          <Text style={styles.faltasTotal}>
            {dados.total} {unidade}
          </Text>
          <Text style={styles.faltasLegenda}>
            {rotuloTaxa}: {dados.taxaGlobal}%
          </Text>
        </View>
        <TendenciaTexto pct={dados.tendenciaPct} />
      </View>
      {pior && pior.quantidade > 0 ? (
        <Text style={styles.faltasDica}>
          {rotuloDiaPior}: {pior.nome} ({pior.quantidade})
        </Text>
      ) : null}
    </>
  );
}

/**
 * Painel de análise mensal (faltas ou não-retornos). Mostra um resumo tocável
 * (prévia dos 6 que mais precisam de atenção). Ao tocar, abre um cartão
 * flutuante (modal) com o MÊS INTEIRO — todos os operadores, com rolagem —,
 * fechável pelo botão "Voltar", pelo X ou pelo toque no fundo.
 */
function PainelAnaliticaMes({
  titulo,
  dados,
  unidade,
  rotuloTaxa,
  rotuloDiaPior,
  tipo,
  inicio,
  fim,
}: {
  titulo: string;
  dados: AnaliticaFaltas;
  unidade: string;
  rotuloTaxa: string;
  rotuloDiaPior: string;
  tipo: 'FALTA' | 'NAO_RETORNO';
  inicio: string;
  fim: string;
}): React.ReactElement {
  const [aberto, setAberto] = useState(false);
  const [selecionado, setSelecionado] = useState<FaltasPorOperador | null>(
    null,
  );
  const fechar = (): void => {
    setSelecionado(null);
    setAberto(false);
  };
  // Botão "voltar": se há colaborador aberto, volta à lista; senão, fecha.
  const voltar = (): void => {
    if (selecionado) setSelecionado(null);
    else fechar();
  };

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setAberto(true)}
        accessibilityRole="button"
        accessibilityHint="Abre o mês inteiro"
      >
        <Cartao titulo={titulo}>
          <ResumoAnaliticaTopo
            dados={dados}
            unidade={unidade}
            rotuloTaxa={rotuloTaxa}
            rotuloDiaPior={rotuloDiaPior}
          />
          <Text style={styles.faltasSubtitulo}>Quem precisa de atenção</Text>
          {dados.porOperador.slice(0, 6).map((o) => (
            <FaltaOperadorRow key={o.id} o={o} />
          ))}
          <View style={styles.painelAbrir}>
            <Ionicons name="expand-outline" size={14} color={cores.primaria} />
            <Text style={styles.painelAbrirTexto}>Toque para ver o mês todo</Text>
          </View>
        </Cartao>
      </TouchableOpacity>

      <Modal
        visible={aberto}
        transparent
        animationType="fade"
        onRequestClose={voltar}
      >
        <Pressable style={styles.modalFundo} onPress={fechar}>
          {/* Cartão flutuante — o onPress vazio impede que o toque feche ao tocar dentro. */}
          <Pressable style={styles.modalCartao} onPress={() => {}}>
            <View style={styles.modalCabecalho}>
              <TouchableOpacity
                onPress={voltar}
                hitSlop={10}
                accessibilityLabel="Voltar"
              >
                <Ionicons name="arrow-back" size={22} color={cores.texto} />
              </TouchableOpacity>
              <Text style={styles.modalTitulo} numberOfLines={1}>
                {selecionado ? selecionado.nome : titulo}
              </Text>
              <TouchableOpacity
                onPress={fechar}
                hitSlop={10}
                accessibilityLabel="Fechar"
              >
                <Ionicons name="close" size={24} color={cores.texto} />
              </TouchableOpacity>
            </View>

            {selecionado ? (
              <>
                <DetalheColaboradorMes
                  colaborador={selecionado}
                  tipo={tipo}
                  inicio={inicio}
                  fim={fim}
                />
                <Botao
                  titulo="Voltar"
                  variante="secundario"
                  aoPressionar={() => setSelecionado(null)}
                />
              </>
            ) : (
              <>
                <ResumoAnaliticaTopo
                  dados={dados}
                  unidade={unidade}
                  rotuloTaxa={rotuloTaxa}
                  rotuloDiaPior={rotuloDiaPior}
                />

                <Text style={styles.faltasSubtitulo}>
                  Toque num colaborador para ver os detalhes
                </Text>

                <ScrollView
                  style={styles.modalLista}
                  contentContainerStyle={{ paddingVertical: espacamento.xs }}
                >
                  {dados.porOperador.map((o) => (
                    <FaltaOperadorRow
                      key={o.id}
                      o={o}
                      onPress={() => setSelecionado(o)}
                    />
                  ))}
                </ScrollView>

                <Text style={styles.faltasRodape}>
                  🔴 alto · 🟡 médio · 🟢 baixo risco — por taxa, padrão e
                  tendência.
                </Text>
                <Botao
                  titulo="Voltar"
                  variante="secundario"
                  aoPressionar={fechar}
                />
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export function OperadoresScreen(): React.ReactElement {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { podeAcessar, perfil } = useAuth();
  const { dataInicial } = useConfigSistema();
  const podeProgramarFuturo = perfil
    ? ['GERENTE', 'ADMINISTRADOR', 'SUPERVISOR'].includes(perfil)
    : false;

  // Relógio em tempo real (HH:MM:SS, Brasília).
  const [relogio, setRelogio] = useState(relogioBrasilia());
  useEffect(() => {
    const id = setInterval(() => setRelogio(relogioBrasilia()), 1000);
    return () => clearInterval(id);
  }, []);

  const [diaSel, setDiaSel] = useState(hojeISO());
  const dia = useRequisicao<DiaOperadores>(
    () => operadoresService.dia(diaSel),
    [diaSel],
  );
  const dados = dia.dados;

  // Escala de FISCAIS do mesmo dia (exibida ACIMA dos operadores). Defensivo:
  // só busca se o perfil pode ver a escala; em erro, a seção simplesmente some.
  const diaSemanaSel = new Date(`${diaSel}T12:00:00Z`).getUTCDay();
  const escalaFiscais = useRequisicao<ItemEscalaConsolidada[]>(
    () =>
      podeAcessar('ESCALA_VISUALIZAR')
        ? escalaService.consolidada(diaSemanaSel, diaSel).catch(() => [])
        : Promise.resolve([] as ItemEscalaConsolidada[]),
    [diaSel],
  );

  // Status AO VIVO dos fiscais (fiscalId → status), derivado das batidas do
  // ponto (ponte de status). Carrega o painel e assina atualizações em tempo
  // real; o selo só é exibido quando o dia selecionado é hoje.
  const [statusFiscais, setStatusFiscais] = useState<
    Record<string, StatusFiscal>
  >({});
  const conexaoFiscaisRef = useRef<ConexaoFiscais | null>(null);
  useEffect(() => {
    let ativo = true;
    const carregarPainel = () => {
      fiscaisService
        .painel()
        .then((p) => {
          if (!ativo) return;
          const mapa: Record<string, StatusFiscal> = {};
          for (const f of p) mapa[f.fiscalId] = f.status;
          setStatusFiscais(mapa);
        })
        .catch(() => {
          /* status ao vivo é complementar; falha não quebra a escala */
        });
    };
    carregarPainel();
    // Reconsulta periódica: transições por TEMPO (fim do turno, ou intervalo
    // além do máximo sem retorno) NÃO geram batida de ponto, então o WebSocket
    // sozinho deixaria o selo preso no último valor (ex.: "Intervalo"). A cada
    // 60s o painel volta a refletir o estado real (igual à jornada).
    const intervalo = setInterval(carregarPainel, 60_000);
    void conectarPainelFiscais({
      aoAtualizarStatus: (ev) =>
        setStatusFiscais((prev) => ({ ...prev, [ev.fiscalId]: ev.status })),
    }).then((c) => {
      if (ativo) conexaoFiscaisRef.current = c;
      else c.desconectar();
    });
    return () => {
      ativo = false;
      clearInterval(intervalo);
      conexaoFiscaisRef.current?.desconectar();
      conexaoFiscaisRef.current = null;
    };
  }, []);

  const aoVivo = useRequisicao<AoVivoOperadores>(() => operadoresService.aoVivo(), []);

  const mes = mesAtualISO();
  const analitica = useRequisicao<AnaliticaFaltas>(
    () => operadoresService.analiticaFaltas(mes.inicio, mes.fim),
    [],
  );

  // Não-retornos do MÊS — mesma inteligência/semáforo das faltas do mês.
  const naoRetornosMes = useRequisicao<AnaliticaFaltas>(
    () => operadoresService.analiticaNaoRetornos(mes.inicio, mes.fim),
    [],
  );

  // Não-retornos do DIA selecionado (incidências com id, para marcar/desmarcar).
  const naoRetornosDia = useRequisicao<IncidenciaEscala[]>(
    () =>
      escalaService
        .listarIncidencias({
          tipo: 'NAO_RETORNO_INTERVALO',
          inicio: diaSel,
          fim: diaSel,
        })
        .catch(() => [] as IncidenciaEscala[]),
    [diaSel],
  );

  // Faltas do DIA selecionado (de QUALQUER colaborador, inclusive fiscais) —
  // usado para refletir/alternar a falta dos fiscais na escala, já que eles não
  // fazem parte do roster de operadores.
  const faltasDia = useRequisicao<AusenciaDetalhada[]>(
    () =>
      podeAcessar('OPERADORES_AUSENCIAS')
        ? operadoresService.listarAusencias(diaSel, diaSel).catch(() => [])
        : Promise.resolve([] as AusenciaDetalhada[]),
    [diaSel],
  );

  // Mapa colaborador → id da incidência de não-retorno do dia (para alternar) e
  // o conjunto de quem está "sem retorno" hoje (para pintar a linha e contar).
  const incidenciasDia = naoRetornosDia.dados ?? [];
  const semRetornoPorColab = new Map<string, string>();
  for (const i of incidenciasDia) {
    if (!semRetornoPorColab.has(i.colaboradorId)) {
      semRetornoPorColab.set(i.colaboradorId, i.id);
    }
  }
  const semRetornoIds = new Set(semRetornoPorColab.keys());

  // Mapa colaboradorId → id da ausência do dia (para alternar a falta dos
  // fiscais, que não estão no roster de operadores).
  const ausenciaPorColab = new Map<string, string>();
  for (const a of faltasDia.dados ?? []) {
    if (!ausenciaPorColab.has(a.pessoaId)) ausenciaPorColab.set(a.pessoaId, a.id);
  }

  // Sinal para recarregar a lista de Justificativas em tempo real.
  const [versaoJustificativas, setVersaoJustificativas] = useState(0);

  const recarregarTudo = () => {
    dia.recarregar();
    aoVivo.recarregar();
    analitica.recarregar();
    naoRetornosMes.recarregar();
    naoRetornosDia.recarregar();
    faltasDia.recarregar();
    escalaFiscais.recarregar();
    setVersaoJustificativas((v) => v + 1);
  };

  /** Toca na linha → abre o perfil do colaborador. */
  const abrirPerfil = (c: ColaboradorDia) => {
    navigation.navigate('PerfilColaborador', { colaboradorId: c.id });
  };

  const podeGerirAusencias = podeAcessar('OPERADORES_AUSENCIAS');
  const ehHoje = diaSel === hojeISO();
  const coberturaBaixa = dados ? dados.trabalhando < COBERTURA_MINIMA : false;

  // Fiscais: quem trabalha hoje fica no topo; os de folga vão para um card no
  // fim ("Folga fiscais"), junto com os operadores de folga.
  const fiscaisDados = escalaFiscais.dados ?? [];
  const fiscaisTrabalham = fiscaisDados.filter((f) => f.efetiva !== 'FOLGA');
  const fiscaisFolga = fiscaisDados.filter((f) => f.efetiva === 'FOLGA');
  const operadoresFolga = (dados?.colaboradores ?? []).filter(
    (c) => c.status === 'FOLGA',
  );

  return (
    <Tela aoAtualizar={recarregarTudo} atualizando={dia.atualizando}>
      {/* Acesso ao log de jornada de toda a equipe (só gestores). Antes ficava
          na aba Fiscais (removida); agora vive aqui, junto da escala. */}
      {podeAcessar('FISCAIS_JORNADA') ? (
        <Pressable
          onPress={() => navigation.navigate('JornadaFiscais')}
          style={styles.linkJornada}
        >
          <Ionicons name="time-outline" size={20} color={cores.primaria} />
          <Text style={styles.linkJornadaTexto}>Ver jornada da equipe</Text>
          <Ionicons name="chevron-forward" size={18} color={cores.textoSecundario} />
        </Pressable>
      ) : null}

      {/* Domingo: rodízio de grupos. Mostra quem folga e quem trabalha nesse
          domingo (ou avisa que o rodízio ainda não foi configurado). */}
      {dados?.diaSemana === 0 ? (
        dados.grupoFolgaDomingo ? (
          <View style={styles.domingoBanner}>
            <Ionicons name="sync-outline" size={18} color={cores.primaria} />
            <Text style={styles.domingoBannerTexto}>
              Domingo · Folga{' '}
              <Text style={styles.domingoForte}>{dados.grupoFolgaDomingo}</Text>
              {'  ·  '}Trabalham {gruposQueTrabalhamDomingo(dados.grupoFolgaDomingo)}
            </Text>
          </View>
        ) : (
          <View style={[styles.domingoBanner, styles.domingoBannerAviso]}>
            <Ionicons name="information-circle-outline" size={18} color={cores.amarelo} />
            <Text style={styles.domingoBannerTexto}>
              Rodízio de domingo ainda não configurado. Defina o ponto de partida
              em Centro de Controle › Rodízio de domingo.
            </Text>
          </View>
        )
      ) : null}

      {/* Tablero "ao vivo": quem deveria estar agora */}
      {aoVivo.dados ? (
        <Cartao titulo="Agora no caixa">
          <View style={styles.aoVivoTopo}>
            <View style={styles.aoVivoRelogio}>
              <Text style={styles.aoVivoHora}>{relogio}</Text>
              <Text style={styles.aoVivoLegenda}>agora</Text>
            </View>
            <View style={styles.aoVivoNumeros}>
              <Text style={styles.aoVivoDisponiveis}>
                {aoVivo.dados.disponiveis}
                <Text style={styles.aoVivoEsperados}>
                  {' '}
                  / {aoVivo.dados.esperados}
                </Text>
              </Text>
              <Text style={styles.aoVivoLegenda}>disponíveis no caixa</Text>
            </View>
          </View>
          {aoVivo.dados.esperados > 0 ? (
            <View style={styles.barraTrilha}>
              <View
                style={[
                  styles.barraPreenchida,
                  {
                    width: `${Math.round(
                      (aoVivo.dados.disponiveis / aoVivo.dados.esperados) * 100,
                    )}%` as `${number}%`,
                    backgroundColor:
                      aoVivo.dados.faltas > 0 || aoVivo.dados.semRetorno > 0
                        ? cores.amarelo
                        : cores.verde,
                  },
                ]}
              />
            </View>
          ) : null}
          {aoVivo.dados.faltas > 0 ? (
            <Aviso
              texto={`${aoVivo.dados.faltas} de ${aoVivo.dados.esperados} faltaram nesta franja: ${aoVivo.dados.listaFaltantes
                .map((f) => f.nome.split(/\s+/)[0])
                .join(', ')}.`}
            />
          ) : null}
          {aoVivo.dados.semRetorno > 0 ? (
            <Aviso
              texto={`${aoVivo.dados.semRetorno} não retornaram do intervalo (fora do caixa): ${aoVivo.dados.listaSemRetorno
                .map((f) => f.nome.split(/\s+/)[0])
                .join(', ')}.`}
            />
          ) : null}
          {aoVivo.dados.faltas === 0 && aoVivo.dados.semRetorno === 0 ? (
            aoVivo.dados.esperados > 0 ? (
              <Text style={styles.aoVivoOk}>Todos presentes nesta franja. 👏</Text>
            ) : (
              <Text style={styles.aoVivoOk}>Fora do horário de operação.</Text>
            )
          ) : null}
        </Cartao>
      ) : null}

      <SeletorData
        valor={diaSel}
        aoMudar={setDiaSel}
        rotulo="Dia"
        dataMinima={dataInicial}
      />

      {/* Ausências a prazo: ausentar um colaborador por um período (férias/
          licença) — cria faltas justificadas em cada dia da escala. Programar
          um período futuro é ação de gestão. */}
      {podeProgramarFuturo ? (
        <AusenciasAPrazoCard aoRegistrado={recarregarTudo} />
      ) : null}

      {/* Fiscais que TRABALHAM hoje (escala) — acima dos operadores.
          Os de folga vão para o card "Folga fiscais" no fim. */}
      {fiscaisTrabalham.length > 0 ? (
        <View>
          <View style={styles.secaoHeader}>
            <Text style={styles.secaoTitulo}>Fiscais</Text>
            <View style={styles.secaoBadge}>
              <Text style={styles.secaoBadgeTexto}>{fiscaisTrabalham.length}</Text>
            </View>
          </View>
          {fiscaisTrabalham.map((f) => {
            const cd = fiscalComoColaboradorDia(
              f,
              f.colaboradorId
                ? (ausenciaPorColab.get(f.colaboradorId) ?? null)
                : null,
            );
            if (!cd) return <FiscalSemFichaRow key={f.funcionarioId} f={f} />;
            return (
              <ColaboradorRow
                key={f.funcionarioId}
                c={cd}
                onAbrirPerfil={abrirPerfil}
                semRetornoAtivo={semRetornoIds.has(cd.id)}
                statusAoVivo={ehHoje ? (statusFiscais[f.funcionarioId] ?? null) : null}
              />
            );
          })}
        </View>
      ) : null}

      {dia.carregando ? (
        <Carregando />
      ) : dia.erro ? (
        <MensagemErro mensagem={dia.erro} aoTentarNovamente={dia.recarregar} />
      ) : !dados || dados.colaboradores.length === 0 ? (
        <EstadoVazio
          icone="people-outline"
          titulo="Sem operadores"
          descricao="Nenhum operador no quadro ainda."
        />
      ) : (
        <>
          {/* Cabeçalho do dia + resumo */}
          <Cartao>
            <Text style={styles.diaTitulo}>
              {ehHoje ? 'Hoje · ' : ''}
              {NOMES_DIA_LONGO[dados.diaSemana]}, {formatarData(dados.dataISO)}
            </Text>
            {(() => {
              const semRetornoNoDia = dados.colaboradores.filter(
                (c) => c.status !== 'FALTA' && semRetornoIds.has(c.id),
              ).length;
              return (
                <View style={styles.resumoLinha}>
                  <Resumo
                    valor={dados.trabalhando}
                    rotulo="Trabalham"
                    cor={cores.verde}
                  />
                  <Resumo valor={dados.faltas} rotulo="Faltas" cor={cores.vermelho} />
                  <Resumo
                    valor={semRetornoNoDia}
                    rotulo="Sem retorno"
                    cor={cores.primaria}
                  />
                  <Resumo
                    valor={dados.folgas}
                    rotulo="Folgas"
                    cor={cores.textoSecundario}
                  />
                </View>
              );
            })()}

            {/* Conteo por turno (pela hora de entrada) */}
            <Text style={styles.turnoLabel}>Por turno</Text>
            <View style={styles.resumoLinha}>
              {(() => {
                const ct = contarTurnos(dados.colaboradores);
                return (
                  <>
                    <Resumo valor={ct.ABERTURA} rotulo="Abertura" cor={cores.verde} />
                    <Resumo
                      valor={ct.INTERMEDIARIO}
                      rotulo="Intermediário"
                      cor={cores.verde}
                    />
                    <Resumo valor={ct.FECHAMENTO} rotulo="Fechamento" cor={cores.verde} />
                    {ct.APOIO > 0 ? (
                      <Resumo valor={ct.APOIO} rotulo="Apoio" cor={cores.verde} />
                    ) : null}
                    {ct.SEM_TURNO > 0 ? (
                      <Resumo
                        valor={ct.SEM_TURNO}
                        rotulo="Sem turno"
                        cor={cores.laranja}
                      />
                    ) : null}
                  </>
                );
              })()}
            </View>
            {coberturaBaixa ? (
              <Aviso
                texto={`Cobertura baixa: ${dados.trabalhando} no caixa (mínimo ${COBERTURA_MINIMA}).`}
              />
            ) : null}
            <Text style={styles.dica}>
              Ordenados por hora de entrada · folgas ao fim. Toque no operador
              para ver o perfil. Faltas e não-retornos são detectados
              automaticamente pelo ponto (falta sem registro fica vermelha; quem
              não retorna do intervalo fica azul e sai do caixa).
            </Text>
          </Cartao>

          {/* Lista de colaboradores agrupada por turno */}
          {TURNOS.map((t) => {
            const itens = dados.colaboradores.filter((c) => turnoDe(c) === t.chave);
            if (itens.length === 0) return null;
            return (
              <View key={t.chave}>
                <View style={styles.secaoHeader}>
                  <Text style={styles.secaoTitulo}>{t.titulo}</Text>
                  <View style={styles.secaoBadge}>
                    <Text style={styles.secaoBadgeTexto}>{itens.length}</Text>
                  </View>
                </View>
                {itens.map((c) => (
                  <ColaboradorRow
                    key={c.id}
                    c={c}
                    onAbrirPerfil={abrirPerfil}
                    semRetornoAtivo={semRetornoIds.has(c.id)}
                  />
                ))}
              </View>
            );
          })}

          {/* Cards do DIA (faltas e não-retornos do dia selecionado) */}
          <Cartao titulo="Faltas do dia">
            {(() => {
              const faltantes = dados.colaboradores.filter(
                (c) => c.status === 'FALTA',
              );
              if (faltantes.length === 0) {
                return <Text style={styles.dica}>Nenhuma falta hoje. 👏</Text>;
              }
              return (
                <>
                  <Text style={styles.faltasTotal}>
                    {faltantes.length} falta{faltantes.length === 1 ? '' : 's'}
                  </Text>
                  {faltantes.map((c) => (
                    <View key={c.id} style={styles.faltaItem}>
                      <View style={styles.faltaItemInfo}>
                        <Text style={styles.faltaNomeFull} numberOfLines={1}>
                          {c.nome}
                        </Text>
                      </View>
                    </View>
                  ))}
                </>
              );
            })()}
          </Cartao>

          <Cartao titulo="Não-retorno do dia">
            {(() => {
              if (incidenciasDia.length === 0) {
                return (
                  <Text style={styles.dica}>Nenhum não-retorno hoje.</Text>
                );
              }
              const nomePorId = new Map(
                dados.colaboradores.map((c) => [c.id, c.nome]),
              );
              return (
                <>
                  <Text style={styles.faltasTotal}>
                    {incidenciasDia.length} não-retorno
                    {incidenciasDia.length === 1 ? '' : 's'}
                  </Text>
                  {incidenciasDia.map((i) => (
                    <View key={i.id} style={styles.faltaItem}>
                      <View style={styles.faltaItemInfo}>
                        <Text style={styles.faltaNomeFull} numberOfLines={1}>
                          {nomePorId.get(i.colaboradorId) ?? i.colaboradorId}
                        </Text>
                      </View>
                    </View>
                  ))}
                </>
              );
            })()}
          </Cartao>

          {/* Análise inteligente de faltas do mês (toque abre o mês inteiro) */}
          {analitica.dados && analitica.dados.total > 0 ? (
            <PainelAnaliticaMes
              titulo="Faltas do mês"
              dados={analitica.dados}
              unidade="falta(s)"
              rotuloTaxa="Absenteísmo"
              rotuloDiaPior="Dia com mais faltas"
              tipo="FALTA"
              inicio={mes.inicio}
              fim={mes.fim}
            />
          ) : null}

          {/* Análise inteligente de não-retornos do mês (toque abre o mês inteiro) */}
          {naoRetornosMes.dados && naoRetornosMes.dados.total > 0 ? (
            <PainelAnaliticaMes
              titulo="Não-retornos do mês"
              dados={naoRetornosMes.dados}
              unidade="não-retorno(s)"
              rotuloTaxa="Taxa"
              rotuloDiaPior="Dia com mais não-retornos"
              tipo="NAO_RETORNO"
              inicio={mes.inicio}
              fim={mes.fim}
            />
          ) : null}

          {/* Justificativas (faltas + não-retornos) — abaixo do painel de faltas */}
          {podeGerirAusencias ? (
            <View style={styles.justificativasSecao}>
              <View style={styles.secaoHeader}>
                <Text style={styles.secaoTitulo}>Justificativas</Text>
              </View>
              <Text style={styles.dica}>
                Faltas e não-retornos dos últimos 30 dias — justifique, marque
                como não justificada ou reabra.
              </Text>
              <JustificativasLista versao={versaoJustificativas} />
            </View>
          ) : null}
        </>
      )}

      {/* Folga do dia — em cards separados por papel, no fim da tela */}
      {operadoresFolga.length > 0 ? (
        <Cartao titulo="Folga operadores">
          {operadoresFolga.map((c) => (
            <FolgaItem
              key={c.id}
              nome={c.nome}
              icone={iconeGenero(c.genero, c.nome)}
            />
          ))}
        </Cartao>
      ) : null}
      {fiscaisFolga.length > 0 ? (
        <Cartao titulo="Folga fiscais">
          {fiscaisFolga.map((f) => (
            <FolgaItem
              key={f.funcionarioId}
              nome={f.nome ?? f.funcionarioId}
              icone="shield-checkmark"
            />
          ))}
        </Cartao>
      ) : null}
    </Tela>
  );
}

function Resumo({
  valor,
  rotulo,
  cor,
}: {
  valor: number;
  rotulo: string;
  cor: string;
}): React.ReactElement {
  return (
    <View style={styles.resumoBox}>
      <Text style={[styles.resumoValor, { color: cor }]}>{valor}</Text>
      <Text style={styles.resumoRotulo}>{rotulo}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Ao vivo
  aoVivoTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.lg,
    marginBottom: espacamento.sm,
  },
  aoVivoRelogio: {
    alignItems: 'center',
  },
  aoVivoHora: {
    fontSize: 24,
    fontWeight: '700',
    color: cores.primaria,
    fontVariant: ['tabular-nums'],
  },
  aoVivoNumeros: {
    flex: 1,
  },
  aoVivoDisponiveis: {
    fontSize: 28,
    fontWeight: '700',
    color: cores.verde,
  },
  aoVivoEsperados: {
    fontSize: 18,
    fontWeight: '600',
    color: cores.textoSecundario,
  },
  aoVivoLegenda: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  aoVivoOk: {
    ...tipografia.corpo,
    color: cores.verde,
    fontWeight: '600',
  },
  barraTrilha: {
    width: '100%',
    height: 8,
    borderRadius: raio.pill,
    backgroundColor: cores.divisor,
    overflow: 'hidden',
    marginBottom: espacamento.sm,
  },
  barraPreenchida: {
    height: '100%',
    borderRadius: raio.pill,
  },
  // Cabeçalho do dia
  diaTitulo: {
    ...tipografia.secao,
    color: cores.texto,
    marginBottom: espacamento.md,
  },
  resumoLinha: {
    flexDirection: 'row',
    gap: espacamento.sm,
    marginBottom: espacamento.sm,
  },
  turnoLabel: {
    ...tipografia.legenda,
    fontWeight: '700',
    color: cores.textoSecundario,
    marginBottom: espacamento.xs,
  },
  resumoBox: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: cores.superficieAlternativa,
    borderRadius: raio.md,
    paddingVertical: espacamento.sm,
  },
  resumoValor: {
    ...tipografia.titulo,
    fontWeight: '700',
  },
  resumoRotulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  dica: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    fontStyle: 'italic',
  },
  justificativasSecao: {
    marginTop: espacamento.md,
  },
  // Seção (turno)
  secaoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    marginTop: espacamento.md,
    marginBottom: espacamento.xs,
  },
  secaoTitulo: {
    ...tipografia.rotulo,
    fontWeight: '700',
    color: cores.texto,
  },
  secaoBadge: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: raio.pill,
    backgroundColor: cores.divisor,
    alignItems: 'center',
  },
  secaoBadgeTexto: {
    fontSize: 11,
    fontWeight: '700',
    color: cores.textoSecundario,
  },
  // Linha de colaborador
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: cores.superficie,
    borderRadius: raio.md,
    borderLeftWidth: 3,
    paddingVertical: espacamento.sm,
    paddingHorizontal: espacamento.md,
    marginBottom: espacamento.xs,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linhaInfo: {
    flex: 1,
    paddingHorizontal: espacamento.sm,
  },
  nomeColaborador: {
    ...tipografia.corpo,
    fontWeight: '600',
    color: cores.texto,
  },
  horarioInline: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 1,
  },
  statusVivoLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  statusVivoDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusVivoTexto: {
    ...tipografia.legenda,
    fontWeight: '700',
  },
  linkJornada: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    backgroundColor: cores.superficie,
    borderRadius: raio.lg,
    padding: espacamento.lg,
    marginBottom: espacamento.md,
  },
  domingoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    backgroundColor: cores.primariaClara,
    borderRadius: raio.md,
    padding: espacamento.md,
    marginBottom: espacamento.md,
  },
  domingoBannerAviso: {
    backgroundColor: cores.amareloFundo ?? '#FBF3DA',
  },
  domingoBannerTexto: {
    ...tipografia.legenda,
    color: cores.texto,
    flex: 1,
  },
  domingoForte: {
    fontWeight: '700',
    color: cores.primaria,
  },
  linkJornadaTexto: {
    ...tipografia.rotulo,
    color: cores.texto,
    flex: 1,
  },
  acoesDireita: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 4,
  },
  chip: {
    paddingHorizontal: espacamento.sm,
    paddingVertical: 3,
    borderRadius: raio.pill,
    minWidth: 64,
    alignItems: 'center',
  },
  chipTexto: {
    fontSize: 11,
    fontWeight: '700',
  },
  // Botões de ação (Falta / Sem retorno) — mesmo tamanho, discretos.
  btnAcao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: espacamento.sm,
    paddingVertical: 4,
    borderRadius: raio.pill,
    borderWidth: 1,
    minWidth: 82,
  },
  btnFalta: {
    borderColor: cores.vermelho,
    backgroundColor: 'rgba(210,59,59,0.10)',
  },
  btnFaltaAtiva: {
    borderColor: cores.vermelho,
    backgroundColor: cores.vermelho,
  },
  btnSemRetorno: {
    borderColor: cores.primaria,
    backgroundColor: cores.primariaClara,
  },
  btnSemRetornoAtiva: {
    borderColor: cores.primaria,
    backgroundColor: cores.primaria,
  },
  btnAcaoTexto: {
    fontSize: 11,
    fontWeight: '700',
  },
  // Folga (cards no fim, compactos)
  folgaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    paddingVertical: espacamento.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  folgaAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: cores.divisor,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folgaNome: {
    ...tipografia.corpo,
    color: cores.texto,
    flex: 1,
  },
  folgaTag: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    fontWeight: '700',
  },
  // Faltas
  faltasTopo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: espacamento.xs,
  },
  faltasTotal: {
    ...tipografia.titulo,
    color: cores.texto,
  },
  faltasLegenda: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 1,
  },
  faltasTend: {
    ...tipografia.legenda,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right',
    maxWidth: '50%',
  },
  faltasDica: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
    marginBottom: espacamento.sm,
  },
  faltasSubtitulo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
    marginBottom: espacamento.xs,
  },
  faltaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    paddingVertical: espacamento.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  riscoDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  faltaItemInfo: {
    flex: 1,
  },
  faltaNomeFull: {
    ...tipografia.corpo,
    fontWeight: '600',
    color: cores.texto,
  },
  faltaTags: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 1,
  },
  faltaNums: {
    alignItems: 'flex-end',
    minWidth: 48,
  },
  faltaQtdFull: {
    ...tipografia.rotulo,
    fontWeight: '700',
    color: cores.texto,
  },
  faltaTaxa: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  faltasRodape: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    fontStyle: 'italic',
    marginTop: espacamento.sm,
  },
  // Painel mensal (resumo tocável + modal flutuante)
  painelAbrir: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacamento.xs,
    marginTop: espacamento.sm,
  },
  painelAbrirTexto: {
    ...tipografia.rotulo,
    color: cores.primaria,
  },
  modalFundo: {
    flex: 1,
    backgroundColor: 'rgba(10,37,64,0.45)',
    justifyContent: 'center',
    padding: espacamento.lg,
  },
  modalCartao: {
    backgroundColor: cores.superficie,
    borderRadius: raio.lg,
    padding: espacamento.lg,
    maxHeight: '82%',
    ...sombra.flutuante,
  },
  modalCabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.md,
    marginBottom: espacamento.md,
  },
  modalTitulo: {
    ...tipografia.subtitulo,
    color: cores.texto,
    flex: 1,
  },
  modalLista: {
    marginTop: espacamento.sm,
  },
  // Detalhe do colaborador no painel mensal (drill-down)
  detalheItem: {
    paddingVertical: espacamento.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
    gap: 2,
  },
  detalheLinhaTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: espacamento.xs,
  },
  detalheData: {
    ...tipografia.corpo,
    fontWeight: '600',
    color: cores.texto,
  },
  detalheInfo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  detalheAdvertencia: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    marginTop: 2,
  },
  detalheAdvertenciaTexto: {
    ...tipografia.legenda,
    fontWeight: '600',
  },
  // Gestão
  linhaHorarios: {
    flexDirection: 'row',
    gap: espacamento.sm,
  },
  horarioInput: {
    flex: 1,
  },
  rotuloFolga: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
    marginBottom: espacamento.xs,
  },
  chipsFolga: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.xs,
    marginBottom: espacamento.sm,
  },
  chipFolga: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    paddingVertical: espacamento.xs,
    paddingHorizontal: espacamento.sm,
    borderRadius: raio.pill,
    backgroundColor: cores.divisor,
    overflow: 'hidden',
  },
  chipFolgaAtivo: {
    backgroundColor: cores.primaria,
    color: cores.textoInverso,
  },
});

export default OperadoresScreen;
