/**
 * Resumo do dia (Centro de Mando embutido no topo da Home).
 *
 * Em vez de ser uma seção separada, aparece **acima de todas as áreas** na tela
 * inicial: a saúde do negócio e as 3 prioridades do dia. É a cara da "gestão
 * inteligente" logo na abertura do app.
 *
 * Fase 1 — sem IA: tudo calculado por REGRAS sobre dados que o backend já
 * fornece, de forma defensiva (se um serviço falhar, os demais continuam).
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { arrecadacaoService, insumosService, vendasService } from '../../api/services';
import {
  InsumoProativo,
  PainelVendas,
  StatusArrecadacao,
  StatusVendas,
  TipoArrecadacao,
} from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Cartao } from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { hojeISO } from '../../utils/formato';
import { ROTULO_TIPO_ARRECADACAO } from '../../utils/rotulos';

/** Rotas para onde o atalho "Resolver" pode levar. */
type RotaAtalho = 'Importacoes' | 'Insumos' | 'PainelVendas';

interface AcaoPrioritaria {
  prioridade: 'alta' | 'media';
  titulo: string;
  detalhe: string;
  rota: RotaAtalho;
  funcionalidade: string;
}

interface ResumoSaude {
  nota: number;
  cor: string;
  fundo: string;
  rotulo: string;
}

interface Props {
  /** Navega para uma área quando o gestor toca em "Resolver". */
  aoNavegar: (rota: RotaAtalho) => void;
}

function calcularSaude(
  pendentes: number,
  criticos: number,
  metaAbaixo: boolean,
): ResumoSaude {
  const nota = Math.max(
    0,
    Math.min(100, 100 - pendentes * 8 - criticos * 10 - (metaAbaixo ? 15 : 0)),
  );
  if (nota >= 80) {
    return { nota, cor: cores.verde, fundo: cores.verdeFundo, rotulo: 'Tudo em ordem' };
  }
  if (nota >= 60) {
    return {
      nota,
      cor: cores.amarelo,
      fundo: cores.amareloFundo,
      rotulo: 'Atenção em alguns pontos',
    };
  }
  return { nota, cor: cores.vermelho, fundo: cores.vermelhoFundo, rotulo: 'Requer sua ação' };
}

