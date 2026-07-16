/**
 * Central de Permissões — ajuste por login (Centro de Controle ▸ Permissões).
 *
 * Mostra as funcionalidades ajustáveis agrupadas por área, com um interruptor
 * cada. O perfil define o padrão; ligar/desligar cria um DESVIO por login. Ao
 * salvar, a pessoa precisa entrar de novo para valer as permissões novas.
 * Uso exclusivo do Administrador (PERMISSOES_GERENCIAR).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { permissoesService } from '../../api/services';
import { ItemPermissaoUsuario } from '../../api/types';
import {
  Aviso,
  Botao,
  Cartao,
  Carregando,
  MensagemErro,
  Selo,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { PropsTela } from '../../navigation/types';
import { cores, espacamento, tipografia } from '../../theme';
import { confirmar, notificar } from '../../utils/dialogos';
import { ORDEM_AREAS, rotuloDe } from './rotulos';

export function PermissoesUsuarioScreen({
  route,
  navigation,
}: PropsTela<'PermissoesUsuario'>): React.ReactElement {
  const { usuarioId, login, nome } = route.params;
  const dados = useRequisicao(
    () => permissoesService.doUsuario(usuarioId),
    [usuarioId],
  );

  // Conjunto de funcionalidades LIGADAS (edição local, aplicada ao salvar).
  const [ligadas, setLigadas] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);

  // Ao carregar (ou recarregar), inicializa os interruptores pelo estado atual.
  useEffect(() => {
    if (dados.dados) {
      setLigadas(
        new Set(
          dados.dados.itens.filter((i) => i.efetiva).map((i) => i.funcionalidade),
        ),
      );
    }
  }, [dados.dados]);

  const itens = useMemo(() => dados.dados?.itens ?? [], [dados.dados]);
  const padraoPorFunc = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const i of itens) {
      m.set(i.funcionalidade, i.padraoDoPerfil);
    }
    return m;
  }, [itens]);

  // Houve mudança em relação ao estado carregado?
  const alterado = useMemo(() => {
    if (!dados.dados) {
      return false;
    }
    const atualLigadas = new Set(
      dados.dados.itens.filter((i) => i.efetiva).map((i) => i.funcionalidade),
    );
    if (atualLigadas.size !== ligadas.size) {
      return true;
    }
    for (const f of ligadas) {
      if (!atualLigadas.has(f)) {
        return true;
      }
    }
    return false;
  }, [dados.dados, ligadas]);

  // Agrupa os itens por área, preservando a ordem do catálogo dentro da área.
  const porArea = useMemo(() => {
    const grupos = new Map<string, ItemPermissaoUsuario[]>();
    for (const item of itens) {
      const area = rotuloDe(item.funcionalidade).area;
      const lista = grupos.get(area) ?? [];
      lista.push(item);
      grupos.set(area, lista);
    }
    const areasOrdenadas = [
      ...ORDEM_AREAS.filter((a) => grupos.has(a)),
      ...[...grupos.keys()].filter((a) => !ORDEM_AREAS.includes(a)),
    ];
    return areasOrdenadas.map((area) => ({ area, itens: grupos.get(area) ?? [] }));
  }, [itens]);

  const alternar = (funcionalidade: string) => {
    setLigadas((prev) => {
      const proximo = new Set(prev);
      if (proximo.has(funcionalidade)) {
        proximo.delete(funcionalidade);
      } else {
        proximo.add(funcionalidade);
      }
      return proximo;
    });
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      await permissoesService.definir(usuarioId, [...ligadas]);
      notificar(
        'Permissões salvas',
        `As permissões de ${nome ?? login} foram atualizadas. A pessoa precisará entrar novamente para valer.`,
      );
      dados.recarregar();
    } catch (e) {
      notificar(
        'Erro',
        e instanceof ApiError ? e.message : 'Falha ao salvar as permissões.',
      );
    } finally {
      setSalvando(false);
    }
  };

  const restaurar = async () => {
    const ok = await confirmar(
      'Restaurar padrão',
      `Remover todos os ajustes de ${nome ?? login} e voltar ao padrão do perfil?`,
      'Restaurar',
    );
    if (!ok) {
      return;
    }
    setSalvando(true);
    try {
      await permissoesService.restaurar(usuarioId);
      notificar('Pronto', 'Permissões restauradas ao padrão do perfil.');
      dados.recarregar();
    } catch (e) {
      notificar(
        'Erro',
        e instanceof ApiError ? e.message : 'Falha ao restaurar.',
      );
    } finally {
      setSalvando(false);
    }
  };

  if (dados.carregando) {
    return (
      <Tela>
        <Carregando />
      </Tela>
    );
  }
  if (dados.erro || !dados.dados) {
    return (
      <Tela>
        <MensagemErro
          mensagem={dados.erro ?? 'Não foi possível carregar.'}
          aoTentarNovamente={dados.recarregar}
        />
      </Tela>
    );
  }

  return (
    <Tela>
      <Text style={styles.titulo} numberOfLines={1}>
        {nome ?? login}
      </Text>
      <Text style={styles.subtitulo}>
        Matrícula {login} · perfil {dados.dados.perfil}
      </Text>

      <Aviso
        tom="alerta"
        texto="Ao salvar, a pessoa será desconectada e precisará entrar novamente para as novas permissões valerem."
      />

      {porArea.map(({ area, itens: itensArea }) => (
        <View key={area} style={styles.grupo}>
          <Text style={styles.areaTitulo}>{area}</Text>
          <Cartao>
            {itensArea.map((item, idx) => {
              const rotulo = rotuloDe(item.funcionalidade);
              const ligado = ligadas.has(item.funcionalidade);
              const padrao = padraoPorFunc.get(item.funcionalidade) ?? false;
              const personalizada = ligado !== padrao;
              return (
                <View
                  key={item.funcionalidade}
                  style={[
                    styles.item,
                    idx < itensArea.length - 1 && styles.itemDivisor,
                  ]}
                >
                  <View style={styles.itemInfo}>
                    <View style={styles.itemTituloLinha}>
                      <Text style={styles.itemTitulo}>{rotulo.titulo}</Text>
                      {personalizada ? (
                        <Selo
                          texto="personalizada"
                          cor={cores.info}
                          fundo={cores.primariaClara}
                        />
                      ) : null}
                    </View>
                    {rotulo.descricao ? (
                      <Text style={styles.itemDescricao}>{rotulo.descricao}</Text>
                    ) : null}
                  </View>
                  <Switch
                    value={ligado}
                    onValueChange={() => alternar(item.funcionalidade)}
                    trackColor={{ true: cores.primaria, false: cores.divisor }}
                  />
                </View>
              );
            })}
          </Cartao>
        </View>
      ))}

      <View style={styles.acoes}>
        <Botao
          titulo="Salvar alterações"
          aoPressionar={() => void salvar()}
          desabilitado={!alterado || salvando}
        />
        <Botao
          titulo="Restaurar padrão do perfil"
          variante="texto"
          aoPressionar={() => void restaurar()}
          desabilitado={salvando}
        />
        <Botao
          titulo="Voltar"
          variante="texto"
          aoPressionar={() => navigation.goBack()}
          desabilitado={salvando}
        />
      </View>
    </Tela>
  );
}

const styles = StyleSheet.create({
  titulo: { ...tipografia.secao, color: cores.texto },
  subtitulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.md,
  },
  grupo: { marginBottom: espacamento.md },
  areaTitulo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginBottom: espacamento.xs,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: espacamento.sm,
  },
  itemDivisor: {
    borderBottomWidth: 1,
    borderBottomColor: cores.divisor,
  },
  itemInfo: { flex: 1, paddingRight: espacamento.md },
  itemTituloLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    flexWrap: 'wrap',
  },
  itemTitulo: { ...tipografia.corpo, color: cores.texto },
  itemDescricao: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  acoes: { gap: espacamento.sm, marginTop: espacamento.sm },
});

export default PermissoesUsuarioScreen;
