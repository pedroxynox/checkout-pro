/**
 * Tela de Insumos (Req 3.1–3.3).
 *
 * Exibe os saldos em tempo real dos insumos conhecidos (com alerta de estoque
 * baixo), registra retirada de fardo por leitura de código de barras, consumo
 * de bobinas/insumos e cadastro de novos insumos. Como o backend não lista os
 * insumos, o app mantém um registro local dos insumos com que o usuário
 * interage (ver `insumosLocais`).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { insumosService } from '../../api/services';
import { CategoriaInsumo } from '../../api/types';
import {
  Aviso,
  Botao,
  CampoTexto,
  Carregando,
  Cartao,
  EstadoVazio,
  LeitorCodigoBarras,
  Segmentado,
  Selo,
  Tela,
} from '../../components';
import { PropsTela } from '../../navigation/types';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { ROTULO_CATEGORIA_INSUMO } from '../../utils/rotulos';
import {
  InsumoLocal,
  listarInsumosLocais,
  salvarInsumoLocal,
} from '../../utils/insumosLocais';

interface SaldoInfo {
  saldo: number;
  baixo: boolean;
}

const CATEGORIAS: { valor: CategoriaInsumo; rotulo: string }[] = [
  { valor: 'SACOLA', rotulo: 'Sacola' },
  { valor: 'BOBINA', rotulo: 'Bobina' },
  { valor: 'PANO', rotulo: 'Pano' },
  { valor: 'OUTRO', rotulo: 'Outro' },
];

function SeletorInsumo({
  insumos,
  selecionado,
  aoSelecionar,
}: {
  insumos: InsumoLocal[];
  selecionado: string | null;
  aoSelecionar: (id: string) => void;
}): React.ReactElement {
  if (insumos.length === 0) {
    return <Text style={styles.vazioInline}>Cadastre um insumo primeiro.</Text>;
  }
  return (
    <View style={styles.chips}>
      {insumos.map((i) => {
        const ativo = i.id === selecionado;
        return (
          <Pressable
            key={i.id}
            onPress={() => aoSelecionar(i.id)}
            style={[styles.chip, ativo && styles.chipAtivo]}
          >
            <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]}>
              {i.nome}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function InsumosScreen({
  navigation,
}: PropsTela<'Insumos'>): React.ReactElement {
  const [insumos, setInsumos] = useState<InsumoLocal[]>([]);
  const [saldos, setSaldos] = useState<Record<string, SaldoInfo>>({});
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);

  // Cadastro
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState<CategoriaInsumo>('SACOLA');
  const [limiteMinimo, setLimiteMinimo] = useState('');
  const [saldoInicial, setSaldoInicial] = useState('');
  const [cadastrando, setCadastrando] = useState(false);

  // Retirada de fardo
  const [insumoFardo, setInsumoFardo] = useState<string | null>(null);
  const [scannerVisivel, setScannerVisivel] = useState(false);

  // Consumo
  const [insumoConsumo, setInsumoConsumo] = useState<string | null>(null);
  const [pdv, setPdv] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [consumindo, setConsumindo] = useState(false);

  const carregarSaldos = useCallback(async (lista: InsumoLocal[]) => {
    const entradas = await Promise.all(
      lista.map(async (i): Promise<[string, SaldoInfo]> => {
        try {
          const [{ saldo }, { estoqueBaixo }] = await Promise.all([
            insumosService.saldo(i.id),
            insumosService.estoqueBaixo(i.id),
          ]);
          return [i.id, { saldo, baixo: estoqueBaixo }];
        } catch {
          return [i.id, { saldo: NaN, baixo: false }];
        }
      }),
    );
    setSaldos(Object.fromEntries(entradas));
  }, []);

  const carregarTudo = useCallback(
    async (ehAtualizacao = false) => {
      if (ehAtualizacao) setAtualizando(true);
      else setCarregando(true);
      const lista = await listarInsumosLocais();
      setInsumos(lista);
      await carregarSaldos(lista);
      setCarregando(false);
      setAtualizando(false);
    },
    [carregarSaldos],
  );

  useEffect(() => {
    void carregarTudo();
  }, [carregarTudo]);

  const cadastrar = async () => {
    if (!nome.trim()) {
      Alert.alert('Nome obrigatório', 'Informe o nome do insumo.');
      return;
    }
    setCadastrando(true);
    try {
      const criado = await insumosService.cadastrar(
        nome.trim(),
        categoria,
        Number(limiteMinimo) || 0,
        Number(saldoInicial) || 0,
      );
      const lista = await salvarInsumoLocal({
        id: criado.id,
        nome: criado.nome,
        categoria: criado.categoria,
        limiteMinimo: criado.limiteMinimo,
      });
      setInsumos(lista);
      await carregarSaldos(lista);
      setNome('');
      setLimiteMinimo('');
      setSaldoInicial('');
      Alert.alert('Pronto', 'Insumo cadastrado.');
    } catch (e) {
      Alert.alert('Erro', e instanceof ApiError ? e.message : 'Falha ao cadastrar.');
    } finally {
      setCadastrando(false);
    }
  };

  const retirarFardo = async (codigoBarras: string) => {
    setScannerVisivel(false);
    if (!insumoFardo) {
      Alert.alert('Selecione o insumo', 'Escolha o insumo de sacolas do fardo.');
      return;
    }
    try {
      const { saldo } = await insumosService.retirarFardo(codigoBarras, insumoFardo);
      setSaldos((s) => ({ ...s, [insumoFardo]: { saldo, baixo: s[insumoFardo]?.baixo ?? false } }));
      await carregarSaldos(insumos);
      Alert.alert('Fardo registrado', `Novo saldo de sacolas: ${saldo}.`);
    } catch (e) {
      Alert.alert(
        'Erro',
        e instanceof ApiError ? e.message : 'Falha ao registrar a retirada.',
      );
    }
  };

  const registrarConsumo = async () => {
    if (!insumoConsumo) {
      Alert.alert('Selecione o insumo', 'Escolha o insumo a consumir.');
      return;
    }
    const q = Number(quantidade);
    if (!Number.isInteger(q) || q <= 0) {
      Alert.alert('Quantidade inválida', 'Informe um inteiro maior que zero.');
      return;
    }
    const cat = insumos.find((i) => i.id === insumoConsumo)?.categoria;
    setConsumindo(true);
    try {
      const resp =
        cat === 'BOBINA'
          ? await insumosService.consumirBobina(insumoConsumo, pdv.trim() || 'PDV', q)
          : await insumosService.consumirInsumo(insumoConsumo, q);
      setQuantidade('');
      setPdv('');
      await carregarSaldos(insumos);
      Alert.alert('Consumo registrado', `Novo saldo: ${resp.saldo}.`);
    } catch (e) {
      Alert.alert('Erro', e instanceof ApiError ? e.message : 'Falha ao registrar consumo.');
    } finally {
      setConsumindo(false);
    }
  };

  const sacolas = insumos.filter((i) => i.categoria === 'SACOLA');

  return (
    <Tela aoAtualizar={() => void carregarTudo(true)} atualizando={atualizando}>
      <Cartao titulo="Saldos em tempo real">
        {carregando ? (
          <Carregando />
        ) : insumos.length === 0 ? (
          <EstadoVazio
            icone="cube-outline"
            titulo="Nenhum insumo"
            descricao="Cadastre um insumo abaixo para acompanhar o saldo."
          />
        ) : (
          insumos.map((i) => {
            const info = saldos[i.id];
            return (
              <Pressable
                key={i.id}
                style={styles.linhaInsumo}
                onPress={() =>
                  navigation.navigate('InsumoDetalhe', { insumoId: i.id, nome: i.nome })
                }
              >
                <View style={styles.insumoTextos}>
                  <Text style={styles.insumoNome}>{i.nome}</Text>
                  <Text style={styles.insumoCategoria}>
                    {ROTULO_CATEGORIA_INSUMO[i.categoria]} · mín. {i.limiteMinimo}
                  </Text>
                </View>
                <View style={styles.insumoDireita}>
                  <Text style={styles.insumoSaldo}>
                    {info && !Number.isNaN(info.saldo) ? info.saldo : '--'}
                  </Text>
                  {info?.baixo ? (
                    <Selo texto="Baixo" cor={cores.vermelho} fundo={cores.vermelhoFundo} />
                  ) : null}
                  <Ionicons name="chevron-forward" size={18} color={cores.textoSecundario} />
                </View>
              </Pressable>
            );
          })
        )}
      </Cartao>

      <Cartao titulo="Retirada de fardo (sacolas)">
        <Text style={styles.rotulo}>Insumo de sacolas</Text>
        <SeletorInsumo insumos={sacolas} selecionado={insumoFardo} aoSelecionar={setInsumoFardo} />
        <Botao
          titulo="Ler código de barras"
          aoPressionar={() => {
            if (!insumoFardo) {
              Alert.alert('Selecione o insumo', 'Escolha o insumo de sacolas primeiro.');
              return;
            }
            setScannerVisivel(true);
          }}
          estilo={{ marginTop: espacamento.sm }}
        />
      </Cartao>

      <Cartao titulo="Registrar consumo">
        <Text style={styles.rotulo}>Insumo</Text>
        <SeletorInsumo
          insumos={insumos}
          selecionado={insumoConsumo}
          aoSelecionar={setInsumoConsumo}
        />
        {insumos.find((i) => i.id === insumoConsumo)?.categoria === 'BOBINA' ? (
          <CampoTexto rotulo="PDV" value={pdv} onChangeText={setPdv} placeholder="Ex.: PDV 12" />
        ) : null}
        <CampoTexto
          rotulo="Quantidade"
          keyboardType="number-pad"
          value={quantidade}
          onChangeText={setQuantidade}
          placeholder="0"
        />
        <Botao titulo="Registrar consumo" aoPressionar={registrarConsumo} carregando={consumindo} />
      </Cartao>

      <Cartao titulo="Cadastrar insumo">
        <CampoTexto rotulo="Nome" value={nome} onChangeText={setNome} placeholder="Nome do insumo" />
        <Text style={styles.rotulo}>Categoria</Text>
        <Segmentado opcoes={CATEGORIAS} selecionado={categoria} aoSelecionar={setCategoria} />
        <CampoTexto
          rotulo="Limite mínimo"
          keyboardType="number-pad"
          value={limiteMinimo}
          onChangeText={setLimiteMinimo}
          placeholder="0"
        />
        <CampoTexto
          rotulo="Saldo inicial"
          keyboardType="number-pad"
          value={saldoInicial}
          onChangeText={setSaldoInicial}
          placeholder="0"
        />
        <Botao titulo="Cadastrar" aoPressionar={cadastrar} carregando={cadastrando} />
        <Aviso texto="Insumos cadastrados ficam disponíveis neste aparelho para acompanhamento de saldo." />
      </Cartao>

      <LeitorCodigoBarras
        visivel={scannerVisivel}
        aoLer={retirarFardo}
        aoFechar={() => setScannerVisivel(false)}
      />
    </Tela>
  );
}

const styles = StyleSheet.create({
  rotulo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginBottom: espacamento.xs,
  },
  vazioInline: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.sm,
    marginBottom: espacamento.sm,
  },
  chip: {
    paddingVertical: espacamento.xs,
    paddingHorizontal: espacamento.md,
    borderRadius: raio.pill,
    backgroundColor: cores.superficieAlternativa,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  chipAtivo: {
    backgroundColor: cores.primariaClara,
    borderColor: cores.primaria,
  },
  chipTexto: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  chipTextoAtivo: {
    color: cores.primaria,
    fontWeight: '700',
  },
  linhaInsumo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: espacamento.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  insumoTextos: {
    flex: 1,
  },
  insumoNome: {
    ...tipografia.corpo,
    fontWeight: '600',
    color: cores.texto,
  },
  insumoCategoria: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  insumoDireita: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
  },
  insumoSaldo: {
    ...tipografia.subtitulo,
    color: cores.texto,
  },
});

export default InsumosScreen;
