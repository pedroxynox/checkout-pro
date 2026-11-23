/**
 * Cartão "Jornada" do perfil do colaborador (spec `jornada-5x2`, R4.8):
 * contrato vigente (desde quando), grupo ou folgas fixas, disponibilidade por
 * dia, próximas folgas e histórico de vigências. Quem ainda não tem vigência
 * vê a escala antiga da ficha (6x1).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { JornadaDoColaborador } from '../../api/services';
import { Cartao } from '../../components';
import { cores, espacamento, tipografia } from '../../theme';
import { isoParaDataBR, isoParaDiaMes } from '../../utils/formato';
import {
  NOME_CURTO_DIA,
  SEMANA_SEG_DOM,
  textoDias,
} from '../../utils/jornadaColaborador';

const NOMES_DIA = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
];

/** Os campos antigos da ficha (6x1), para quem ainda não tem vigência. */
export interface FichaEscalaAntiga {
  entradaSemana?: string | null;
  saidaSemana?: string | null;
  entradaFds?: string | null;
  saidaFds?: string | null;
  entradaDom?: string | null;
  saidaDom?: string | null;
  grupoDomingo?: string | null;
  folgaDiaSemana?: number | null;
}

function Linha({
  rotulo,
  valor,
}: {
  rotulo: string;
  valor: string;
}): React.ReactElement {
  return (
    <View style={styles.linha}>
      <Text style={styles.rotulo}>{rotulo}</Text>
      <Text style={styles.valor}>{valor}</Text>
    </View>
  );
}

const faixa = (e?: string | null, s?: string | null) =>
  e && s ? `${e} – ${s}` : '—';

export function JornadaPerfilCartao({
  jornada,
  ficha,
}: {
  /** null = não carregou (sem permissão ou falha): mostra só a ficha. */
  jornada: JornadaDoColaborador | null;
  ficha: FichaEscalaAntiga;
}): React.ReactElement {
  const vigente = jornada?.vigente ?? null;

  return (
    <Cartao titulo="Jornada">
      {jornada ? (
        <Linha
          rotulo="Contrato"
          valor={
            (jornada.contratoVigente.nome ?? '—') +
            (jornada.contratoVigente.desde
              ? ` · desde ${isoParaDataBR(jornada.contratoVigente.desde)}`
              : '')
          }
        />
      ) : null}

      {vigente ? (
        <>
          <Linha rotulo="Grupo de folga" valor={vigente.grupo ?? 'Sem grupo'} />
          {!vigente.grupo ? (
            <Linha
              rotulo="Folgas fixas"
              valor={
                textoDias(vigente.folgasFixasEfetivas) +
                (vigente.folgasFixas.length === 0 &&
                vigente.folgasFixasEfetivas.length > 0
                  ? ' (padrão do contrato)'
                  : '')
              }
            />
          ) : null}
          <Text style={styles.subtitulo}>Disponibilidade</Text>
          {SEMANA_SEG_DOM.map((d) => {
            const h = vigente.disponibilidade.find((x) => x.diaSemana === d);
            return (
              <Linha
                key={d}
                rotulo={NOME_CURTO_DIA[d]}
                valor={faixa(h?.entrada, h?.saida)}
              />
            );
          })}
        </>
      ) : (
        <>
          <Text style={styles.nota}>
            Escala antiga (6x1) da ficha
            {jornada && jornada.historico.length > 0
              ? '; a nova jornada começa na data do histórico abaixo.'
              : '.'}
          </Text>
          <Linha
            rotulo="Seg–Qui"
            valor={faixa(ficha.entradaSemana, ficha.saidaSemana)}
          />
          <Linha
            rotulo="Sex–Sáb"
            valor={faixa(ficha.entradaFds, ficha.saidaFds)}
          />
          <Linha
            rotulo="Domingo"
            valor={faixa(ficha.entradaDom, ficha.saidaDom)}
          />
          <Linha
            rotulo="Grupo de domingo"
            valor={ficha.grupoDomingo ?? 'fora do rodízio'}
          />
          <Linha
            rotulo="Folga"
            valor={
              ficha.folgaDiaSemana != null && ficha.folgaDiaSemana >= 0
                ? NOMES_DIA[ficha.folgaDiaSemana]
                : '—'
            }
          />
        </>
      )}

      {jornada ? (
        <>
          <Text style={styles.subtitulo}>Próximas folgas</Text>
          <Text style={styles.valorLivre}>
            {jornada.proximasFolgas.length > 0
              ? jornada.proximasFolgas
                  .map(
                    (f) =>
                      `${NOME_CURTO_DIA[f.diaSemana]} ${isoParaDiaMes(f.data)}`,
                  )
                  .join(' · ')
              : 'Nenhuma nos próximos 14 dias.'}
          </Text>

          <Text style={styles.subtitulo}>Histórico</Text>
          {jornada.historico.length === 0 ? (
            <Text style={styles.valorLivre}>
              Sem vigências: todos os dias seguem a ficha antiga (6x1).
            </Text>
          ) : (
            jornada.historico.map((h) => (
              <Text key={h.id} style={styles.valorLivre}>
                {`A partir de ${isoParaDataBR(h.aPartirDe)} · ${
                  h.tipoContratoNome ?? 'contrato'
                } · ${h.grupo ?? `folgas ${textoDias(h.folgasFixasEfetivas)}`}`}
                {h.criadoPor ? ` · por ${h.atualizadoPor ?? h.criadoPor}` : ''}
                {h.motivo ? ` · ${h.motivo}` : ''}
              </Text>
            ))
          )}
        </>
      ) : null}
    </Cartao>
  );
}

const styles = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  rotulo: { ...tipografia.corpo, color: cores.textoSecundario },
  valor: { ...tipografia.corpo, color: cores.texto, fontWeight: '600' },
  subtitulo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
    marginBottom: espacamento.xs,
  },
  valorLivre: {
    ...tipografia.corpo,
    color: cores.texto,
    marginBottom: espacamento.xs,
  },
  nota: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.xs,
  },
});

export default JornadaPerfilCartao;
