/**
 * Detalhe de um insumo (Req 3.1.4, 3.1.6, 3.2.4).
 *
 * Mostra o saldo atual em tempo real **na unidade do PRODUTO** (embalagem:
 * fardo, caixa, galão, pano...), com a quantidade na unidade base (ex.: litros)
 * apenas como referência secundária. Também lista o histórico de movimentos, com
 * cada entrada/saída expressa em embalagens (ex.: "-1 galão"), não em litros.
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { insumosService } from '../../api/services';
import { InsumoProativo } from '../../api/types';
import {
  Carregando,
  Cartao,
  EstadoVazio,
  LinhaInfo,
  MensagemErro,
  Selo,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { PropsTela } from '../../navigation/types';
import { cores, espacamento, tipografia } from '../../theme';
import { formatarDataHora, formatarNumero } from '../../utils/formato';

/** Plural do nome da embalagem (fardo→fardos, galão→galões). */
function pluralEmbalagem(embalagem: string, qtd: number): string {
  if (Math.abs(qtd) === 1) return embalagem;
  return embalagem.endsWith('ão') ? `${embalagem.slice(0, -2)}ões` : `${embalagem}s`;
}

function capitalizar(texto: string): string {
  return texto.length ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

/** Formata uma quantidade em embalagens (inteiro quando possível). */
function formatarEmbalagens(valor: number): string {
  return Number.isInteger(valor)
    ? String(Math.abs(valor))
    : formatarNumero(Math.abs(valor));
}

/** Selo de nível de estoque a partir do nível proativo. */
function seloNivel(nivel: InsumoProativo['nivel']): {
  texto: string;
  cor: string;
  fundo: string;
} {
  if (nivel === 'CRITICO') {
    return { texto: 'Estoque crítico', cor: cores.vermelho, fundo: cores.vermelhoFundo };
  }
  if (nivel === 'ATENCAO') {
    return { texto: 'Estoque baixo', cor: cores.amarelo, fundo: cores.amareloFundo };
  }
  return { texto: 'Estoque ok', cor: cores.verde, fundo: cores.verdeFundo };
}

export function InsumoDetalheScreen({
  route,
}: PropsTela<'InsumoDetalhe'>): React.ReactElement {
  const { insumoId } = route.params;

  // Busca o insumo na lista proativa (traz saldo + embalagem + fator + unidade
  // + nível), para exibir tudo na unidade do PRODUTO.
  const resumo = useRequisicao<InsumoProativo | null>(
    async () => {
      const lista = await insumosService.listarProativo();
      return lista.find((i) => i.id === insumoId) ?? null;
    },
    [insumoId],
  );
  const historico = useRequisicao(
    () => insumosService.historico(insumoId),
    [insumoId],
  );

  const recarregar = () => {
    resumo.recarregar();
    historico.recarregar();
  };

  const insumo = resumo.dados;
  const fator = insumo && insumo.fatorEmbalagem > 0 ? insumo.fatorEmbalagem : 1;
  const qtdEmb = insumo ? Math.round(insumo.saldo / fator) : 0;

  return (
    <Tela aoAtualizar={recarregar} atualizando={resumo.atualizando}>
      <Cartao titulo="Saldo atual">
        {resumo.carregando ? (
          <Carregando />
        ) : resumo.erro ? (
          <MensagemErro mensagem={resumo.erro} aoTentarNovamente={resumo.recarregar} />
        ) : !insumo ? (
          <EstadoVazio
            icone="cube-outline"
            titulo="Insumo não encontrado"
            descricao="Ele pode ter sido removido do cadastro."
          />
        ) : (
          <View style={styles.saldoLinha}>
            <Text style={styles.saldo}>{formatarNumero(qtdEmb)}</Text>
            <Text style={styles.saldoUnidade}>
              {pluralEmbalagem(capitalizar(insumo.embalagem), qtdEmb)}
            </Text>
            <Text style={styles.saldoBase}>
              ≈ {formatarNumero(insumo.saldo)} {insumo.unidade}
              {insumo.saldo === 1 ? '' : 's'}
            </Text>
            {(() => {
              const s = seloNivel(insumo.nivel);
              return <Selo texto={s.texto} cor={s.cor} fundo={s.fundo} />;
            })()}
          </View>
        )}
      </Cartao>

      <Text style={styles.tituloSecao}>Movimentos</Text>
      {historico.carregando ? (
        <Carregando />
      ) : historico.erro ? (
        <MensagemErro mensagem={historico.erro} aoTentarNovamente={historico.recarregar} />
      ) : !historico.dados || historico.dados.length === 0 ? (
        <EstadoVazio
          icone="swap-vertical-outline"
          titulo="Sem movimentos"
          descricao="Retiradas e consumos aparecerão aqui."
        />
      ) : (
        historico.dados.map((m) => {
          const emb = m.delta / fator;
          const embLabel = insumo
            ? `${emb < 0 ? '-' : '+'}${formatarEmbalagens(emb)} ${pluralEmbalagem(insumo.embalagem, emb)}`
            : `${m.delta > 0 ? `+${m.delta}` : m.delta}`;
          return (
            <Cartao key={m.id}>
              <View style={styles.movTopo}>
                <Ionicons
                  name={m.delta < 0 ? 'arrow-down-circle' : 'arrow-up-circle'}
                  size={20}
                  color={m.delta < 0 ? cores.vermelho : cores.verde}
                />
                <Text
                  style={[
                    styles.movDelta,
                    { color: m.delta < 0 ? cores.vermelho : cores.verde },
                  ]}
                >
                  {embLabel}
                </Text>
              </View>
              {insumo ? (
                <LinhaInfo
                  rotulo="Quantidade"
                  valor={`${formatarNumero(Math.abs(m.delta))} ${insumo.unidade}${Math.abs(m.delta) === 1 ? '' : 's'}`}
                />
              ) : null}
              <LinhaInfo rotulo="Data/hora" valor={formatarDataHora(m.dataHora)} />
              {m.destino ? <LinhaInfo rotulo="Destino" valor={m.destino} /> : null}
              {m.pdvId ? <LinhaInfo rotulo="PDV" valor={m.pdvId} /> : null}
            </Cartao>
          );
        })
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  saldoLinha: {
    alignItems: 'center',
    gap: espacamento.xs,
  },
  saldo: {
    ...tipografia.titulo,
    fontSize: 40,
    color: cores.primaria,
  },
  saldoUnidade: {
    ...tipografia.subtitulo,
    color: cores.texto,
    fontWeight: '700',
  },
  saldoBase: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.xs,
  },
  tituloSecao: {
    ...tipografia.secao,
    color: cores.texto,
    marginTop: espacamento.sm,
    marginBottom: espacamento.md,
  },
  movTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    marginBottom: espacamento.xs,
  },
  movDelta: {
    ...tipografia.subtitulo,
  },
});

export default InsumoDetalheScreen;
