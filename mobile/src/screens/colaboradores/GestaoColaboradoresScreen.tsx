/**
 * Centro de Controle ▸ Colaboradores (gestão) — cadastro unificado de pessoas.
 *
 * Lista todos os colaboradores (busca por nome/matrícula), permite cadastrar um
 * a um (matrícula, login, turno, horários, folga) e editar/inativar. Cada item
 * abre o formulário de edição.
 *
 * Apenas gestor (funcionalidade OPERADORES_CRUD). O cadastro só existe aqui — a
 * seção "Colaboradores" (geral) é somente leitura (perfil).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ApiError } from '../../api/client';
import { colaboradoresService } from '../../api/services';
import { Colaborador, FuncaoColaborador, TurnoColaborador } from '../../api/types';
import {
  Botao,
  CampoTexto,
  Carregando,
  Cartao,
  EstadoVazio,
  MensagemErro,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { PropsTela } from '../../navigation/types';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { confirmar, notificar } from '../../utils/dialogos';
import { dataBRParaISO, isoParaDataBR, mascaraDataBR } from '../../utils/formato';

const NOMES_DIA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const FUNCOES: { v: FuncaoColaborador; r: string }[] = [
  { v: 'OPERADOR', r: 'Operador' },
  { v: 'FISCAL', r: 'Fiscal' },
  { v: 'SUPERVISOR', r: 'Supervisor' },
  { v: 'GESTOR', r: 'Gerente' },
];

/** Funções que entram no app (precisam de login/senha). Operador não entra. */
const FUNCOES_COM_ACESSO: FuncaoColaborador[] = ['FISCAL', 'SUPERVISOR', 'GESTOR'];

const TURNOS: { v: TurnoColaborador; r: string }[] = [
  { v: 'ABERTURA', r: 'Abertura' },
  { v: 'INTERMEDIARIO', r: 'Intermediário' },
  { v: 'FECHAMENTO', r: 'Fechamento' },
  { v: 'APOIO', r: 'Apoio' },
];

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function rotuloFuncao(f: FuncaoColaborador): string {
  return FUNCOES.find((x) => x.v === f)?.r ?? f;
}
function rotuloTurno(t: TurnoColaborador | null): string {
  return t ? TURNOS.find((x) => x.v === t)?.r ?? t : '—';
}