export function ResumoDoDia({ aoNavegar }: Props): React.ReactElement | null {
  const { podeAcessar } = useAuth();

  const req = useRequisicao(async () => {
    const hoje = hojeISO();
    const [arrecadacao, vendasStatus, painel, insumos] = await Promise.all([
      arrecadacaoService.status(hoje).catch(() => null as StatusArrecadacao | null),
      vendasService.status(hoje).catch(() => null as StatusVendas | null),
      vendasService.painel(hoje).catch(() => null as PainelVendas | null),
      insumosService.listarProativo().catch(() => [] as InsumoProativo[]),
    ]);
    return { arrecadacao, vendasStatus, painel, insumos };
  }, []);

  const dados = req.dados;
  // Enquanto carrega (ou se tudo falhar), não ocupa espaço: a Home segue limpa.
  if (!dados) {
    return null;
  }

  const { arrecadacao, vendasStatus, painel, insumos } = dados;

  const pendentesLabels: string[] = [];
  if (arrecadacao) {
    for (const tipo of Object.keys(arrecadacao) as TipoArrecadacao[]) {
      if (arrecadacao[tipo] === 'PENDENTE') {
        pendentesLabels.push(ROTULO_TIPO_ARRECADACAO[tipo] ?? tipo);
      }
    }
  }
  if (vendasStatus && !vendasStatus.enviado) {
    pendentesLabels.push('Vendas por hora');
  }

  const criticos = insumos.filter((i) => i.nivel === 'CRITICO');
  const metaAbaixo =
    painel != null && painel.projecaoVsMeta != null && painel.projecaoVsMeta < 0;

  const acoes: AcaoPrioritaria[] = [];
  if (pendentesLabels.length > 0) {
    acoes.push({
      prioridade: 'alta',
      titulo: `Falta carregar ${pendentesLabels.length} arquivo(s) hoje`,
      detalhe: pendentesLabels.slice(0, 3).join(', '),
      rota: 'Importacoes',
      funcionalidade: 'IMPORTACOES',
    });
  }
  if (criticos.length > 0) {
    acoes.push({
      prioridade: 'alta',
      titulo: `${criticos.length} insumo(s) em nível crítico`,
      detalhe: criticos.slice(0, 3).map((i) => i.nome).join(', '),
      rota: 'Insumos',
      funcionalidade: 'INSUMOS',
    });
  }
  if (metaAbaixo && painel) {
    const faltam = Math.abs(Math.round(painel.projecaoVsMeta ?? 0));
    acoes.push({
      prioridade: 'media',
      titulo: `Projeção ${faltam}% abaixo da meta do mês`,
      detalhe: `${Math.round(painel.metaProgresso * 100)}% da meta já atingido`,
      rota: 'PainelVendas',
      funcionalidade: 'PAINEL_VENDAS_VISUALIZAR',
    });
  }

  const top3 = [...acoes]
    .sort((a, b) => (a.prioridade === 'alta' ? 0 : 1) - (b.prioridade === 'alta' ? 0 : 1))
    .slice(0, 3);

  const saude = calcularSaude(pendentesLabels.length, criticos.length, metaAbaixo);

  return (
    <View style={styles.bloco}>
      <Text style={styles.secao}>Hoje</Text>

      {/* Saúde do negócio */}
      <Cartao>
        <View style={styles.saudeLinha}>
          <View style={[styles.medidor, { backgroundColor: saude.fundo }]}>
            <Text style={[styles.medidorNota, { color: saude.cor }]}>{saude.nota}</Text>
            <Text style={styles.medidorDe}>/ 100</Text>
          </View>
          <View style={styles.saudeTexto}>
            <Text style={styles.saudeMini}>SAÚDE DO NEGÓCIO</Text>
            <Text style={[styles.saudeRotulo, { color: saude.cor }]}>{saude.rotulo}</Text>
            <Text style={styles.saudeDica}>Com base nos dados de hoje.</Text>
          </View>
        </View>
      </Cartao>

      {/* As 3 coisas de hoje */}
      <Cartao titulo="As 3 coisas de hoje">
        {top3.length === 0 ? (
          <View style={styles.tudoOk}>
            <Ionicons name="checkmark-circle" size={20} color={cores.verde} />
            <Text style={styles.tudoOkTexto}>
              Tudo em ordem. Sem pendências para hoje. 🎉
            </Text>
          </View>
        ) : (
          top3.map((acao, i) => (
            <View key={i} style={styles.acao}>
              <View
                style={[
                  styles.bolinha,
                  {
                    backgroundColor:
                      acao.prioridade === 'alta' ? cores.vermelho : cores.amarelo,
                  },
                ]}
              />
              <View style={styles.acaoInfo}>
                <Text style={styles.acaoTitulo}>{acao.titulo}</Text>
                <Text style={styles.acaoDetalhe}>{acao.detalhe}</Text>
              </View>
              {podeAcessar(acao.funcionalidade) ? (
                <Pressable onPress={() => aoNavegar(acao.rota)} style={styles.botaoVer}>
                  <Text style={styles.botaoVerTexto}>Resolver</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        )}
      </Cartao>
    </View>
  );
}

const styles = StyleSheet.create({
  bloco: {
    marginBottom: espacamento.sm,
  },
  secao: {
    ...tipografia.secao,
    color: cores.texto,
    marginBottom: espacamento.md,
  },
  saudeLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.md,
  },
  medidor: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medidorNota: {
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 28,
  },
  medidorDe: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  saudeTexto: {
    flex: 1,
  },
  saudeMini: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    letterSpacing: 0.6,
  },
  saudeRotulo: {
    ...tipografia.secao,
    fontWeight: '800',
    marginTop: 2,
  },
  saudeDica: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  acao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    paddingVertical: espacamento.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
  },
  bolinha: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  acaoInfo: {
    flex: 1,
  },
  acaoTitulo: {
    ...tipografia.corpo,
    fontWeight: '700',
    color: cores.texto,
  },
  acaoDetalhe: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  botaoVer: {
    backgroundColor: cores.vermelhoFundo,
    paddingHorizontal: espacamento.md,
    paddingVertical: 6,
    borderRadius: raio.lg,
  },
  botaoVerTexto: {
    ...tipografia.legenda,
    fontWeight: '700',
    color: cores.vermelho,
  },
  tudoOk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
  },
  tudoOkTexto: {
    ...tipografia.corpo,
    color: cores.texto,
    flex: 1,
  },
});

export default ResumoDoDia;
