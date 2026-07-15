/**
 * Feriados — os NACIONAIS aparecem automaticamente (não removíveis); o gestor
 * cadastra os ESTADUAIS/MUNICIPAIS. Um feriado conta como domingo (100%) na
 * jornada. Gate por FISCAIS_JORNADA.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { feriadosService } from '../../api/services';
import { Feriado } from '../../api/services/feriados';
import {
  Botao,
  CampoTexto,
  Cartao,
  Carregando,
  MensagemErro,
  Segmentado,
  Selo,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { confirmar, notificar } from '../../utils/dialogos';
import { dataBRParaISO, mascaraDataBR } from '../../utils/formato';
import { cores, espacamento, tipografia } from '../../theme';

const NOMES_MES = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

function dataCurta(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, '0')} ${NOMES_MES[d.getUTCMonth()]}`;
}

export function FeriadosScreen(): React.ReactElement {
  const [ano, setAno] = useState(new Date().getUTCFullYear());
  const [dataBR, setDataBR] = useState('');
  const [nome, setNome] = useState('');
  const [ambito, setAmbito] = useState<'MUNICIPAL' | 'ESTADUAL'>('MUNICIPAL');
  const [salvando, setSalvando] = useState(false);

  const lista = useRequisicao<Feriado[]>(() => feriadosService.listar(ano), [ano]);

  async function adicionar(): Promise<void> {
    const iso = dataBRParaISO(dataBR.trim());
    if (!iso) {
      notificar('Data inválida', 'Use o formato dd/mm/aaaa (ex.: 20/01/2026).');
      return;
    }
    if (!nome.trim()) {
      notificar('Nome obrigatório', 'Informe o nome do feriado.');
      return;
    }
    setSalvando(true);
    try {
      await feriadosService.criar({ data: iso, nome: nome.trim(), ambito });
      setDataBR('');
      setNome('');
      lista.recarregar();
      notificar('Feriado adicionado', 'O feriado foi cadastrado.');
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao salvar.');
    } finally {
      setSalvando(false);
    }
  }

  async function remover(f: Feriado): Promise<void> {
    if (!f.id) return;
    const ok = await confirmar(
      'Remover feriado',
      `Remover "${f.nome}" (${dataCurta(f.data)})?`,
    );
    if (!ok) return;
    try {
      await feriadosService.remover(f.id);
      lista.recarregar();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao remover.');
    }
  }

  return (
    <Tela aoAtualizar={lista.recarregar} atualizando={lista.atualizando}>
      {/* Seletor de ano */}
      <Cartao style={styles.cardAno}>
        <Pressable onPress={() => setAno((a) => a - 1)} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={cores.primaria} />
        </Pressable>
        <Text style={styles.anoTexto}>{ano}</Text>
        <Pressable onPress={() => setAno((a) => a + 1)} hitSlop={10}>
          <Ionicons name="chevron-forward" size={22} color={cores.primaria} />
        </Pressable>
      </Cartao>

      {/* Cadastro manual */}
      <Cartao>
        <Text style={styles.secaoTitulo}>Adicionar feriado (estadual/municipal)</Text>
        <View style={styles.formRow}>
          <CampoTexto
            rotulo="Data"
            value={dataBR}
            onChangeText={(t) => setDataBR(mascaraDataBR(t))}
            placeholder="dd/mm/aaaa"
            keyboardType="numeric"
            containerStyle={styles.metade}
          />
          <CampoTexto
            rotulo="Nome"
            value={nome}
            onChangeText={setNome}
            placeholder="Ex.: Aniversário da cidade"
            containerStyle={styles.metade}
          />
        </View>
        <Text style={styles.rotulo}>Âmbito</Text>
        <Segmentado
          opcoes={[
            { valor: 'MUNICIPAL', rotulo: 'Municipal' },
            { valor: 'ESTADUAL', rotulo: 'Estadual' },
          ]}
          selecionado={ambito}
          aoSelecionar={setAmbito}
        />
        <View style={{ marginTop: espacamento.md }}>
          <Botao
            titulo="Adicionar feriado"
            aoPressionar={adicionar}
            carregando={salvando}
          />
        </View>
      </Cartao>

      {/* Lista */}
      {lista.carregando ? (
        <Carregando />
      ) : lista.erro ? (
        <MensagemErro mensagem={lista.erro} aoTentarNovamente={lista.recarregar} />
      ) : (
        <Cartao>
          <Text style={styles.secaoTitulo}>Feriados de {ano}</Text>
          {(lista.dados ?? []).map((f) => (
            <View key={`${f.data}-${f.nome}`} style={styles.feriadoLinha}>
              <View style={styles.feriadoData}>
                <Text style={styles.feriadoDataTexto}>{dataCurta(f.data)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.feriadoNome}>{f.nome}</Text>
                <Selo
                  texto={
                    f.ambito === 'NACIONAL'
                      ? 'Nacional (automático)'
                      : f.ambito === 'ESTADUAL'
                        ? 'Estadual'
                        : 'Municipal'
                  }
                  cor={f.automatico ? cores.textoSecundario : cores.primaria}
                  fundo={cores.fundo}
                />
              </View>
              {f.removivel && (
                <Pressable onPress={() => remover(f)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={20} color={cores.erro ?? '#DC2626'} />
                </Pressable>
              )}
            </View>
          ))}
        </Cartao>
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  cardAno: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: espacamento.md,
  },
  anoTexto: { ...tipografia.subtitulo, color: cores.texto, fontWeight: '700' },
  secaoTitulo: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
    marginBottom: espacamento.sm,
  },
  rotulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.xs,
    marginTop: espacamento.sm,
  },
  formRow: { flexDirection: 'row', gap: espacamento.sm },
  metade: { flex: 1 },
  feriadoLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.md,
    paddingVertical: espacamento.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  feriadoData: {
    width: 56,
    alignItems: 'center',
  },
  feriadoDataTexto: { ...tipografia.rotulo, color: cores.texto, fontWeight: '700' },
  feriadoNome: { ...tipografia.corpo, color: cores.texto, marginBottom: 4 },
});

export default FeriadosScreen;
