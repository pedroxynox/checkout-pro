/**
 * Seção "Jornada" do formulário do colaborador (spec `jornada-5x2`, Fase 4):
 * contrato (só o administrador troca), disponibilidade de segunda a domingo com
 * "copiar a primeira para todas", grupo do rodízio de folgas, folgas fixas (só
 * sem grupo) e "Vale a partir de" quando algo da jornada mudou.
 *
 * Componente controlado: quem guarda o estado e salva é a tela de gestão.
 */
import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { AvisoJornada, TipoContratoJornada } from '../../api/services';
import { Aviso, CampoTexto } from '../../components';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { mascaraDataBR } from '../../utils/formato';
import {
  EdicaoJornada,
  GRUPOS_JORNADA,
  LimitesFolga,
  NOME_CURTO_DIA,
  SEMANA_SEG_DOM,
  alternarFolgaFixa,
  comHorario,
  copiarPrimeira,
} from '../../utils/jornadaColaborador';

const SABADO = 6;

export interface JornadaFormularioProps {
  edicao: EdicaoJornada;
  aoMudar: (e: EdicaoJornada) => void;
  /** Contratos ativos (só carregados para quem pode trocar). */
  contratos: readonly TipoContratoJornada[];
  podeTrocarContrato: boolean;
  /** Nome do contrato para quem só vê (não troca). */
  nomeContrato: string | null;
  /** Limites do contrato escolhido; null = desconhecido (o backend confere). */
  limites: LimitesFolga | null;
  /** Situação da pessoa (ex.: "ainda no 6x1"). */
  situacao: string | null;
  /** Mostra o campo "Vale a partir de". */
  mostrarData: boolean;
  aPartirDe: string;
  aoMudarData: (texto: string) => void;
  /** No cadastro a data pode ficar vazia (vale a admissão). */
  dataOpcional: boolean;
  /** Avisos da vigência mais recente (não bloqueiam). */
  avisos: readonly AvisoJornada[];
}

