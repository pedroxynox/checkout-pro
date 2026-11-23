/**
 * Tipos de contrato de jornada (Centro de Controle).
 *
 * A gestão cria/edita/ativa/desativa/remove/duplica os contratos que definem as
 * REGRAS de jornada (carga base por dia, feriado, intervalos, limites e avisos
 * de TAC, teto diário, folgas) — sem tocar no código. Todos os tempos são em
 * MINUTOS. O contrato "padrão" não pode ser desativado nem removido.
 *
 * Contrato EM USO (spec `jornada-5x2`, R2.8): as regras de cálculo ficam
 * travadas, porque mudá-las reescreveria dias já calculados. Muda-se o nome e a
 * descrição; para outras regras, duplica-se e aplica-se a cópia com vigência.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { tiposContratoService, TipoContratoJornada } from '../../api/services';
import {
  Aviso,
  Botao,
  CampoTexto,
  Cartao,
  Carregando,
  EstadoVazio,
  MensagemErro,
  Selo,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { confirmar, notificar } from '../../utils/dialogos';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
/** Ordem da semana nas folgas: de segunda a domingo (0 = domingo). */
const SEMANA_SEG_DOM = [1, 2, 3, 4, 5, 6, 0];
const SABADO = 6;

interface FormState {
  nome: string;
  descricao: string;
  carga: string[]; // 7 valores (minutos), índice 0=domingo
  dias100: number[];
  /** Chip "Feriado" em "Dias com adicional de 100%". */
  feriado100: boolean;
  cargaFeriado: string;
  maxSemInt: string;
  intMin: string;
  intMax: string;
  limiteExtras: string;
  /** 1º aviso (campo `riscoTac1h30Min` da API). */
  aviso1: string;
  /** 2º aviso (campo `riscoTac1h40Min` da API). */
  aviso2: string;
  /** Teto de horas no dia; vazio = sem teto. */
  limiteDia: string;
  intBatidas: string;
  intervaloObrigatorio: boolean;
  trabalhaDomingo: boolean;
  folgasSemana: string;
  folgasPadrao: number[];
  permiteSabado: boolean;
}

/** Formulário em branco (valores iniciais sensatos, o usuário ajusta a carga). */
function formVazio(): FormState {
  return {
    nome: '',
    descricao: '',
    carga: ['0', '0', '0', '0', '0', '0', '0'],
    dias100: [],
    feriado100: true,
    cargaFeriado: '440',
    maxSemInt: '290',
    intMin: '60',
    intMax: '180',
    limiteExtras: '110',
    aviso1: '90',
    aviso2: '100',
    limiteDia: '',
    intBatidas: '2',
    intervaloObrigatorio: false,
    trabalhaDomingo: true,
    // Contrato novo nasce 5x2: duas folgas por semana.
    folgasSemana: '2',
    folgasPadrao: [],
    permiteSabado: false,
  };
}

/** Preenche o formulário a partir de um contrato existente (para editar). */
function formDe(c: TipoContratoJornada): FormState {
  return {
    nome: c.nome,
    descricao: c.descricao ?? '',
    carga: c.cargaBaseMinPorDia.map((n) => String(n)),
    dias100: [...c.diasComAdicional100],
    feriado100: c.feriadoAdicional100 ?? true,
    cargaFeriado: String(c.cargaFeriadoMin ?? 440),
    maxSemInt: String(c.maxTrabalhoSemIntervaloMin),
    intMin: String(c.intervaloMinimoMin),
    intMax: String(c.intervaloMaximoMin),
    limiteExtras: String(c.limiteExtrasMin),
    aviso1: String(c.riscoTac1h30Min),
    aviso2: String(c.riscoTac1h40Min),
    limiteDia:
      c.limiteTrabalhoDiaMin == null ? '' : String(c.limiteTrabalhoDiaMin),
    intBatidas: String(c.intervaloMinimoEntreBatidasMin),
    intervaloObrigatorio: c.intervaloObrigatorio,
    trabalhaDomingo: c.trabalhaDomingo,
    folgasSemana: String(c.folgasPorSemana ?? 1),
    folgasPadrao: [...(c.folgasFixasPadrao ?? [])],
    permiteSabado: c.permiteFolgaSabado ?? false,
  };
}

