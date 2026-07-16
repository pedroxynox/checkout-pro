/**
 * Central de Permissões — histórico de alterações (auditoria).
 *
 * Lista as mudanças de permissão mais recentes, por login e por perfil: quem
 * alterou, o alvo, a funcionalidade e o valor aplicado. Uso exclusivo do
 * Administrador (PERMISSOES_GERENCIAR).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { permissoesService } from '../../api/services';
import { ItemAuditoria } from '../../api/types';
import {
  Aviso,
  Cartao,
  Carregando,
  EstadoVazio,
  MensagemErro,
  Selo,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, tipografia } from '../../theme';
import { formatarDataHora } from '../../utils/formato';
import { rotuloDe } from './rotulos';

const ROTULO_PERFIL: Record<string, string> = {
  GERENTE: 'Gerente',
  ADMINISTRADOR: 'Administrador',
  SUPERVISOR: 'Supervisor',
  FISCAL: 'Fiscal',
  IMPORTADOR: 'Importador',
};

function descreverAcao(item: ItemAuditoria): string {
  if (item.acao === 'RESTAURACAO') {
    return 'Restaurou ao padrão';
  }
  const nome = rotuloDe(item.funcionalidade).titulo;
  return item.concedida ? `Concedeu "${nome}"` : `Removeu "${nome}"`;
}

export function PermissoesHistoricoScreen(): React.ReactElement {
  const historico = useRequisicao(() => permissoesService.historico(150), []);

  return (
    <Tela aoAtualizar={historico.recarregar} atualizando={historico.atualizando}>
      <Aviso texto="Registro das mudanças de permissão mais recentes (por login e por perfil)." />

      {historico.carregando ? (
        <Carregando />
      ) : historico.erro ? (
        <MensagemErro
          mensagem={historico.erro}
          aoTentarNovamente={historico.recarregar}
        />
      ) : !historico.dados || historico.dados.length === 0 ? (
        <EstadoVazio
          icone="time-outline"
          titulo="Sem alterações registradas"
          descricao="As mudanças de permissão aparecerão aqui."
        />
      ) : (
        historico.dados.map((item) => {
          const ehPerfil = item.tipoAlvo === 'PERFIL';
          const alvo = ehPerfil
            ? `Perfil ${ROTULO_PERFIL[item.perfilAlvo ?? ''] ?? item.perfilAlvo}`
            : (item.loginAlvo ?? 'Login');
          const concedida = item.acao !== 'RESTAURACAO' && item.concedida;
          return (
            <Cartao key={item.id}>
              <View style={styles.cabecalho}>
                <Text style={styles.alvo} numberOfLines={1}>
                  {alvo}
                </Text>
                <Selo
                  texto={ehPerfil ? 'Perfil' : 'Login'}
                  cor={ehPerfil ? cores.info : cores.primaria}
                  fundo={cores.primariaClara}
                />
              </View>
              <Text
                style={[
                  styles.acao,
                  item.acao !== 'RESTAURACAO'
                    ? concedida
                      ? styles.concedida
                      : styles.removida
                    : null,
                ]}
              >
                {descreverAcao(item)}
              </Text>
              <Text style={styles.meta}>
                {formatarDataHora(item.em)}
                {item.definidoPor ? ` · por ${item.definidoPor}` : ''}
              </Text>
            </Cartao>
          );
        })
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: espacamento.xs,
  },
  alvo: { ...tipografia.corpo, fontWeight: '700', color: cores.texto, flex: 1 },
  acao: { ...tipografia.corpo, color: cores.texto },
  concedida: { color: cores.verde },
  removida: { color: cores.vermelho },
  meta: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
});

export default PermissoesHistoricoScreen;
