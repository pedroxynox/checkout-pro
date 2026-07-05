/**
 * Centro de Controle ▸ Reiniciar dados operacionais (Req 1.5).
 *
 * Ação administrativa e irreversível, restrita ao gestor (`ADMIN_DADOS`): apaga
 * todos os dados de movimento (vendas, arrecadação, estoque em movimento,
 * sacolas APAE, jornada/escala por data, notificações, checklists e fluxos
 * legados) e zera o saldo dos insumos numa única transação no backend,
 * conservando os cadastros (pessoas, escalas, insumos, configurações e metas).
 *
 * Exige uma confirmação explícita: o gestor precisa digitar "ZERAR" para
 * habilitar o botão e, em seguida, confirmar no diálogo. A validação de
 * verdade continua no backend, que também exige `confirmacao: "ZERAR"`.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { adminService, ResumoReinicio } from '../../api/services';
import { Aviso, Botao, CampoTexto, Cartao, Tela } from '../../components';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { confirmar, notificar } from '../../utils/dialogos';

/** Palavra-chave de confirmação exigida (igual ao backend). */
const PALAVRA_CONFIRMACAO = 'ZERAR';

/** Rótulos amigáveis por entidade do resumo (pt-BR). */
const ROTULO_ENTIDADE: Record<string, string> = {
  movimentos_lote_apae: 'Movimentos de sacolas APAE',
  lotes_apae: 'Lotes de sacolas APAE',
  movimentos_estoque: 'Movimentos de estoque',
  requisicoes: 'Requisições',
  sugestoes_pedido: 'Sugestões de pedido',
  registros_operacionais: 'Registros operacionais',
  registros_importacao: 'Importações',
  registros_ponto_fiscal: 'Registros de ponto',
  ausencias: 'Ausências',
  incidencias_escala: 'Incidências de escala',
  vendas_diarias: 'Vendas diárias',
  vendas_hora: 'Vendas por hora',
  registros_arrecadacao: 'Arrecadação',
  arrecadacao_sem_movimento: 'Arrecadação sem movimento',
  notificacoes: 'Notificações',
  mensagens_assistente: 'Mensagens do assistente',
  fechamentos_concluidos: 'Fechamentos concluídos',
  checklists: 'Checklists',
};

function rotuloEntidade(chave: string): string {
  return ROTULO_ENTIDADE[chave] ?? chave;
}

export function ReiniciarDadosScreen(): React.ReactElement {
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [resumo, setResumo] = useState<ResumoReinicio | null>(null);

  const confirmacaoOk = texto.trim().toUpperCase() === PALAVRA_CONFIRMACAO;

  const totalRemovido = useMemo(() => {
    if (!resumo) {
      return 0;
    }
    return Object.values(resumo).reduce((soma, n) => soma + (n ?? 0), 0);
  }, [resumo]);

  const linhasResumo = useMemo(() => {
    if (!resumo) {
      return [] as { chave: string; quantidade: number }[];
    }
    return Object.entries(resumo)
      .map(([chave, quantidade]) => ({ chave, quantidade: quantidade ?? 0 }))
      .sort((a, b) => b.quantidade - a.quantidade);
  }, [resumo]);

  const zerar = async () => {
    if (!confirmacaoOk || ocupado) {
      return;
    }
    const ok = await confirmar(
      'Zerar dados operacionais',
      'Esta ação é IRREVERSÍVEL: apaga todos os dados de movimento e zera o ' +
        'saldo dos insumos. Os cadastros são mantidos. Deseja continuar?',
      'Zerar tudo',
    );
    if (!ok) {
      return;
    }
    setOcupado(true);
    setResumo(null);
    try {
      const r = await adminService.zerarDados({
        confirmacao: PALAVRA_CONFIRMACAO,
      });
      setResumo(r);
      setTexto('');
      const total = Object.values(r).reduce((soma, n) => soma + (n ?? 0), 0);
      notificar(
        'Dados zerados',
        `Reinício concluído. ${total} registro(s) removido(s).`,
      );
    } catch (e) {
      notificar(
        'Erro',
        e instanceof ApiError ? e.message : 'Falha ao zerar os dados.',
      );
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Tela>
      <Aviso texto="⚠️ Ação irreversível. Apaga os dados de movimento e zera o saldo dos insumos. Os cadastros (pessoas, insumos, configurações e metas) são mantidos." />

      <Cartao titulo="Reiniciar o sistema">
        <Text style={styles.descricao}>
          Para confirmar, digite <Text style={styles.destaque}>ZERAR</Text> no
          campo abaixo e toque no botão.
        </Text>
        <CampoTexto
          rotulo="Confirmação"
          value={texto}
          onChangeText={setTexto}
          placeholder="Digite ZERAR"
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <Botao
          titulo="Zerar dados operacionais"
          variante="perigo"
          desabilitado={!confirmacaoOk}
          carregando={ocupado}
          aoPressionar={() => void zerar()}
        />
      </Cartao>

      {resumo ? (
        <Cartao titulo="Resumo do reinício">
          <Text style={styles.total}>
            {totalRemovido} registro(s) removido(s)
          </Text>
          {linhasResumo.length === 0 ? (
            <Text style={styles.descricao}>
              Nenhum dado de movimento para remover (sistema já estava zerado).
            </Text>
          ) : (
            linhasResumo.map((linha) => (
              <View key={linha.chave} style={styles.linha}>
                <Text style={styles.linhaRotulo}>
                  {rotuloEntidade(linha.chave)}
                </Text>
                <Text style={styles.linhaQtd}>{linha.quantidade}</Text>
              </View>
            ))
          )}
        </Cartao>
      ) : null}
    </Tela>
  );
}

const styles = StyleSheet.create({
  descricao: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.md,
  },
  destaque: {
    fontWeight: '800',
    color: cores.texto,
  },
  total: {
    ...tipografia.subtitulo,
    color: cores.texto,
    fontWeight: '700',
    marginBottom: espacamento.sm,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: espacamento.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
    borderRadius: raio.sm,
  },
  linhaRotulo: {
    ...tipografia.corpo,
    color: cores.texto,
    flex: 1,
    paddingRight: espacamento.sm,
  },
  linhaQtd: {
    ...tipografia.rotulo,
    fontWeight: '700',
    color: cores.textoSecundario,
  },
});

export default ReiniciarDadosScreen;