/** Inteiro não negativo a partir de um texto (0 quando inválido). */
function inteiro(texto: string): number {
  const n = Math.trunc(Number(texto));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** "7h 20min" a partir de minutos (resumo compacto). */
function hhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h <= 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}min`;
}

/** Só dígitos (campos numéricos). */
function digitos(t: string): string {
  return t.replace(/\D/g, '');
}

export function TiposContratoScreen(): React.ReactElement {
  // Admin vê todos (inclusive os desativados) para poder reativar.
  const req = useRequisicao<TipoContratoJornada[]>(
    () => tiposContratoService.listar(true),
    [],
  );

  const [form, setForm] = useState<FormState>(formVazio());
  // O contrato em edição (null = criando um novo). Guardado inteiro para saber
  // se está em uso (regras travadas).
  const [editando, setEditando] = useState<TipoContratoJornada | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Regras travadas: editando um contrato que alguém usa (ou o padrão).
  const travado = editando?.emUso === true;

  const set = <K extends keyof FormState>(k: K, v: FormState[K]): void =>
    setForm((f) => ({ ...f, [k]: v }));

  const setCarga = (i: number, v: string): void =>
    setForm((f) => {
      const carga = [...f.carga];
      carga[i] = digitos(v);
      return { ...f, carga };
    });

  const alternarDia100 = (dia: number): void => {
    if (travado) return;
    setForm((f) => ({
      ...f,
      dias100: f.dias100.includes(dia)
        ? f.dias100.filter((d) => d !== dia)
        : [...f.dias100, dia].sort((a, b) => a - b),
    }));
  };

  const alternarFolgaPadrao = (dia: number): void => {
    if (travado) return;
    setForm((f) => {
      if (f.folgasPadrao.includes(dia)) {
        return { ...f, folgasPadrao: f.folgasPadrao.filter((d) => d !== dia) };
      }
      if (dia === SABADO && !f.permiteSabado) return f;
      return { ...f, folgasPadrao: [...f.folgasPadrao, dia] };
    });
  };

  const alternarPermiteSabado = (): void => {
    if (travado) return;
    setForm((f) => ({
      ...f,
      permiteSabado: !f.permiteSabado,
      // Sem permissão, o sábado sai das folgas padrão.
      folgasPadrao: f.permiteSabado
        ? f.folgasPadrao.filter((d) => d !== SABADO)
        : f.folgasPadrao,
    }));
  };

  const alternar = (
    k: 'feriado100' | 'intervaloObrigatorio' | 'trabalhaDomingo',
  ): void => {
    if (travado) return;
    setForm((f) => ({ ...f, [k]: !f[k] }));
  };

  const cancelarEdicao = (): void => {
    setEditando(null);
    setForm(formVazio());
  };

  const editar = (c: TipoContratoJornada): void => {
    setEditando(c);
    setForm(formDe(c));
  };

  const salvar = async (): Promise<void> => {
    const nome = form.nome.trim();
    if (!nome) {
      notificar('Nome obrigatório', 'Dê um nome ao contrato (ex.: 5x2 44h).');
      return;
    }
    const descricao = form.descricao.trim() || undefined;

    // Contrato em uso: só o que não é regra de cálculo vai ao servidor.
    if (travado && editando) {
      setSalvando(true);
      try {
        await tiposContratoService.atualizar(editando.id, { nome, descricao });
        notificar('Contrato atualizado', `"${nome}" foi salvo.`);
        cancelarEdicao();
        req.recarregar();
      } catch (e) {
        notificar(
          'Erro',
          e instanceof ApiError ? e.message : 'Falha ao salvar.',
        );
      } finally {
        setSalvando(false);
      }
      return;
    }

    const carga = form.carga.map(inteiro);
    const intMin = inteiro(form.intMin);
    const intMax = inteiro(form.intMax);
    if (intMin >= intMax) {
      notificar(
        'Intervalo inválido',
        'O intervalo mínimo deve ser menor que o máximo.',
      );
      return;
    }
    const aviso1 = inteiro(form.aviso1);
    const aviso2 = inteiro(form.aviso2);
    const limiteExtras = inteiro(form.limiteExtras);
    if (!(aviso1 <= aviso2 && aviso2 <= limiteExtras)) {
      notificar(
        'Limites fora de ordem',
        'Deve valer: 1º aviso ≤ 2º aviso ≤ limite de extras.',
      );
      return;
    }
    const folgasPorSemana = inteiro(form.folgasSemana);
    if (folgasPorSemana < 1 || folgasPorSemana > 3) {
      notificar('Folgas por semana', 'Informe de 1 a 3 folgas por semana.');
      return;
    }
    if (form.folgasPadrao.length > folgasPorSemana) {
      notificar(
        'Folgas padrão',
        `O contrato tem ${folgasPorSemana} folga(s) por semana; marque no máximo isso.`,
      );
      return;
    }
    const limiteDia =
      form.limiteDia.trim() === '' ? null : inteiro(form.limiteDia);
    if (limiteDia === 0) {
      notificar(
        'Limite de horas no dia',
        'Deixe vazio para não ter teto, ou informe os minutos (ex.: 600 = 10h).',
      );
      return;
    }
    const payload = {
      nome,
      descricao,
      cargaBaseMinPorDia: carga,
      diasComAdicional100: form.dias100,
      feriadoAdicional100: form.feriado100,
      cargaFeriadoMin: inteiro(form.cargaFeriado),
      maxTrabalhoSemIntervaloMin: inteiro(form.maxSemInt),
      intervaloMinimoMin: intMin,
      intervaloMaximoMin: intMax,
      limiteExtrasMin: limiteExtras,
      riscoTac1h30Min: aviso1,
      riscoTac1h40Min: aviso2,
      limiteTrabalhoDiaMin: limiteDia,
      intervaloMinimoEntreBatidasMin: inteiro(form.intBatidas),
      intervaloObrigatorio: form.intervaloObrigatorio,
      folgasPorSemana,
      folgasFixasPadrao: form.folgasPadrao,
      permiteFolgaSabado: form.permiteSabado,
      // "Trabalha domingo (2x1)" é do regime antigo: só vai ao editar um
      // contrato que já o tinha (a tela não o mostra para contratos novos).
      ...(editando ? { trabalhaDomingo: form.trabalhaDomingo } : {}),
    };
    setSalvando(true);
    try {
      if (editando) {
        await tiposContratoService.atualizar(editando.id, payload);
        notificar('Contrato atualizado', `"${nome}" foi salvo.`);
      } else {
        await tiposContratoService.criar(payload);
        notificar('Contrato criado', `"${nome}" foi criado.`);
      }
      cancelarEdicao();
      req.recarregar();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const alternarAtivo = async (c: TipoContratoJornada): Promise<void> => {
    try {
      await tiposContratoService.definirAtivo(c.id, !c.ativo);
      req.recarregar();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao salvar.');
    }
  };

  const duplicar = async (c: TipoContratoJornada): Promise<void> => {
    try {
      const copia = await tiposContratoService.duplicar(c.id);
      // A cópia não está em uso: abre direto para ajustar as regras.
      editar(copia);
      req.recarregar();
      notificar(
        'Cópia criada',
        `"${copia.nome}" foi criada inativa. Ajuste as regras e ative quando estiver pronta.`,
      );
    } catch (e) {
      notificar(
        'Erro',
        e instanceof ApiError ? e.message : 'Falha ao duplicar.',
      );
    }
  };

  const tornarPadrao = async (c: TipoContratoJornada): Promise<void> => {
    const ok = await confirmar(
      'Tornar padrão',
      `Tornar "${c.nome}" o contrato padrão? Uma ficha nova sem contrato escolhido passa a recebê-lo.`,
      'Tornar padrão',
    );
    if (!ok) return;
    try {
      await tiposContratoService.definirPadrao(c.id);
      req.recarregar();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao salvar.');
    }
  };

  const remover = async (c: TipoContratoJornada): Promise<void> => {
    const ok = await confirmar(
      'Remover contrato',
      `Remover "${c.nome}"? Esta ação não pode ser desfeita.`,
      'Remover',
    );
    if (!ok) return;
    try {
      await tiposContratoService.remover(c.id);
      if (editando?.id === c.id) cancelarEdicao();
      req.recarregar();
    } catch (e) {
      notificar(
        'Erro',
        e instanceof ApiError ? e.message : 'Falha ao remover.',
      );
    }
  };

  const contratos = req.dados ?? [];

  /** Campo numérico de regra (somente leitura quando o contrato está travado). */
  const campo = (
    rotulo: string,
    k:
      | 'maxSemInt'
      | 'intMin'
      | 'intMax'
      | 'limiteExtras'
      | 'aviso1'
      | 'aviso2'
      | 'limiteDia'
      | 'intBatidas'
      | 'cargaFeriado'
      | 'folgasSemana',
    maxLength = 4,
    placeholder?: string,
  ): React.ReactElement => (
    <View style={styles.gridItem}>
      <CampoTexto
        rotulo={rotulo}
        value={form[k]}
        onChangeText={(t) => set(k, digitos(t))}
        keyboardType="number-pad"
        maxLength={maxLength}
        placeholder={placeholder}
        editable={!travado}
        style={travado ? styles.inputTravado : undefined}
      />
    </View>
  );

  /** Chip clicável; sem ação (e apagado) quando travado ou indisponível. */
  const chip = (
    texto: string,
    ativo: boolean,
    aoTocar: () => void,
    indisponivel = false,
    chave?: string,
  ): React.ReactElement => (
    <Text
      key={chave ?? texto}
      onPress={travado || indisponivel ? undefined : aoTocar}
      style={[
        styles.chip,
        ativo && styles.chipAtivo,
        (travado || indisponivel) && styles.chipApagado,
      ]}
    >
      {texto}
    </Text>
  );

  return (
    <Tela aoAtualizar={req.recarregar} atualizando={req.atualizando}>
      <Text style={styles.intro}>
        Defina os tipos de contrato de jornada (ex.: 5x2 44h). Cada contrato
        guarda suas regras (carga por dia e do feriado, intervalos, limites e
        avisos de TAC, folgas). Os tempos são em minutos. Um contrato em uso não
        muda as regras: duplique-o para criar uma versão nova.
      </Text>

      {/* Formulário de criação / edição */}
      <Cartao titulo={editando ? 'Editar contrato' : 'Novo contrato'}>
        {travado ? (
          <Aviso
            tom="alerta"
            texto="Este contrato está em uso: as regras não podem mudar, porque mudariam os dias já calculados. Você pode mudar o nome e a descrição. Para outras regras, use Duplicar e aplique a cópia com vigência."
          />
        ) : null}
        <CampoTexto
          rotulo="Nome"
          value={form.nome}
          onChangeText={(t) => set('nome', t)}
          placeholder="Ex.: 5x2 44h"
          maxLength={60}
        />
        <CampoTexto
          rotulo="Descrição (opcional)"
          value={form.descricao}
          onChangeText={(t) => set('descricao', t)}
          placeholder="Uma linha explicando o contrato"
          maxLength={200}
        />

        <Text style={styles.secao}>Carga base por dia (minutos)</Text>
        <View style={styles.grid}>
          {DIAS.map((dia, i) => (
            <View key={dia} style={styles.gridItem}>
              <CampoTexto
                rotulo={dia}
                value={form.carga[i]}
                onChangeText={(t) => setCarga(i, t)}
                keyboardType="number-pad"
                placeholder="0"
                maxLength={4}
                editable={!travado}
                style={travado ? styles.inputTravado : undefined}
              />
            </View>
          ))}
          {campo('Feriado', 'cargaFeriado')}
        </View>

        <Text style={styles.secao}>Dias com adicional de 100%</Text>
        <View style={styles.chips}>
          {DIAS.map((dia, i) =>
            chip(dia, form.dias100.includes(i), () => alternarDia100(i)),
          )}
          {chip('Feriado', form.feriado100, () => alternar('feriado100'))}
        </View>
        <Text style={styles.ajuda}>
          Dia com 100% não gera hora devida. O feriado usa a carga do campo
          &quot;Feriado&quot; acima.
        </Text>

        <Text style={styles.secao}>Regras (minutos)</Text>
        <View style={styles.grid}>
          {campo('Máx. sem intervalo', 'maxSemInt')}
          {campo('Intervalo mín.', 'intMin')}
          {campo('Intervalo máx.', 'intMax')}
          {campo('Limite de extras', 'limiteExtras')}
          {campo('1º aviso', 'aviso1')}
          {campo('2º aviso', 'aviso2')}
          {campo('Limite de horas no dia', 'limiteDia', 4, 'sem teto')}
          {campo('Mín. entre batidas', 'intBatidas', 3)}
        </View>
        <Text style={styles.ajuda}>
          1º e 2º aviso: minutos de extra em que a supervisão é avisada antes do
          TAC. Limite de horas no dia: acima dele é TAC (vazio = sem teto; 600 =
          10h).
        </Text>

        <Text style={styles.secao}>Intervalo</Text>
        <View style={styles.chips}>
          {chip(
            form.intervaloObrigatorio
              ? 'Intervalo obrigatório ✓'
              : 'Intervalo opcional',
            form.intervaloObrigatorio,
            () => alternar('intervaloObrigatorio'),
          )}
        </View>
        <Text style={styles.ajuda}>
          Se obrigatório, encerrar a jornada sem intervalo é TAC (ex.: contrato
          de 6h). Se opcional, é permitido trabalhar corrido (ex.: contrato de
          4h).
        </Text>

        <Text style={styles.secao}>Folgas</Text>
        <View style={styles.grid}>
          {campo('Folgas por semana', 'folgasSemana', 1)}
        </View>
        <Text style={styles.rotuloChips}>
          Folgas padrão (para quem não tem grupo e deixou a ficha vazia)
        </Text>
        <View style={styles.chips}>
          {SEMANA_SEG_DOM.map((d) =>
            chip(
              DIAS[d],
              form.folgasPadrao.includes(d),
              () => alternarFolgaPadrao(d),
              d === SABADO && !form.permiteSabado,
              `folga-${d}`,
            ),
          )}
        </View>
        <View style={[styles.chips, styles.chipsAbaixo]}>
          {chip(
            form.permiteSabado
              ? 'Permite folga no sábado ✓'
              : 'Sábado não é folga',
            form.permiteSabado,
            alternarPermiteSabado,
          )}
        </View>
        <Text style={styles.ajuda}>
          Quem tem grupo (G1/G2/G3) folga pelo rodízio. O sábado só pode ser
          folga fixa se o contrato permitir, e só para quem não tem grupo.
        </Text>

        {/* "Trabalha domingo (2x1)" é do regime antigo (6x1): só aparece ao
            editar um contrato existente. */}
        {editando ? (
          <>
            <Text style={styles.secao}>Domingo (regime 6x1)</Text>
            <View style={styles.chips}>
              {chip(
                form.trabalhaDomingo
                  ? 'Trabalha domingo (rodízio) ✓'
                  : 'Não trabalha domingo',
                form.trabalhaDomingo,
                () => alternar('trabalhaDomingo'),
              )}
            </View>
            <Text style={styles.ajuda}>
              Vale só para os dias do regime antigo (até 22/11/2026): com
              domingo, a pessoa entra no rodízio 2x1 e escolhe o grupo no
              cadastro.
            </Text>
          </>
        ) : null}

        <Botao
          titulo={editando ? 'Salvar alterações' : 'Criar contrato'}
          aoPressionar={salvar}
          carregando={salvando}
        />
        {editando ? (
          <Botao
            titulo="Cancelar edição"
            variante="secundario"
            aoPressionar={cancelarEdicao}
          />
        ) : null}
      </Cartao>

      {/* Lista de contratos */}
      {req.carregando ? (
        <Carregando />
      ) : req.erro ? (
        <MensagemErro mensagem={req.erro} aoTentarNovamente={req.recarregar} />
      ) : contratos.length === 0 ? (
        <EstadoVazio
          icone="document-text-outline"
          titulo="Nenhum contrato"
          descricao="Crie o primeiro tipo de contrato acima."
        />
      ) : (
        contratos.map((c) => (
          <Cartao key={c.id} style={styles.itemCard}>
            <View style={styles.itemTopo}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemNome}>{c.nome}</Text>
                {c.descricao ? (
                  <Text style={styles.itemDesc}>{c.descricao}</Text>
                ) : null}
              </View>
              <View style={styles.itemSelos}>
                {c.padrao ? (
                  <Selo
                    texto="Padrão"
                    cor={cores.primaria}
                    fundo={cores.primariaClara}
                  />
                ) : null}
                {c.emUso ? (
                  <Selo
                    texto="Em uso"
                    cor={cores.amarelo}
                    fundo={cores.amareloFundo}
                  />
                ) : null}
                <Selo
                  texto={c.ativo ? 'Ativo' : 'Inativo'}
                  cor={c.ativo ? cores.verde : cores.textoSecundario}
                  fundo={c.ativo ? cores.verdeFundo : cores.divisor}
                />
              </View>
            </View>

            <Text style={styles.itemResumo}>
              Carga:{' '}
              {DIAS.map(
                (d, i) => `${d} ${hhmm(c.cargaBaseMinPorDia[i] ?? 0)}`,
              ).join(' · ')}
              {' · '}Feriado {hhmm(c.cargaFeriadoMin ?? 440)}
            </Text>
            <Text style={styles.itemResumo}>
              100%:{' '}
              {[
                ...c.diasComAdicional100.map((d) => DIAS[d]),
                ...((c.feriadoAdicional100 ?? true) ? ['Feriado'] : []),
              ].join(', ') || 'nenhum'}{' '}
              · Intervalo {hhmm(c.intervaloMinimoMin)}–
              {hhmm(c.intervaloMaximoMin)} · TAC a {hhmm(c.limiteExtrasMin)} ·
              avisos {hhmm(c.riscoTac1h30Min)} e {hhmm(c.riscoTac1h40Min)}
              {c.limiteTrabalhoDiaMin != null
                ? ` · teto ${hhmm(c.limiteTrabalhoDiaMin)} no dia`
                : ''}
              {c.intervaloObrigatorio ? ' · intervalo obrigatório' : ''}
            </Text>
            <Text style={styles.itemResumo}>
              {c.folgasPorSemana ?? 1} folga(s) por semana
              {(c.folgasFixasPadrao ?? []).length > 0
                ? ` · padrão: ${SEMANA_SEG_DOM.filter((d) =>
                    (c.folgasFixasPadrao ?? []).includes(d),
                  )
                    .map((d) => DIAS[d])
                    .join(', ')}`
                : ''}
              {c.permiteFolgaSabado ? ' · sábado permitido' : ''}
              {c.trabalhaDomingo ? '' : ' · sem domingo (6x1)'}
            </Text>

            <View style={styles.acoes}>
              <Text style={styles.acaoLink} onPress={() => editar(c)}>
                <Ionicons name="create-outline" size={14} />{' '}
                {c.emUso ? 'Renomear' : 'Editar'}
              </Text>
              <Text style={styles.acaoLink} onPress={() => duplicar(c)}>
                <Ionicons name="copy-outline" size={14} /> Duplicar
              </Text>
              {!c.padrao && c.ativo ? (
                <Text style={styles.acaoLink} onPress={() => tornarPadrao(c)}>
                  <Ionicons name="star-outline" size={14} /> Tornar padrão
                </Text>
              ) : null}
              {!c.padrao ? (
                <Text style={styles.acaoLink} onPress={() => alternarAtivo(c)}>
                  <Ionicons
                    name={
                      c.ativo ? 'pause-circle-outline' : 'play-circle-outline'
                    }
                    size={14}
                  />{' '}
                  {c.ativo ? 'Desativar' : 'Ativar'}
                </Text>
              ) : null}
              {!c.padrao && !c.emUso ? (
                <Text
                  style={[styles.acaoLink, styles.acaoRemover]}
                  onPress={() => remover(c)}
                >
                  <Ionicons name="trash-outline" size={14} /> Remover
                </Text>
              ) : null}
            </View>
          </Cartao>
        ))
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  intro: {
    ...tipografia.corpo,
    color: cores.textoSecundario,
    marginBottom: espacamento.md,
  },
  ajuda: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    fontStyle: 'italic',
    marginTop: espacamento.xs,
  },
  secao: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
    marginTop: espacamento.md,
    marginBottom: espacamento.xs,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.sm,
  },
  gridItem: {
    width: '30%',
    flexGrow: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.xs,
  },
  chip: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    paddingVertical: espacamento.xs,
    paddingHorizontal: espacamento.md,
    borderRadius: raio.md,
    borderWidth: 1,
    borderColor: cores.borda,
    overflow: 'hidden',
  },
  chipAtivo: {
    backgroundColor: cores.primaria,
    color: cores.textoInverso,
    borderColor: cores.primaria,
  },
  chipApagado: {
    opacity: 0.5,
  },
  chipsAbaixo: {
    marginTop: espacamento.sm,
  },
  rotuloChips: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginBottom: espacamento.xs,
  },
  inputTravado: {
    backgroundColor: cores.divisor,
    color: cores.textoSecundario,
  },
  itemCard: { marginBottom: espacamento.sm },
  itemTopo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacamento.sm,
  },
  itemNome: { ...tipografia.subtitulo, color: cores.texto },
  itemDesc: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  itemSelos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.xs,
    justifyContent: 'flex-end',
  },
  itemResumo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.xs,
  },
  acoes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.lg,
    marginTop: espacamento.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
    paddingTop: espacamento.sm,
  },
  acaoLink: {
    ...tipografia.rotulo,
    color: cores.primaria,
    fontWeight: '600',
  },
  acaoRemover: {
    color: cores.vermelho,
  },
});

export default TiposContratoScreen;
