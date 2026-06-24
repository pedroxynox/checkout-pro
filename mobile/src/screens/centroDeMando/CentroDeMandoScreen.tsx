/**
 * Centro de Mando (Fase 1 — "gestão inteligente" sem IA cara).
 *
 * É a tela-resumo que cruza vários módulos e responde, de imediato:
 *  - Saúde do negócio: uma nota de 0 a 100 (verde/amarelo/vermelho).
 *  - As 3 coisas de hoje: as prioridades calculadas a partir dos dados reais
 *    (arquivos pendentes, insumos críticos e projeção de vendas vs. meta).
 *
 * Tudo é calculado por REGRAS sobre dados que o backend já fornece (sem IA),
 * de forma defensiva: se um serviço falhar, os demais continuam funcionando.
 * Numa fase futura, a Cluby (Gemini) pode narrar este resumo e responder
 * perguntas em linguagem natural.
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
import { Carregando, Cartao, MensagemErro, Tela } from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { PropsTela, RotaApp } from '../../navigation/types';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { hojeISO } from '../../utils/formato';
import { ROTULO_TIPO_ARRECADACAO } from '../../utils/rotulos';

/** Uma prioridade do dia, com a área para onde o gestor pode ir resolver. */
interface AcaoPrioritaria {
  prioridade: 'alta' | 'media';
  titulo: string;
  detalhe: string;
  rota?: Extract<RotaApp, 'Importacoes' | 'Insumos' | 'PainelVendas'>;
  funcionalidade?: string;
}

interface ResumoSaude {
  nota: number;
  cor: string;
  fundo: string;
  rotulo: string;
}

/** Deriva a nota e o rótulo da saúde a partir dos sinais coletados. */
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

export function CentroDeMandoScreen({
  navigation,
}: PropsTela<'CentroDeMando'>): React.ReactElement {
  const { podeAcessar, usuario } = useAuth();

  const req = useRequisicao(async () => {
    const hoje = hojeISO();
    // Cada chamada é tolerante a falha para não derrubar o painel inteiro.
    const [arrecadacao, vendasStatus, painel, insumos] = await Promise.all([
      arrecadacaoService.status(hoje).catch(() => null as StatusArrecadacao | null),
      vendasService.status(hoje).catch(() => null as StatusVendas | null),
      vendasService.painel(hoje).catch(() => null as PainelVendas | null),
      insumosService.listarProativo().catch(() => [] as InsumoProativo[]),
    ]);
    return { arrecadacao, vendasStatus, painel, insumos };
  }, []);

  function montarPainel(dados: NonNullable<typeof req.dados>) {
    const { arrecadacao, vendasStatus, painel, insumos } = dados;

    // 1) Arquivos do dia ainda pendentes (5 arrecadações + vendas).
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

    // 2) Insumos em nível crítico.
    const criticos = insumos.filter((i) => i.nivel === 'CRITICO');

    // 3) Projeção de vendas abaixo da meta.
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
    return { top3, saude };
  }

  function irPara(rota?: AcaoPrioritaria['rota']): void {
    if (rota) {
      navigation.navigate(rota as never);
    }
  }

  const primeiroNome = (usuario?.nome ?? usuario?.login ?? '').split(' ')[0];
  const dados = req.dados;

  return (
    <Tela aoAtualizar={req.recarregar} atualizando={req.atualizando}>
      <View style={styles.cabecalho}>
        <Text style={styles.saudacao}>
          {primeiroNome ? `Olá, ${primeiroNome}!` : 'Olá!'}
        </Text>
        <Text style={styles.subtitulo}>Seu centro de mando do dia</Text>
      </View>

      {req.carregando ? (
        <Carregando />
      ) : req.erro ? (
        <MensagemErro mensagem={req.erro} aoTentarNovamente={req.recarregar} />
      ) : dados ? (
        (() => {
          const { top3, saude } = montarPainel(dados);
          return (
            <>
              {/* Saúde do negócio */}
              <Cartao titulo="Saúde do negócio">
                <View style={styles.saudeLinha}>
                  <View style={[styles.medidor, { backgroundColor: saude.fundo }]}>
                    <Text style={[styles.medidorNota, { color: saude.cor }]}>
                      {saude.nota}
                    </Text>
                    <Text style={styles.medidorDe}>/ 100</Text>
                  </View>
                  <View style={styles.saudeTexto}>
                    <Text style={[styles.saudeRotulo, { color: saude.cor }]}>
                      {saude.rotulo}
                    </Text>
                    <Text style={styles.saudeDica}>
                      Atualizado agora, com base nos dados de hoje.
                    </Text>
                  </View>
                </View>
              </Cartao>

              {/* As 3 coisas de hoje */}
              <Cartao titulo="As 3 coisas de hoje">
                {top3.length === 0 ? (
                  <View style={styles.tudoOk}>
                    <Ionicons name="checkmark-circle" size={22} color={cores.verde} />
                    <Text style={styles.tudoOkTexto}>
                      Tudo em ordem por aqui. Sem pendências para hoje. 🎉
                    </Text>
                  </View>
                ) : (
                  top3.map((acao, i) => {
                    const podeIr = acao.funcionalidade
                      ? podeAcessar(acao.funcionalidade)
                      : false;
                    return (
                      <View key={i} style={styles.acao}>
                        <View
                          style={[
                            styles.bolinha,
                            {
                              backgroundColor:
                                acao.prioridade === 'alta'
                                  ? cores.vermelho
                                  : cores.amarelo,
                            },
                          ]}
                        />
                        <View style={styles.acaoInfo}>
                          <Text style={styles.acaoTitulo}>{acao.titulo}</Text>
                          <Text style={styles.acaoDetalhe}>{acao.detalhe}</Text>
                        </View>
                        {podeIr && acao.rota ? (
                          <Pressable
                            onPress={() => irPara(acao.rota)}
                            style={styles.botaoVer}
                          >
                            <Text style={styles.botaoVerTexto}>Resolver</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    );
                  })
                )}
              </Cartao>

              <Text style={styles.nota}>
                Em breve a Cluby vai resumir tudo isto em uma frase e responder às
                suas perguntas. Por enquanto, o painel já calcula suas prioridades.
              </Text>
            </>
          );
        })()
      ) : null}
    </Tela>
  );
}

const styles = StyleSheet.create({
  cabecalho: {
    marginBottom: espacamento.md,
  },
  saudacao: {
    ...tipografia.titulo,
    color: cores.texto,
  },
  subtitulo: {
    ...tipografia.corpo,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  saudeLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.md,
  },
  medidor: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medidorNota: {
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 32,
  },
  medidorDe: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  saudeTexto: {
    flex: 1,
  },
  saudeRotulo: {
    ...tipografia.secao,
    fontWeight: '800',
  },
  saudeDica: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 4,
  },
  acao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    paddingVertical: espacamento.md,
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
    paddingVertical: espacamento.sm,
  },
  tudoOkTexto: {
    ...tipografia.corpo,
    color: cores.texto,
    flex: 1,
  },
  nota: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    textAlign: 'center',
    marginTop: espacamento.sm,
    paddingHorizontal: espacamento.md,
  },
});

export default CentroDeMandoScreen;