export function JornadaFormulario({
  edicao,
  aoMudar,
  contratos,
  podeTrocarContrato,
  nomeContrato,
  limites,
  situacao,
  mostrarData,
  aPartirDe,
  aoMudarData,
  dataOpcional,
  avisos,
}: JornadaFormularioProps): React.ReactElement {
  const mudar = (parcial: Partial<EdicaoJornada>) =>
    aoMudar({ ...edicao, ...parcial });
  const diasFolga = SEMANA_SEG_DOM.filter(
    (d) => d !== SABADO || !limites || limites.permiteFolgaSabado,
  );

  return (
    <View>
      <Text style={styles.titulo}>Jornada</Text>
      {situacao ? <Text style={styles.ajuda}>{situacao}</Text> : null}

      {/* Contrato: só o administrador escolhe ou troca (decisão do dono). */}
      <Text style={styles.rotulo}>Tipo de contrato</Text>
      {podeTrocarContrato && contratos.length > 0 ? (
        <View style={styles.chips}>
          {contratos.map((ct) => (
            <Text
              key={ct.id}
              accessibilityRole="button"
              accessibilityLabel={`Contrato ${ct.nome}`}
              onPress={() => mudar({ contratoId: ct.id })}
              style={[
                styles.chip,
                edicao.contratoId === ct.id && styles.chipAtivo,
              ]}
            >
              {ct.nome}
              {ct.padrao ? ' (padrão)' : ''}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={styles.valor}>
          {nomeContrato ?? 'Contrato padrão'}
          <Text style={styles.ajuda}> · só o administrador troca</Text>
        </Text>
      )}

      {/* Disponibilidade por dia (o horário que a escala mostra e o ponto cobra). */}
      <View style={styles.cabecalhoDisp}>
        <Text style={styles.rotulo}>Disponibilidade</Text>
        <Text
          accessibilityRole="button"
          accessibilityLabel="Copiar a primeira para todas"
          onPress={() => mudar({ linhas: copiarPrimeira(edicao.linhas) })}
          style={styles.copiar}
        >
          Copiar a primeira para todas
        </Text>
      </View>
      {edicao.linhas.map((l) => {
        const nome = NOME_CURTO_DIA[l.diaSemana];
        return (
          <View key={l.diaSemana} style={styles.linhaDia}>
            <Text style={styles.dia}>{nome}</Text>
            <TextInput
              accessibilityLabel={`${nome} entrada`}
              value={l.entrada}
              onChangeText={(t) =>
                mudar({
                  linhas: comHorario(edicao.linhas, l.diaSemana, 'entrada', t),
                })
              }
              placeholder="entrada"
              placeholderTextColor={cores.textoSecundario}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              style={styles.hora}
            />
            <TextInput
              accessibilityLabel={`${nome} saída`}
              value={l.saida}
              onChangeText={(t) =>
                mudar({
                  linhas: comHorario(edicao.linhas, l.diaSemana, 'saida', t),
                })
              }
              placeholder="saída"
              placeholderTextColor={cores.textoSecundario}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              style={styles.hora}
            />
          </View>
        );
      })}
      <Text style={styles.ajuda}>
        HH:mm. Dia sem horário = o sistema não cobra ponto nesse dia. Em feriado
        vale o horário do próprio dia.
      </Text>

      {/* Grupo do rodízio de folgas. */}
      <Text style={styles.rotulo}>Grupo de folga</Text>
      <View style={styles.chips}>
        {[...GRUPOS_JORNADA, null].map((g) => (
          <Text
            key={g ?? 'sem'}
            accessibilityRole="button"
            accessibilityLabel={g ? `Grupo ${g}` : 'Sem grupo'}
            onPress={() =>
              mudar({ grupo: g, folgasFixas: g ? [] : edicao.folgasFixas })
            }
            style={[styles.chip, edicao.grupo === g && styles.chipAtivo]}
          >
            {g ?? 'Sem grupo'}
          </Text>
        ))}
      </View>
      {edicao.grupo ? (
        <Text style={styles.ajuda}>
          Folga pelo rodízio do grupo (2 dias por semana, nunca no sábado).
        </Text>
      ) : (
        <>
          <Text style={styles.rotulo}>Folgas fixas</Text>
          <View style={styles.chips}>
            {diasFolga.map((d) => (
              <Text
                key={d}
                accessibilityRole="button"
                accessibilityLabel={`Folga ${NOME_CURTO_DIA[d]}`}
                onPress={() =>
                  mudar({
                    folgasFixas: alternarFolgaFixa(edicao.folgasFixas, d),
                  })
                }
                style={[
                  styles.chip,
                  edicao.folgasFixas.includes(d) && styles.chipAtivo,
                ]}
              >
                {NOME_CURTO_DIA[d]}
              </Text>
            ))}
          </View>
          <Text style={styles.ajuda}>
            {limites ? `Até ${limites.folgasPorSemana} por semana. ` : ''}
            Vazio = as folgas padrão do contrato.
          </Text>
        </>
      )}

      {mostrarData ? (
        <>
          <CampoTexto
            rotulo="Vale a partir de"
            value={aPartirDe}
            onChangeText={(t) => aoMudarData(mascaraDataBR(t))}
            placeholder={
              dataOpcional ? 'dd/mm/aaaa (vazio = admissão)' : 'dd/mm/aaaa'
            }
            keyboardType="number-pad"
            autoCapitalize="none"
          />
          <Text style={styles.ajuda}>
            Os dias antes desta data não mudam. Não pode cair num ciclo de folha
            fechado.
          </Text>
        </>
      ) : null}

      {avisos.map((a, i) => (
        <Aviso
          key={`${a.tipo}-${a.diaSemana ?? 'x'}-${i}`}
          tom="alerta"
          texto={a.mensagem}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  titulo: {
    ...tipografia.corpo,
    fontWeight: '700',
    color: cores.texto,
    marginTop: espacamento.md,
    marginBottom: espacamento.xs,
  },
  rotulo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
    marginBottom: espacamento.xs,
  },
  valor: {
    ...tipografia.corpo,
    color: cores.texto,
    marginBottom: espacamento.sm,
  },
  ajuda: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.xs,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.xs,
    marginBottom: espacamento.sm,
  },
  chip: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    paddingVertical: espacamento.xs,
    paddingHorizontal: espacamento.sm,
    borderRadius: raio.pill,
    backgroundColor: cores.divisor,
    overflow: 'hidden',
  },
  chipAtivo: { backgroundColor: cores.primaria, color: cores.textoInverso },
  cabecalhoDisp: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  copiar: {
    ...tipografia.legenda,
    color: cores.primaria,
    fontWeight: '600',
    marginTop: espacamento.sm,
  },
  linhaDia: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    marginBottom: espacamento.xs,
  },
  dia: { ...tipografia.corpo, color: cores.texto, width: 40 },
  hora: {
    flex: 1,
    minHeight: 40,
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.md,
    paddingHorizontal: espacamento.sm,
    color: cores.texto,
    fontSize: 15,
  },
});

export default JornadaFormulario;
