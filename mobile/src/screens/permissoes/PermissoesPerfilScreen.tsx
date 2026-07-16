/**
 * Central de Permissões — editor do padrão de um perfil (Padrões por perfil).
 *
 * Mostra as funcionalidades ajustáveis agrupadas por área, com um interruptor
 * cada. Define o padrão do perfil (código ± ajustes). Salvar afeta TODOS os
 * usuários do perfil, que precisam entrar de novo. Uso exclusivo do
 * Administrador (PERMISSOES_GERENCIAR).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { permissoesService } from '../../api/services';
import { ItemPermissaoPerfil } from '../../api/types';
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

export function PermissoesPerfilScreen({
  route,
  navigation,
}: PropsTela<'PermissoesPerfil'>): React.ReactElement {
  const { perfil, rotulo } = route.params;
  const dados = useRequisicao(() => permissoesService.doPerfil(perfil), [perfil]);

  const [ligadas, setLigadas] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (dados.dados) {
      setLigadas(
        new Set(
          dados.dados.itens.filter((i) => i.ligada).map((i) => i.funcionalidade),
        ),
      );
    }
  }, [dados.dados]);

  const itens = useMemo(() => dados.dados?.itens ?? [], [dados.dados]);
  const codigoPorFunc = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const i of itens) {
      m.set(i.funcionalidade, i.padraoDeCodigo);
    }
    return m;
  }, [itens]);

  const alterado = useMemo(() => {
    if (!dados.dados) {
      return false;
    }
    const atual = new Set(
      dados.dados.itens.filter((i) => i.ligada).map((i) => i.funcionalidade),
    );
    if (atual.size !== ligadas.size) {
      return true;
    }
    for (const f of ligadas) {
      if (!atual.has(f)) {
        return true;
      }
    }
    return false;
  }, [dados.dados, ligadas]);

  const porArea = useMemo(() => {
    const grupos = new Map<string, ItemPermissaoPerfil[]>();
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
    const ok = await confirmar(
      'Salvar padrão do perfil',
      `Isto afeta TODOS os ${rotulo}s. Eles precisarão entrar novamente. Continuar?`,
      'Salvar',
    );
    if (!ok) {
      return;
    }
    setSalvando(true);
    try {
      await permissoesService.definirPerfil(perfil, [...ligadas]);
      notificar('Padrão salvo', `O padrão do perfil ${rotulo} foi atualizado.`);
      dados.recarregar();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const restaurar = async () => {
    const ok = await confirmar(
      'Restaurar padrão original',
      `Remover todos os ajustes do perfil ${rotulo} e voltar ao padrão original do sistema?`,
      'Restaurar',
    );
    if (!ok) {
      return;
    }
    setSalvando(true);
    try {
      await permissoesService.restaurarPerfil(perfil);
      notificar('Pronto', `O perfil ${rotulo} voltou ao padrão original.`);
      dados.recarregar();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao restaurar.');
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
      <Text style={styles.titulo}>Padrão do perfil {rotulo}</Text>
      <Aviso
        tom="alerta"
        texto="Ao salvar, todos os usuários deste perfil serão desconectados e precisarão entrar de novo. Ajustes individuais por login continuam valendo por cima deste padrão."
      />

      {porArea.map(({ area, itens: itensArea }) => (
        <View key={area} style={styles.grupo}>
          <Text style={styles.areaTitulo}>{area}</Text>
          <Cartao>
            {itensArea.map((item, idx) => {
              const info = rotuloDe(item.funcionalidade);
              const ligado = ligadas.has(item.funcionalidade);
              const codigo = codigoPorFunc.get(item.funcionalidade) ?? false;
              const personalizada = ligado !== codigo;
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
                      <Text style={styles.itemTitulo}>{info.titulo}</Text>
                      {personalizada ? (
                        <Selo
                          texto="alterada"
                          cor={cores.info}
                          fundo={cores.primariaClara}
                        />
                      ) : null}
                    </View>
                    {info.descricao ? (
                      <Text style={styles.itemDescricao}>{info.descricao}</Text>
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
          titulo="Salvar padrão"
          aoPressionar={() => void salvar()}
          desabilitado={!alterado || salvando}
        />
        <Botao
          titulo="Restaurar padrão original"
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
  titulo: { ...tipografia.secao, color: cores.texto, marginBottom: espacamento.sm },
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

export default PermissoesPerfilScreen;
