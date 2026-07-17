/**
 * Tipos de contrato de jornada (Centro de Controle).
 *
 * A gestão cria/edita/ativa/desativa/remove os contratos que definem as REGRAS
 * de jornada (carga base por dia, intervalos, limites e riscos de TAC) — sem
 * tocar no código. Todos os tempos são em MINUTOS. O contrato "padrão" (vigente)
 * não pode ser desativado nem removido.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { tiposContratoService, TipoContratoJornada } from '../../api/services';
import {
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

interface FormState {
  nome: string;
  descricao: string;
  carga: string[]; // 7 valores (minutos), índice 0=domingo
  dias100: number[];
  maxSemInt: string;
  intMin: string;
  intMax: string;
  limiteExtras: string;
  risco30: string;
  risco40: string;
  intBatidas: string;
}

/** Formulário em branco (valores iniciais sensatos, o usuário ajusta a carga). */
function formVazio(): FormState {
  return {
    nome: '',
    descricao: '',
    carga: ['0', '0', '0', '0', '0', '0', '0'],
    dias100: [],
    maxSemInt: '290',
    intMin: '60',
    intMax: '180',
    limiteExtras: '110',
    risco30: '90',
    risco40: '100',
    intBatidas: '2',
  };
}

/** Preenche o formulário a partir de um contrato existente (para editar). */
function formDe(c: TipoContratoJornada): FormState {
  return {
    nome: c.nome,
    descricao: c.descricao ?? '',
    carga: c.cargaBaseMinPorDia.map((n) => String(n)),
    dias100: [...c.diasComAdicional100],
    maxSemInt: String(c.maxTrabalhoSemIntervaloMin),
    intMin: String(c.intervaloMinimoMin),
    intMax: String(c.intervaloMaximoMin),
    limiteExtras: String(c.limiteExtrasMin),
    risco30: String(c.riscoTac1h30Min),
    risco40: String(c.riscoTac1h40Min),
    intBatidas: String(c.intervaloMinimoEntreBatidasMin),
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

export function TiposContratoScreen(): React.ReactElement {
  // Admin vê todos (inclusive os desativados) para poder reativar.
  const req = useRequisicao<TipoContratoJornada[]>(
    () => tiposContratoService.listar(true),
    [],
  );

  const [form, setForm] = useState<FormState>(formVazio());
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]): void =>
    setForm((f) => ({ ...f, [k]: v }));

  const setCarga = (i: number, v: string): void =>
    setForm((f) => {
      const carga = [...f.carga];
      carga[i] = v.replace(/\D/g, '');
      return { ...f, carga };
    });

  const alternarDia100 = (dia: number): void =>
    setForm((f) => ({
      ...f,
      dias100: f.dias100.includes(dia)
        ? f.dias100.filter((d) => d !== dia)
        : [...f.dias100, dia].sort((a, b) => a - b),
    }));

  const cancelarEdicao = (): void => {
    setEditandoId(null);
    setForm(formVazio());
  };

  const editar = (c: TipoContratoJornada): void => {
    setEditandoId(c.id);
    setForm(formDe(c));
  };

  const salvar = async (): Promise<void> => {
    const nome = form.nome.trim();
    if (!nome) {
      notificar('Nome obrigatório', 'Dê um nome ao contrato (ex.: 5x2 6h).');
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
    const risco30 = inteiro(form.risco30);
    const risco40 = inteiro(form.risco40);
    const limiteExtras = inteiro(form.limiteExtras);
    if (!(risco30 <= risco40 && risco40 <= limiteExtras)) {
      notificar(
        'Limites fora de ordem',
        'Deve valer: risco 1h30 ≤ risco 1h40 ≤ limite de extras.',
      );
      return;
    }
    const payload = {
      nome,
      descricao: form.descricao.trim() || undefined,
      cargaBaseMinPorDia: carga,
      diasComAdicional100: form.dias100,
      maxTrabalhoSemIntervaloMin: inteiro(form.maxSemInt),
      intervaloMinimoMin: intMin,
      intervaloMaximoMin: intMax,
      limiteExtrasMin: limiteExtras,
      riscoTac1h30Min: risco30,
      riscoTac1h40Min: risco40,
      intervaloMinimoEntreBatidasMin: inteiro(form.intBatidas),
    };
    setSalvando(true);
    try {
      if (editandoId) {
        await tiposContratoService.atualizar(editandoId, payload);
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

  const remover = async (c: TipoContratoJornada): Promise<void> => {
    const ok = await confirmar(
      'Remover contrato',
      `Remover "${c.nome}"? Esta ação não pode ser desfeita.`,
      'Remover',
    );
    if (!ok) return;
    try {
      await tiposContratoService.remover(c.id);
      if (editandoId === c.id) cancelarEdicao();
      req.recarregar();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao remover.');
    }
  };

  const contratos = req.dados ?? [];

  return (
    <Tela aoAtualizar={req.recarregar} atualizando={req.atualizando}>
      <Text style={styles.intro}>
        Defina os tipos de contrato de jornada (ex.: 5x2, 6h/dia). Cada contrato
        guarda suas regras (carga por dia, intervalos, limites de TAC). Os tempos
        são em minutos. Ative ou desative sem apagar.
      </Text>

      {/* Formulário de criação / edição */}
      <Cartao titulo={editandoId ? 'Editar contrato' : 'Novo contrato'}>
        <CampoTexto
          rotulo="Nome"
          value={form.nome}
          onChangeText={(t) => set('nome', t)}
          placeholder="Ex.: 5x2 6h/dia"
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
              />
            </View>
          ))}
        </View>

        <Text style={styles.secao}>Dias com adicional de 100%</Text>
        <View style={styles.chips}>
          {DIAS.map((dia, i) => {
            const ativo = form.dias100.includes(i);
            return (
              <Text
                key={dia}
                onPress={() => alternarDia100(i)}
                style={[styles.chip, ativo && styles.chipAtivo]}
              >
                {dia}
              </Text>
            );
          })}
        </View>

        <Text style={styles.secao}>Regras (minutos)</Text>
        <View style={styles.grid}>
          <View style={styles.gridItem}>
            <CampoTexto
              rotulo="Máx. sem intervalo"
              value={form.maxSemInt}
              onChangeText={(t) => set('maxSemInt', t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              maxLength={4}
            />
          </View>
          <View style={styles.gridItem}>
            <CampoTexto
              rotulo="Intervalo mín."
              value={form.intMin}
              onChangeText={(t) => set('intMin', t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              maxLength={4}
            />
          </View>
          <View style={styles.gridItem}>
            <CampoTexto
              rotulo="Intervalo máx."
              value={form.intMax}
              onChangeText={(t) => set('intMax', t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              maxLength={4}
            />
          </View>
          <View style={styles.gridItem}>
            <CampoTexto
              rotulo="Limite de extras"
              value={form.limiteExtras}
              onChangeText={(t) => set('limiteExtras', t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              maxLength={4}
            />
          </View>
          <View style={styles.gridItem}>
            <CampoTexto
              rotulo="Risco 1h30"
              value={form.risco30}
              onChangeText={(t) => set('risco30', t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              maxLength={4}
            />
          </View>
          <View style={styles.gridItem}>
            <CampoTexto
              rotulo="Risco 1h40"
              value={form.risco40}
              onChangeText={(t) => set('risco40', t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              maxLength={4}
            />
          </View>
          <View style={styles.gridItem}>
            <CampoTexto
              rotulo="Mín. entre batidas"
              value={form.intBatidas}
              onChangeText={(t) => set('intBatidas', t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              maxLength={3}
            />
          </View>
        </View>

        <Botao
          titulo={editandoId ? 'Salvar alterações' : 'Criar contrato'}
          aoPressionar={salvar}
          carregando={salvando}
        />
        {editandoId ? (
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
                  <Selo texto="Padrão" cor={cores.primaria} fundo={cores.primariaClara} />
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
              {DIAS.map((d, i) => `${d} ${hhmm(c.cargaBaseMinPorDia[i] ?? 0)}`).join(
                ' · ',
              )}
            </Text>
            <Text style={styles.itemResumo}>
              100%:{' '}
              {c.diasComAdicional100.length > 0
                ? c.diasComAdicional100.map((d) => DIAS[d]).join(', ')
                : 'nenhum'}{' '}
              · Intervalo {hhmm(c.intervaloMinimoMin)}–{hhmm(c.intervaloMaximoMin)} ·
              TAC a {hhmm(c.limiteExtrasMin)}
            </Text>

            <View style={styles.acoes}>
              <Text style={styles.acaoLink} onPress={() => editar(c)}>
                <Ionicons name="create-outline" size={14} /> Editar
              </Text>
              {!c.padrao ? (
                <Text style={styles.acaoLink} onPress={() => alternarAtivo(c)}>
                  <Ionicons
                    name={c.ativo ? 'pause-circle-outline' : 'play-circle-outline'}
                    size={14}
                  />{' '}
                  {c.ativo ? 'Desativar' : 'Ativar'}
                </Text>
              ) : null}
              {!c.padrao ? (
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