export function GestaoColaboradoresScreen({
  route,
}: PropsTela<'GestaoColaboradores'>): React.ReactElement {
  const lista = useRequisicao<Colaborador[]>(() => colaboradoresService.listar(), []);

  const [busca, setBusca] = useState('');
  const [formAberto, setFormAberto] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editAtivo, setEditAtivo] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // Campos do formulário.
  const [nome, setNome] = useState('');
  const [matricula, setMatricula] = useState('');
  const [login, setLogin] = useState('');
  const [funcao, setFuncao] = useState<FuncaoColaborador>('OPERADOR');
  const [genero, setGenero] = useState<'M' | 'F'>('F');
  const [turno, setTurno] = useState<TurnoColaborador | null>(null);
  const [entSem, setEntSem] = useState('');
  const [saiSem, setSaiSem] = useState('');
  const [entFds, setEntFds] = useState('');
  const [saiFds, setSaiFds] = useState('');
  const [folga, setFolga] = useState<number | null>(null);
  const [admissao, setAdmissao] = useState('');
  const [senha, setSenha] = useState('');
  const [gerenteDev, setGerenteDev] = useState(false);

  const temAcesso = FUNCOES_COM_ACESSO.includes(funcao);

  const filtrados = useMemo(() => {
    const dados = lista.dados ?? [];
    const b = busca.trim().toLowerCase();
    if (!b) return dados;
    return dados.filter(
      (c) =>
        c.nome.toLowerCase().includes(b) ||
        c.matricula.toLowerCase().includes(b),
    );
  }, [lista.dados, busca]);

  const limparForm = () => {
    setEditId(null);
    setNome('');
    setMatricula('');
    setLogin('');
    setFuncao('OPERADOR');
    setGenero('F');
    setTurno(null);
    setEntSem('');
    setSaiSem('');
    setEntFds('');
    setSaiFds('');
    setFolga(null);
    setAdmissao('');
    setSenha('');
    setGerenteDev(false);
  };

  const abrirNovo = () => {
    limparForm();
    setFormAberto(true);
  };

  // Pré-preenche o cadastro quando chega da fila de "não reconhecidos"
  // (com a matrícula/nome do código solto), abrindo o formulário pronto.
  const matriculaInicial = route.params?.matriculaInicial;
  const nomeInicial = route.params?.nomeInicial;
  useEffect(() => {
    if (!matriculaInicial) return;
    setEditId(null);
    setLogin('');
    setSenha('');
    setFuncao('OPERADOR');
    setMatricula(matriculaInicial);
    setNome(nomeInicial ?? '');
    setFormAberto(true);
  }, [matriculaInicial, nomeInicial]);

  const abrirEditar = (c: Colaborador) => {
    setEditId(c.id);
    setNome(c.nome);
    setMatricula(c.matricula);
    setLogin('');
    setFuncao(c.funcao);
    setGenero(c.genero === 'M' ? 'M' : 'F');
    setTurno(c.turno);
    setEntSem(c.entradaSemana ?? '');
    setSaiSem(c.saidaSemana ?? '');
    setEntFds(c.entradaFds ?? '');
    setSaiFds(c.saidaFds ?? '');
    setFolga(c.folgaDiaSemana);
    setAdmissao(c.dataAdmissao ? isoParaDataBR(c.dataAdmissao) : '');
    setEditAtivo(c.ativo);
    setSenha('');
    setGerenteDev(false);
    setFormAberto(true);
    // Precarrega o login atual (guardado como identificador, não vem na lista).
    void colaboradoresService
      .obter(c.id)
      .then((det) => {
        const lg =
          det.identificadores.find((i) => i.tipo === 'LOGIN')?.valor ?? '';
        setLogin(lg);
      })
      .catch(() => undefined);
  };

  const salvar = async () => {
    if (!nome.trim()) {
      notificar('Nome obrigatório', 'Informe o nome do colaborador.');
      return;
    }
    if (!matricula.trim()) {
      notificar('Matrícula obrigatória', 'Informe a matrícula (registro).');
      return;
    }
    // Acesso ao app: ao cadastrar fiscal/supervisor/gerente, a senha é obrigatória.
    if (temAcesso && !editId && senha.trim().length < 6) {
      notificar(
        'Senha de acesso obrigatória',
        'Defina uma senha (mínimo 6 caracteres) para o login do app.',
      );
      return;
    }
    if (temAcesso && senha.trim() && senha.trim().length < 6) {
      notificar('Senha muito curta', 'A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    for (const [rotulo, valor] of [
      ['Entrada Seg–Qui', entSem],
      ['Saída Seg–Qui', saiSem],
      ['Entrada Sex–Sáb', entFds],
      ['Saída Sex–Sáb', saiFds],
    ] as const) {
      if (valor.trim() && !HHMM.test(valor.trim())) {
        notificar('Horário inválido', `${rotulo} deve ser HH:mm (ex.: 08:00).`);
        return;
      }
    }
    let admissaoISO: string | undefined;
    if (admissao.trim()) {
      const iso = dataBRParaISO(admissao.trim());
      if (!iso) {
        notificar(
          'Data de admissão inválida',
          'Use o formato dd/mm/aaaa (ex.: 01/05/2026).',
        );
        return;
      }
      admissaoISO = iso;
    }

    const input = {
      nome: nome.trim(),
      matricula: matricula.trim(),
      login: login.trim() || undefined,
      funcao,
      genero,
      turno: turno ?? undefined,
      entradaSemana: entSem.trim() || undefined,
      saidaSemana: saiSem.trim() || undefined,
      entradaFds: entFds.trim() || undefined,
      saidaFds: saiFds.trim() || undefined,
      folgaDiaSemana: folga ?? undefined,
      dataAdmissao: admissaoISO,
      // Acesso ao app (apenas funções com acesso).
      senha: temAcesso && senha.trim() ? senha.trim() : undefined,
      gerenteDesenvolvedor: funcao === 'GESTOR' ? gerenteDev : undefined,
    };

    setSalvando(true);
    try {
      if (editId) {
        await colaboradoresService.editar(editId, input);
        notificar('Salvo', 'Colaborador atualizado.');
      } else {
        await colaboradoresService.cadastrar(input);
        notificar('Cadastrado', 'Colaborador adicionado.');
      }
      setFormAberto(false);
      limparForm();
      lista.recarregar();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  /** Excluir do quadro (baixa lógica) / reativar — a partir do formulário de edição. */
  const excluirOuReativar = async () => {
    if (!editId) return;
    const ok = await confirmar(
      editAtivo ? 'Excluir do quadro' : 'Reativar colaborador',
      editAtivo
        ? `Excluir ${nome} do quadro? Sai das escalas e das listas. O histórico é mantido e você pode reativar depois.`
        : `Reativar ${nome}? Volta a aparecer nas listas e escalas.`,
      editAtivo ? 'Excluir' : 'Reativar',
    );
    if (!ok) return;
    setSalvando(true);
    try {
      if (editAtivo) await colaboradoresService.inativar(editId);
      else await colaboradoresService.reativar(editId);
      notificar(
        editAtivo ? 'Excluído do quadro' : 'Reativado',
        `${nome} ${editAtivo ? 'saiu do quadro' : 'voltou ao quadro'}.`,
      );
      setFormAberto(false);
      limparForm();
      lista.recarregar();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha na operação.');
    } finally {
      setSalvando(false);
    }
  };

  const alternarAtivo = async (c: Colaborador) => {
    const ok = await confirmar(
      c.ativo ? 'Inativar colaborador' : 'Reativar colaborador',
      c.ativo
        ? `Inativar ${c.nome}? O histórico é preservado.`
        : `Reativar ${c.nome}?`,
      c.ativo ? 'Inativar' : 'Reativar',
    );
    if (!ok) return;
    try {
      if (c.ativo) await colaboradoresService.inativar(c.id);
      else await colaboradoresService.reativar(c.id);
      lista.recarregar();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha na operação.');
    }
  };

  return (
    <Tela aoAtualizar={lista.recarregar} atualizando={lista.atualizando}>
      {/* Formulário de cadastro/edição */}
      {formAberto ? (
        <Cartao titulo={editId ? 'Editar colaborador' : 'Novo colaborador'}>
          <CampoTexto rotulo="Nome" value={nome} onChangeText={setNome} placeholder="Nome completo" />
          <View style={styles.linha}>
            <CampoTexto
              rotulo="Matrícula"
              value={matricula}
              onChangeText={setMatricula}
              placeholder="Ex.: 232152"
              containerStyle={styles.metade}
            />
            <CampoTexto
              rotulo="Login / código"
              value={login}
              onChangeText={setLogin}
              placeholder="Ex.: ana.souza"
              containerStyle={styles.metade}
            />
          </View>

          <Text style={styles.rotulo}>Função</Text>
          <View style={styles.chips}>
            {FUNCOES.map((f) => (
              <Text
                key={f.v}
                onPress={() => setFuncao(f.v)}
                style={[styles.chip, funcao === f.v && styles.chipAtivo]}
              >
                {f.r}
              </Text>
            ))}
          </View>

          <Text style={styles.rotulo}>Conta de acesso (login do app)</Text>
          {temAcesso ? (
            <>
              <Text style={styles.ajudaLogin}>
                {funcao === 'GESTOR' ? 'Gerente' : rotuloFuncao(funcao)} entra no
                app com a <Text style={{ fontWeight: '700' }}>matrícula</Text> como
                login. Defina a senha de acesso.
              </Text>
              <CampoTexto
                rotulo={editId ? 'Nova senha (deixe vazio para manter)' : 'Senha de acesso'}
                value={senha}
                onChangeText={setSenha}
                placeholder="Mínimo 6 caracteres"
                autoCapitalize="none"
                secureTextEntry
              />
              {funcao === 'GESTOR' && (
                <View style={styles.chips}>
                  <Text
                    onPress={() => setGerenteDev(false)}
                    style={[styles.chip, !gerenteDev && styles.chipAtivo]}
                  >
                    Gerente
                  </Text>
                  <Text
                    onPress={() => setGerenteDev(true)}
                    style={[styles.chip, gerenteDev && styles.chipAtivo]}
                  >
                    Gerente desenvolvedor
                  </Text>
                </View>
              )}
            </>
          ) : (
            <Text style={styles.ajudaLogin}>
              Operadores não acessam o app — não precisam de login.
            </Text>
          )}

          <Text style={styles.rotulo}>Gênero (avatar)</Text>
          <View style={styles.chips}>
            {(['F', 'M'] as const).map((g) => (
              <Text
                key={g}
                onPress={() => setGenero(g)}
                style={[styles.chip, genero === g && styles.chipAtivo]}
              >
                {g === 'F' ? 'Mulher' : 'Homem'}
              </Text>
            ))}
          </View>

          <Text style={styles.rotulo}>Turno</Text>
          <View style={styles.chips}>
            {TURNOS.map((t) => (
              <Text
                key={t.v}
                onPress={() => setTurno(turno === t.v ? null : t.v)}
                style={[styles.chip, turno === t.v && styles.chipAtivo]}
              >
                {t.r}
              </Text>
            ))}
          </View>

          <View style={styles.linha}>
            <CampoTexto rotulo="Entrada Seg–Qui" value={entSem} onChangeText={setEntSem} placeholder="08:00" containerStyle={styles.metade} />
            <CampoTexto rotulo="Saída Seg–Qui" value={saiSem} onChangeText={setSaiSem} placeholder="17:00" containerStyle={styles.metade} />
          </View>
          <View style={styles.linha}>
            <CampoTexto rotulo="Entrada Sex–Sáb" value={entFds} onChangeText={setEntFds} placeholder="09:00" containerStyle={styles.metade} />
            <CampoTexto rotulo="Saída Sex–Sáb" value={saiFds} onChangeText={setSaiFds} placeholder="18:00" containerStyle={styles.metade} />
          </View>

          <Text style={styles.rotulo}>Dia de folga</Text>
          <View style={styles.chips}>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <Text
                key={d}
                onPress={() => setFolga(folga === d ? null : d)}
                style={[styles.chip, folga === d && styles.chipAtivo]}
              >
                {NOMES_DIA[d]}
              </Text>
            ))}
          </View>

          <CampoTexto
            rotulo="Data de admissão (contrato)"
            value={admissao}
            onChangeText={(t) => setAdmissao(mascaraDataBR(t))}
            placeholder="dd/mm/aaaa (ex.: 01/05/2026)"
            keyboardType="number-pad"
            autoCapitalize="none"
          />
          <Text style={styles.ajudaLogin}>
            Base do tempo de casa e do contrato de experiência (45/90 dias).
            Pode ser uma data passada. Deixe vazio se ainda não souber.
          </Text>

          <Botao titulo="Salvar" aoPressionar={salvar} carregando={salvando} />
          <Botao
            titulo="Cancelar"
            variante="texto"
            aoPressionar={() => {
              setFormAberto(false);
              limparForm();
            }}
          />
          {editId ? (
            <Botao
              titulo={editAtivo ? 'Excluir do quadro' : 'Reativar colaborador'}
              variante={editAtivo ? 'perigo' : 'secundario'}
              aoPressionar={excluirOuReativar}
              carregando={salvando}
            />
          ) : null}
        </Cartao>
      ) : (
        <>
          <CampoTexto
            rotulo="Buscar"
            value={busca}
            onChangeText={setBusca}
            placeholder="Nome ou matrícula"
          />
          <Botao titulo="Adicionar colaborador" variante="secundario" aoPressionar={abrirNovo} />
        </>
      )}

      {/* Lista */}
      {lista.carregando ? (
        <Carregando />
      ) : lista.erro ? (
        <MensagemErro mensagem={lista.erro} aoTentarNovamente={lista.recarregar} />
      ) : filtrados.length === 0 ? (
        <EstadoVazio
          icone="people-outline"
          titulo="Sem colaboradores"
          descricao="Cadastre operadores e fiscais para vê-los aqui."
        />
      ) : (
        !formAberto &&
        filtrados.map((c) => (
          <TouchableOpacity
            key={c.id}
            activeOpacity={0.7}
            onPress={() => abrirEditar(c)}
            style={[styles.item, !c.ativo && styles.itemInativo]}
          >
            <View style={[styles.avatar, { backgroundColor: cores.primariaClara }]}>
              <Ionicons
                name={c.genero === 'M' ? 'man' : 'woman'}
                size={20}
                color={cores.primaria}
              />
            </View>
            <View style={styles.itemInfo}>
              <Text style={styles.itemNome} numberOfLines={1}>
                {c.nome}
                {!c.ativo ? ' (inativo)' : ''}
              </Text>
              <Text style={styles.itemMeta} numberOfLines={1}>
                Mat. {c.matricula} · {rotuloFuncao(c.funcao)} · {rotuloTurno(c.turno)}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => void alternarAtivo(c)}
              hitSlop={10}
              style={styles.acao}
            >
              <Ionicons
                name={c.ativo ? 'pause-circle-outline' : 'play-circle-outline'}
                size={22}
                color={c.ativo ? cores.textoSecundario : cores.verde}
              />
            </TouchableOpacity>
          </TouchableOpacity>
        ))
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', gap: espacamento.sm },
  metade: { flex: 1, minWidth: 0 },
  rotulo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
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
  ajudaLogin: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: -espacamento.xs,
    marginBottom: espacamento.xs,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: cores.superficie,
    borderRadius: raio.md,
    padding: espacamento.sm,
    marginBottom: espacamento.xs,
    borderWidth: 1,
    borderColor: cores.divisor,
  },
  itemInativo: { opacity: 0.55 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: { flex: 1, paddingHorizontal: espacamento.sm },
  itemNome: { ...tipografia.corpo, fontWeight: '600', color: cores.texto },
  itemMeta: { ...tipografia.legenda, color: cores.textoSecundario, marginTop: 1 },
  acao: { padding: 4 },
});

export default GestaoColaboradoresScreen;
