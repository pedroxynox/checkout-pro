/**
 * Tela de Fiscais (Req 4.1, 4.2).
 *
 * Painel em tempo real do status dos fiscais, alimentado pelo WebSocket do
 * backend (`/fiscais`, evento `fiscal:status`). Mostra o indicador de conexão e
 * a lista de fiscais com o último status e o instante em que foi definido.
 * Inclui ações de check-in/check-out e alteração de status para o fiscal cujo
 * identificador é mantido localmente no aparelho.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { fiscaisService } from '../../api/services';
import { conectarPainelFiscais, ConexaoFiscais } from '../../api/socket';
import { EventoStatusFiscal, StatusFiscal } from '../../api/types';
import {
  Aviso,
  Botao,
  CampoTexto,
  Cartao,
  EstadoVazio,
  Segmentado,
  Selo,
  Tela,
} from '../../components';
import { cores, espacamento, tipografia } from '../../theme';
import { formatarHora } from '../../utils/formato';
import { ROTULO_STATUS_FISCAL } from '../../utils/rotulos';

const CHAVE_MEU_FISCAL = 'stokcenter.fiscal.meuId';

const STATUS_OPCOES: { valor: StatusFiscal; rotulo: string }[] = [
  { valor: 'DISPONIVEL', rotulo: 'Disponível' },
  { valor: 'EM_INTERVALO', rotulo: 'Intervalo' },
  { valor: 'EM_ATENDIMENTO', rotulo: 'Atend.' },
];

function corStatus(status: StatusFiscal): { cor: string; fundo: string } {
  switch (status) {
    case 'DISPONIVEL':
      return { cor: cores.disponivel, fundo: cores.verdeFundo };
    case 'EM_INTERVALO':
      return { cor: cores.emIntervalo, fundo: cores.amareloFundo };
    case 'EM_ATENDIMENTO':
      return { cor: cores.emAtendimento, fundo: cores.primariaClara };
  }
}

export function FiscaisScreen(): React.ReactElement {
  const [conectado, setConectado] = useState(false);
  const [painel, setPainel] = useState<Record<string, EventoStatusFiscal>>({});
  const conexaoRef = useRef<ConexaoFiscais | null>(null);

  const [meuId, setMeuId] = useState('');
  const [statusEscolhido, setStatusEscolhido] = useState<StatusFiscal>('DISPONIVEL');
  const [ocupado, setOcupado] = useState(false);

  // Conecta ao painel em tempo real.
  useEffect(() => {
    let ativo = true;
    (async () => {
      const conexao = await conectarPainelFiscais({
        aoConectar: () => ativo && setConectado(true),
        aoDesconectar: () => ativo && setConectado(false),
        aoErro: () => ativo && setConectado(false),
        aoAtualizarStatus: (evento) =>
          ativo &&
          setPainel((atual) => ({ ...atual, [evento.fiscalId]: evento })),
      });
      conexaoRef.current = conexao;
    })();
    return () => {
      ativo = false;
      conexaoRef.current?.desconectar();
    };
  }, []);

  // Carrega o id de fiscal salvo localmente.
  useEffect(() => {
    AsyncStorage.getItem(CHAVE_MEU_FISCAL).then((v) => v && setMeuId(v));
  }, []);

  const salvarMeuId = async (valor: string) => {
    setMeuId(valor);
    await AsyncStorage.setItem(CHAVE_MEU_FISCAL, valor.trim());
  };

  const exigeId = (): string | null => {
    if (!meuId.trim()) {
      Alert.alert('Identificador necessário', 'Informe o seu identificador de fiscal.');
      return null;
    }
    return meuId.trim();
  };

  const acao = async (fn: (id: string) => Promise<unknown>, ok: string) => {
    const id = exigeId();
    if (!id) return;
    setOcupado(true);
    try {
      await fn(id);
      Alert.alert('Pronto', ok);
    } catch (e) {
      Alert.alert('Erro', e instanceof ApiError ? e.message : 'Falha na operação.');
    } finally {
      setOcupado(false);
    }
  };

  const lista = Object.values(painel).sort((a, b) =>
    a.fiscalId.localeCompare(b.fiscalId),
  );

  return (
    <Tela>
      <View style={styles.conexao}>
        <View
          style={[
            styles.pontoConexao,
            { backgroundColor: conectado ? cores.verde : cores.textoSecundario },
          ]}
        />
        <Text style={styles.conexaoTexto}>
          {conectado ? 'Painel em tempo real conectado' : 'Conectando ao painel...'}
        </Text>
      </View>

      <Cartao titulo="Painel de fiscais">
        {lista.length === 0 ? (
          <EstadoVazio
            icone="pulse-outline"
            titulo="Aguardando atualizações"
            descricao="Os status dos fiscais aparecem aqui assim que houver alterações."
          />
        ) : (
          lista.map((f) => {
            const c = corStatus(f.status);
            return (
              <View key={f.fiscalId} style={styles.linhaFiscal}>
                <View style={styles.fiscalTextos}>
                  <Text style={styles.fiscalId} numberOfLines={1}>
                    {f.fiscalId}
                  </Text>
                  <Text style={styles.fiscalHora}>
                    Desde {formatarHora(f.statusDefinidoEm)}
                  </Text>
                </View>
                <Selo texto={ROTULO_STATUS_FISCAL[f.status]} cor={c.cor} fundo={c.fundo} />
              </View>
            );
          })
        )}
      </Cartao>

      <Cartao titulo="Minhas ações">
        <CampoTexto
          rotulo="Meu identificador de fiscal"
          value={meuId}
          onChangeText={salvarMeuId}
          autoCapitalize="none"
          placeholder="ID do fiscal"
        />
        <Aviso texto="O identificador é guardado neste aparelho para agilizar o check-in e a troca de status." />

        <View style={styles.botoesLinha}>
          <Botao
            titulo="Check-in"
            aoPressionar={() => void acao((id) => fiscaisService.checkIn(id), 'Check-in realizado.')}
            carregando={ocupado}
            estilo={styles.botaoFlex}
          />
          <Botao
            titulo="Check-out"
            variante="secundario"
            aoPressionar={() => void acao((id) => fiscaisService.checkOut(id), 'Check-out realizado.')}
            carregando={ocupado}
            estilo={styles.botaoFlex}
          />
        </View>

        <Text style={styles.rotulo}>Alterar status</Text>
        <Segmentado
          opcoes={STATUS_OPCOES}
          selecionado={statusEscolhido}
          aoSelecionar={setStatusEscolhido}
        />
        <Botao
          titulo="Atualizar status"
          aoPressionar={() =>
            void acao(
              (id) => fiscaisService.alterarStatus(id, statusEscolhido),
              'Status atualizado.',
            )
          }
          carregando={ocupado}
        />
      </Cartao>
    </Tela>
  );
}

const styles = StyleSheet.create({
  conexao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    marginBottom: espacamento.md,
  },
  pontoConexao: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  conexaoTexto: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  linhaFiscal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: espacamento.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  fiscalTextos: {
    flex: 1,
    paddingRight: espacamento.sm,
  },
  fiscalId: {
    ...tipografia.corpo,
    fontWeight: '600',
    color: cores.texto,
  },
  fiscalHora: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  botoesLinha: {
    flexDirection: 'row',
    gap: espacamento.sm,
    marginBottom: espacamento.md,
  },
  botaoFlex: {
    flex: 1,
  },
  rotulo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginBottom: espacamento.xs,
  },
});

export default FiscaisScreen;
