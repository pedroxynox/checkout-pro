/**
 * Script de seed (cadastro inicial) do Check-out PRO.
 *
 * ÚNICO login de fábrica: o ADMINISTRADOR. As pessoas (fiscais, gerentes e
 * demais colaboradores) NÃO são mais semeadas aqui — devem ser cadastradas no
 * app (Colaboradores), e o login criado por lá. Assim, ao excluir uma pessoa
 * em "Acesso", ela não reaparece.
 *
 * Cria de forma idempotente (upsert por chave única, sem duplicação):
 *  - O usuário ADMINISTRADOR (login individual e único).
 *  - Os 39 operadores do cadastro inicial (Req 6.5.2), excluindo a operadora
 *    desligada e os nomes sempre ignorados. (Operadores NÃO têm login.)
 *  - Dados de configuração do setor (insumos, pedidos recorrentes, metas etc.).
 *
 * Executar: `npm run seed` (ou `npm run db:seed`) no diretório `backend/`.
 * Requer um DATABASE_URL apontando para um PostgreSQL acessível.
 */
import * as bcrypt from 'bcrypt';
import { CategoriaInsumo, Perfil, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Senha inicial aplicada apenas aos usuários recém-criados (gerentes e
// fiscais). Pode ser definida via variável de ambiente SENHA_INICIAL; caso
// contrário, usa um valor padrão que deve ser trocado após o primeiro acesso.
//
// Importante: o hash é definido somente na CRIAÇÃO do usuário (upsert.create).
// Re-execuções do seed NÃO sobrescrevem a senha de usuários já existentes,
// preservando a idempotência e qualquer senha alterada posteriormente.
const SENHA_INICIAL = process.env.SENHA_INICIAL || 'CheckoutPro@2025';
let senhaHashInicial = '';

/**
 * Gera um login (slug) individual e determinístico a partir do nome completo:
 * remove acentos, converte para minúsculas e une as partes com ponto.
 * Ex.: "Carmen Felicia" -> "carmen.felicia".
 */
function slugLogin(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '') // remove caracteres não alfanuméricos
    .replace(/\s+/g, '.');
}

interface SeedGerente {
  nome: string;
  /** Matrícula usada como login (login por matrícula). Se ausente, usa o slug. */
  matricula?: string;
  /** Senha inicial específica; se ausente, usa SENHA_INICIAL. */
  senha?: string;
  /** Perfil; padrão GERENTE. Pedro é o ADMINISTRADOR (acesso total). */
  perfil?: Perfil;
}

// ÚNICA conta de fábrica: o ADMINISTRADOR (acesso total). Todo o restante do
// pessoal é cadastrado no app (Colaboradores). O login é a matrícula.
const GERENTES: SeedGerente[] = [
  {
    nome: 'Pedro Munoz',
    matricula: '232152',
    // Sem senha fraca fixa: usa a SENHA_INICIAL (variável de ambiente) como as
    // demais contas. Deve ser trocada no primeiro acesso. Nunca versionar uma
    // senha real, muito menos para a conta de acesso total.
    perfil: Perfil.ADMINISTRADOR,
  },
];

// 39 operadores do cadastro inicial (Req 6.5.2). Não inclui Patricia Del Valle
// Palmares Fernandez (desligada) nem Paola Rio / Claudia Bertushi / Nancy
// Coromoto Fuentes Lopez (sempre ignorados).
const OPERADORES: string[] = [
  'VALDIR JOSE',
  'NAIROBI LUYANDO',
  'LAURISMAR DEL CARMEN SOJO GUEVARA',
  'NARIA PIRES',
  'FRANCILEUDA MARQUES',
  'EDECI SANTA LUCIA',
  'PATRICIA DE OLIVEIRA',
  'HIAGO FERNANDO VIEIRA',
  'TAINA MARTINELLI TERRES',
  'JOANA PONTES',
  'TAINA IARA DENOVAC BITENCOURT',
  'STEFANIE DRUZIAN WALTRICK',
  'SILVANA DE FREITAS SANTOS',
  'ROSMELY DE LA COROMOTO GUZMAN VIERA',
  'MARLENIS CAROLINA PERDOMO GUZMAN',
  'MARIANGEL ANDREINA SOTILLO CEDENO',
  'MARIA ANGELES YNOJOSA TOVAR',
  'JAIRO RODRIGUES MOURA',
  'ELIZIANE SALGADO CASTURIAGA',
  'CARMEN MARIA ASTUDILLO LOPEZ',
  'ARLENIS BATISTA GARLOBO',
  'ALEJANDRA SARAHY PINO BORROME',
  'OLGA MARIA CHIRINOS CADENA',
  'GLORIA MARIA TOVAR BETHERMY',
  'FRANCIELE SILVEIRA DOS SANTOS',
  'ELIAS DOS SANTOS CAMARGO',
  'DAVID ENRIQUE GARCIA RAMIREZ',
  'ERICK LEONARDO BRITO ZAPATA',
  'ENEIDA JOMARA SILVA RODRIGUES',
  'ORLIANNYS DEL CARMEN ROMERO AGUILERA',
  'AILIN OCHOA',
  'YESENIA DEVERA',
  'YUDISBEL MERINO TROCHE',
  'MATHEUS HENRIQUE DA SILVA GIACOMO',
  'SONIA MARIA RODRIGUES JUSTINO',
  'FELIPE GUSTAVO DOS SANTOS VICENTE',
  'TAYLA RESPLANDE SILVA',
  'BARBARA FABIANA BATISTA',
  'CAMILA RIBEIRO DA COSTA',
];

/**
 * Backfill idempotente das fichas `Colaborador` (funcao FISCAL) a partir dos
 * fiscais semeados, espelhando a migração `9s_colaboradores_de_fiscais`.
 *
 * A migração `9s` roda uma única vez (e, numa base recém-criada, roda ANTES do
 * seed criar os fiscais, portanto sobre tabela vazia). Sem este passo, um
 * `migrate deploy` + `db seed` deixa `colaboradores` vazia. Aqui recriamos a
 * mesma lógica insert-only: usa a matrícula (= login do usuário) como registro
 * único e vincula a mesma conta de acesso (`usuarioId`). Só cria o que falta
 * (checagem por `usuarioId` e por `matricula`), de modo que re-execuções não
 * duplicam fichas nem identificadores.
 */
async function seedColaboradoresFiscais(): Promise<void> {
  // Tipo de contrato PADRÃO (o 6x1 vigente, semeado na migração 9zy). O vínculo
  // do colaborador ao seu tipo de contrato é OBRIGATÓRIO (fonte única das regras
  // de jornada/TAC), então toda ficha criada aqui conecta o padrão.
  const padrao = await prisma.tipoContratoJornada.findFirst({
    where: { padrao: true },
    orderBy: { criadoEm: 'asc' },
    select: { id: true },
  });
  if (!padrao) {
    throw new Error(
      'Seed: nenhum tipo de contrato padrão encontrado (rode as migrações antes do seed).',
    );
  }

  const fiscais = await prisma.fiscal.findMany({
    where: { usuarioId: { not: null } },
    select: { nome: true, usuarioId: true },
  });

  for (const f of fiscais) {
    if (!f.usuarioId) continue;
    const usuario = await prisma.usuario.findUnique({
      where: { id: f.usuarioId },
      select: { login: true },
    });
    if (!usuario) continue;

    // Só cria a ficha se ainda não existir (por usuarioId nem por matrícula),
    // preservando a idempotência do backfill.
    const jaPorUsuario = await prisma.colaborador.findUnique({
      where: { usuarioId: f.usuarioId },
      select: { id: true },
    });
    const jaPorMatricula = await prisma.colaborador.findUnique({
      where: { matricula: usuario.login },
      select: { id: true },
    });

    if (!jaPorUsuario && !jaPorMatricula) {
      await prisma.colaborador.create({
        data: {
          matricula: usuario.login,
          nome: f.nome,
          funcao: 'FISCAL',
          usuarioId: f.usuarioId,
          tipoContratoJornada: { connect: { id: padrao.id } },
        },
      });
    }
  }

  // Identificador MATRICULA para as fichas que ainda não o têm (idempotente
  // pela unicidade [tipo, valor]).
  const colaboradores = await prisma.colaborador.findMany({
    select: { id: true, matricula: true },
  });
  for (const c of colaboradores) {
    const existente = await prisma.colaboradorIdentificador.findUnique({
      where: { tipo_valor: { tipo: 'MATRICULA', valor: c.matricula } },
      select: { id: true },
    });
    if (!existente) {
      await prisma.colaboradorIdentificador.create({
        data: {
          colaboradorId: c.id,
          tipo: 'MATRICULA',
          valor: c.matricula,
        },
      });
    }
  }
}

async function seedGerentes(): Promise<void> {
  for (const g of GERENTES) {
    const login = g.matricula ?? slugLogin(g.nome);
    const senhaHash = g.senha ? await bcrypt.hash(g.senha, 10) : senhaHashInicial;
    const perfil = g.perfil ?? Perfil.GERENTE;
    // Usuário individual e único por gerente (Req 6.4.6, 6.4.7, 7.1.4).
    await prisma.usuario.upsert({
      where: { login },
      update: { perfil, nome: g.nome },
      create: {
        login,
        nome: g.nome,
        senhaHash,
        perfil,
      },
    });
  }
}

async function seedOperadores(): Promise<void> {
  for (const nome of OPERADORES) {
    await prisma.operador.upsert({
      where: { nome },
      update: {},
      create: { nome },
    });
  }
}

// Quadro de Operadores (turno fixo): horário Seg–Qui, horário Sex–Sáb e dia de
// folga (0=Dom..6=Sáb). Fonte: escala enviada pelo gestor. Não inclui os
// fiscais nem o gerente (Pedro). Os que trabalham os 6 dias têm folga no
// domingo (0), ainda sem horário de domingo.
interface SeedTurno {
  nome: string;
  genero: 'M' | 'F';
  sem: [string, string]; // [entrada, saída] Seg–Qui
  fds: [string, string]; // [entrada, saída] Sex–Sáb
  folga: number; // 0=Dom..6=Sáb
}

const OPERADOR_TURNOS: SeedTurno[] = [
  // Folga SEGUNDA (1)
  { nome: 'FELIPE GUSTAVO DOS SANTOS VICENTE', genero: 'M', sem: ['06:50', '15:50'], fds: ['06:50', '16:50'], folga: 1 },
  { nome: 'AILIN OCHOA', genero: 'F', sem: ['06:50', '15:50'], fds: ['06:50', '16:50'], folga: 1 },
  { nome: 'ENEIDA JOMARA SILVA RODRIGUES', genero: 'F', sem: ['06:50', '15:50'], fds: ['06:50', '16:50'], folga: 1 },
  { nome: 'MATHEUS HENRIQUE DA SILVA GIACOMO', genero: 'M', sem: ['06:50', '15:50'], fds: ['06:50', '16:50'], folga: 1 },
  { nome: 'YESENIA DEVERA', genero: 'F', sem: ['08:00', '17:00'], fds: ['08:00', '18:00'], folga: 1 },
  { nome: 'ORLIANNYS DEL CARMEN ROMERO AGUILERA', genero: 'F', sem: ['11:00', '20:00'], fds: ['11:00', '21:00'], folga: 1 },
  { nome: 'MARYOLIS ALEXANDRA LANZA LAMAR', genero: 'F', sem: ['13:50', '22:50'], fds: ['12:50', '22:50'], folga: 1 },
  { nome: 'DAVID ENRIQUE GARCIA RAMIREZ', genero: 'M', sem: ['13:50', '22:50'], fds: ['12:50', '22:50'], folga: 1 },
  { nome: 'ERICK LEONARDO BRITO ZAPATA', genero: 'M', sem: ['13:50', '22:50'], fds: ['12:50', '22:50'], folga: 1 },
  { nome: 'SONIA MARIA RODRIGUES JUSTINO', genero: 'F', sem: ['13:50', '22:50'], fds: ['12:50', '22:50'], folga: 1 },
  { nome: 'YUDISBEL MERINO TROCHE', genero: 'F', sem: ['13:50', '22:50'], fds: ['12:50', '22:50'], folga: 1 },
  // Folga TERÇA (2)
  { nome: 'FRANCILEUDA MARQUES', genero: 'F', sem: ['09:00', '18:00'], fds: ['09:00', '19:00'], folga: 2 },
  { nome: 'MARIA DE LOURDES CORREA CASTILLA', genero: 'F', sem: ['10:00', '19:00'], fds: ['10:00', '20:00'], folga: 2 },
  { nome: 'MARIANGEL ANDREINA SOTILLO CEDENO', genero: 'F', sem: ['13:50', '22:50'], fds: ['12:50', '22:50'], folga: 2 },
  { nome: 'SILVANA DE FREITAS SANTOS', genero: 'F', sem: ['13:50', '22:50'], fds: ['12:50', '22:50'], folga: 2 },
  { nome: 'TAINA IARA DENOVAC BITENCOURT', genero: 'F', sem: ['13:50', '22:50'], fds: ['12:50', '22:50'], folga: 2 },
  { nome: 'MARLENIS CAROLINA PERDOMO GUZMAN', genero: 'F', sem: ['13:50', '22:50'], fds: ['12:50', '22:50'], folga: 2 },
  // Folga QUARTA (3)
  { nome: 'NAIROBI LUYANDO', genero: 'F', sem: ['06:50', '15:50'], fds: ['06:50', '16:50'], folga: 3 },
  { nome: 'LAURISMAR DEL CARMEN SOJO GUEVARA', genero: 'F', sem: ['06:50', '15:50'], fds: ['06:50', '16:50'], folga: 3 },
  { nome: 'NARIA PIRES', genero: 'F', sem: ['09:00', '18:00'], fds: ['09:00', '19:00'], folga: 3 },
  { nome: 'PATRICIA DE OLIVEIRA', genero: 'F', sem: ['10:00', '19:00'], fds: ['10:00', '20:00'], folga: 3 },
  { nome: 'STEFANIE DRUZIAN WALTRICK', genero: 'F', sem: ['13:50', '22:50'], fds: ['12:50', '22:50'], folga: 3 },
  { nome: 'ROSMELY DE LA COROMOTO GUZMAN VIERA', genero: 'F', sem: ['13:50', '22:50'], fds: ['12:50', '22:50'], folga: 3 },
  { nome: 'YANNELIT SUBERO', genero: 'F', sem: ['13:50', '22:50'], fds: ['12:50', '22:50'], folga: 3 },
  { nome: 'ALEJANDRA SARAHY PINO BORROME', genero: 'F', sem: ['13:50', '22:50'], fds: ['12:50', '22:50'], folga: 3 },
  { nome: 'ELIZIANE SALGADO CASTURIAGA', genero: 'F', sem: ['13:50', '22:50'], fds: ['12:50', '22:50'], folga: 3 },
  { nome: 'OLGA MARIA CHIRINOS CADENA', genero: 'F', sem: ['16:00', '22:00'], fds: ['16:00', '22:00'], folga: 3 },
  // Folga QUINTA (4)
  { nome: 'VALDIR JOSE', genero: 'M', sem: ['06:50', '15:50'], fds: ['06:50', '16:50'], folga: 4 },
  { nome: 'EDECI SANTA LUCIA', genero: 'F', sem: ['09:00', '18:00'], fds: ['09:00', '19:00'], folga: 4 },
  { nome: 'JAIRO RODRIGUES MOURA', genero: 'M', sem: ['13:50', '22:50'], fds: ['12:50', '22:50'], folga: 4 },
  { nome: 'MARIA ANGELES YNOJOSA TOVAR', genero: 'F', sem: ['13:50', '22:50'], fds: ['12:50', '22:50'], folga: 4 },
  { nome: 'CARMEN MARIA ASTUDILLO LOPEZ', genero: 'F', sem: ['13:50', '22:50'], fds: ['12:50', '22:50'], folga: 4 },
  { nome: 'ARLENIS BATISTA GARLOBO', genero: 'F', sem: ['13:50', '22:50'], fds: ['12:50', '22:50'], folga: 4 },
  { nome: 'GLORIA MARIA TOVAR BETHERMY', genero: 'F', sem: ['16:50', '22:50'], fds: ['16:50', '22:50'], folga: 4 },
  // Folga SEXTA (5)
  { nome: 'HIAGO FERNANDO VIEIRA', genero: 'M', sem: ['10:00', '19:00'], fds: ['10:00', '20:00'], folga: 5 },
  // Trabalham os 6 dias — folga DOMINGO (0)
  { nome: 'TAINA MARTINELLI TERRES', genero: 'F', sem: ['12:00', '18:00'], fds: ['12:00', '18:00'], folga: 0 },
  { nome: 'JOANA PONTES', genero: 'F', sem: ['13:00', '19:00'], fds: ['13:00', '19:00'], folga: 0 },
  { nome: 'FRANCIELE SILVEIRA DOS SANTOS', genero: 'F', sem: ['16:50', '22:50'], fds: ['16:50', '22:50'], folga: 0 },
  { nome: 'ELIAS DOS SANTOS CAMARGO', genero: 'M', sem: ['16:50', '22:50'], fds: ['16:50', '22:50'], folga: 0 },
  { nome: 'CAMILA RIBEIRO DA COSTA', genero: 'F', sem: ['13:50', '22:50'], fds: ['12:50', '22:50'], folga: 0 },
];

async function seedOperadorTurnos(): Promise<void> {
  for (const t of OPERADOR_TURNOS) {
    await prisma.operadorTurno.upsert({
      where: { nome: t.nome },
      update: {
        genero: t.genero,
        entradaSemana: t.sem[0],
        saidaSemana: t.sem[1],
        entradaFds: t.fds[0],
        saidaFds: t.fds[1],
        folgaDiaSemana: t.folga,
        ativo: true,
      },
      create: {
        nome: t.nome,
        genero: t.genero,
        entradaSemana: t.sem[0],
        saidaSemana: t.sem[1],
        entradaFds: t.fds[0],
        saidaFds: t.fds[1],
        folgaDiaSemana: t.folga,
      },
    });
  }
}

interface SeedInsumo {
  nome: string;
  categoria: CategoriaInsumo;
  /** Unidade base de contagem do saldo. */
  unidade: string;
  /** Embalagem de entrada e quantas unidades base ela contém. */
  embalagem: string;
  fatorEmbalagem: number;
  limiteMinimo: number;
}

// Os 4 insumos padrão do setor (Almoxarifado). Mensurados em QUANTIDADE, não
// em R$. A entrada é registrada por embalagem (multiplicada pelo fator) e o
// saldo/consumo são contados na unidade base.
const INSUMOS_PADRAO: SeedInsumo[] = [
  { nome: 'Sacolas', categoria: CategoriaInsumo.SACOLA, unidade: 'sacola', embalagem: 'fardo', fatorEmbalagem: 1000, limiteMinimo: 50000 },
  { nome: 'Bobina', categoria: CategoriaInsumo.BOBINA, unidade: 'bobina', embalagem: 'caixa', fatorEmbalagem: 16, limiteMinimo: 16 },
  { nome: 'Pano', categoria: CategoriaInsumo.PANO, unidade: 'metro', embalagem: 'rolo', fatorEmbalagem: 100, limiteMinimo: 100 },
  { nome: 'Álcool', categoria: CategoriaInsumo.ALCOOL, unidade: 'litro', embalagem: 'galão', fatorEmbalagem: 5, limiteMinimo: 5 },
];

async function seedInsumos(): Promise<void> {
  // Estoque inicial em embalagens.
  const ESTOQUE_INICIAL: Record<string, number> = {
    'Sacolas': 200,    // 200 fardos = 200.000 sacolas
    'Bobina': 6,       // 6 caixas = 96 bobinas
    'Pano': 2,         // 2 rolos = 200 metros
    'Álcool': 4,       // 4 galões = 20 litros
  };

  for (const i of INSUMOS_PADRAO) {
    const existente = await prisma.insumo.findFirst({ where: { nome: i.nome } });
    if (existente) {
      await prisma.insumo.update({
        where: { id: existente.id },
        data: {
          categoria: i.categoria,
          unidade: i.unidade,
          embalagem: i.embalagem,
          fatorEmbalagem: i.fatorEmbalagem,
          limiteMinimo: i.limiteMinimo,
          ativo: true,
        },
      });
      // Inserir movimento inicial se não existe nenhum.
      const temMovimento = await prisma.movimentoEstoque.findFirst({
        where: { insumoId: existente.id },
      });
      if (!temMovimento) {
        const embalagens = ESTOQUE_INICIAL[i.nome] ?? 0;
        if (embalagens > 0) {
          await prisma.movimentoEstoque.create({
            data: {
              insumoId: existente.id,
              delta: embalagens * i.fatorEmbalagem,
              origem: 'ESTOQUE_INICIAL',
            },
          });
        }
      }
    } else {
      const insumo = await prisma.insumo.create({
        data: {
          nome: i.nome,
          categoria: i.categoria,
          unidade: i.unidade,
          embalagem: i.embalagem,
          fatorEmbalagem: i.fatorEmbalagem,
          limiteMinimo: i.limiteMinimo,
          saldo: 0,
        },
      });
      // Inserir movimento inicial.
      const embalagens = ESTOQUE_INICIAL[i.nome] ?? 0;
      if (embalagens > 0) {
        await prisma.movimentoEstoque.create({
          data: {
            insumoId: insumo.id,
            delta: embalagens * i.fatorEmbalagem,
            origem: 'ESTOQUE_INICIAL',
          },
        });
      }
    }
  }
}

async function seedEscalas(): Promise<void> {
  // Definir folgas por nome e dia da semana (0=Dom, 1=Seg, ..., 6=Sáb)
  const FOLGAS: Record<string, number> = {
    'Karen Nicholle Mendoza Barro': 1,       // Segunda
    'Maryolis Alexandra Lanza Lamar': 1,     // Segunda
    'Josiane Cardoso da Silva': 1,           // Segunda
    'Betzabeth Elisa Castellano Reyes': 2,   // Terça
    'Raquel Silve De Oliveira Beneton': 2,   // Terça
    'Carmen Felicia Moreno': 2,              // Terça
    'Yannelyt Elizabet Lopez Subero': 3,     // Quarta
    'Sheila Vieira': 3,                      // Quarta
    'Auri Nellys Coronado De Garcia': 4,     // Quinta
    'Fabiana Sirley Sarafim': 4,             // Quinta
  };

  // Horários por turno:
  // ABERTURA (normal): Seg-Qui 06:50-15:50, Sex-Sáb 06:50-16:50
  // ABERTURA (especial - Josiane): Seg-Qui 08:00-17:00, Sex-Sáb 08:00-18:00
  // INTERMEDIARIO (normal): Seg-Qui 11:00-20:00, Sex-Sáb 11:00-21:00
  // INTERMEDIARIO (especial - Auri): Seg-Qui 12:00-21:00, Sex-Sáb 12:00-22:00
  // FECHAMENTO: Seg-Qui 13:50-22:50, Sex-Sáb 12:50-22:50

  interface HorarioDia {
    entrada: string;
    saida: string;
  }

  type HorarioPorDia = Record<number, HorarioDia>; // diaSemana -> horario

  function horarioAbertura(especial: boolean): HorarioPorDia {
    if (especial) {
      return {
        1: { entrada: '08:00', saida: '17:00' },
        2: { entrada: '08:00', saida: '17:00' },
        3: { entrada: '08:00', saida: '17:00' },
        4: { entrada: '08:00', saida: '17:00' },
        5: { entrada: '08:00', saida: '18:00' },
        6: { entrada: '08:00', saida: '18:00' },
        0: { entrada: '08:00', saida: '17:00' }, // Domingo
      };
    }
    return {
      1: { entrada: '06:50', saida: '15:50' },
      2: { entrada: '06:50', saida: '15:50' },
      3: { entrada: '06:50', saida: '15:50' },
      4: { entrada: '06:50', saida: '15:50' },
      5: { entrada: '06:50', saida: '16:50' },
      6: { entrada: '06:50', saida: '16:50' },
      0: { entrada: '06:50', saida: '15:50' }, // Domingo
    };
  }

  function horarioIntermediario(especial: boolean): HorarioPorDia {
    if (especial) {
      return {
        1: { entrada: '12:00', saida: '21:00' },
        2: { entrada: '12:00', saida: '21:00' },
        3: { entrada: '12:00', saida: '21:00' },
        4: { entrada: '12:00', saida: '21:00' },
        5: { entrada: '12:00', saida: '22:00' },
        6: { entrada: '12:00', saida: '22:00' },
        0: { entrada: '12:00', saida: '21:00' }, // Domingo
      };
    }
    return {
      1: { entrada: '11:00', saida: '20:00' },
      2: { entrada: '11:00', saida: '20:00' },
      3: { entrada: '11:00', saida: '20:00' },
      4: { entrada: '11:00', saida: '20:00' },
      5: { entrada: '11:00', saida: '21:00' },
      6: { entrada: '11:00', saida: '21:00' },
      0: { entrada: '11:00', saida: '20:00' }, // Domingo
    };
  }

  function horarioFechamento(): HorarioPorDia {
    return {
      1: { entrada: '13:50', saida: '22:50' },
      2: { entrada: '13:50', saida: '22:50' },
      3: { entrada: '13:50', saida: '22:50' },
      4: { entrada: '13:50', saida: '22:50' },
      5: { entrada: '12:50', saida: '22:50' },
      6: { entrada: '12:50', saida: '22:50' },
      0: { entrada: '13:50', saida: '22:50' }, // Domingo
    };
  }

  const fiscais = await prisma.fiscal.findMany();

  for (const fiscal of fiscais) {
    const folgaDia = FOLGAS[fiscal.nome] ?? -1; // -1 = sem folga definida

    let horarios: HorarioPorDia;
    if (fiscal.turno === 'ABERTURA') {
      horarios = horarioAbertura(fiscal.especial);
    } else if (fiscal.turno === 'INTERMEDIARIO') {
      horarios = horarioIntermediario(fiscal.especial);
    } else {
      horarios = horarioFechamento();
    }

    // Criar entrada para cada dia da semana (0-6)
    for (let dia = 0; dia <= 6; dia++) {
      const folga = dia === folgaDia;
      const h = horarios[dia];

      // Buscar se já existe (idempotência)
      const existente = await prisma.escalaEntry.findFirst({
        where: { funcionarioId: fiscal.id, diaSemana: dia },
      });

      if (existente) {
        await prisma.escalaEntry.update({
          where: { id: existente.id },
          data: {
            entrada: folga ? null : h?.entrada ?? null,
            saida: folga ? null : h?.saida ?? null,
            folga,
            especial: fiscal.especial,
            intervaloMin: 120, // 2h de intervalo para todos
          },
        });
      } else {
        await prisma.escalaEntry.create({
          data: {
            funcionarioId: fiscal.id,
            diaSemana: dia,
            entrada: folga ? null : h?.entrada ?? null,
            saida: folga ? null : h?.saida ?? null,
            folga,
            especial: fiscal.especial,
            intervaloMin: 120,
          },
        });
      }
    }
  }
}

async function seedPedidosRecorrentes(): Promise<void> {
  // Configuración por defecto de pedidos recurrentes.
  // Álcool: 4 galões, semanal (lunes)
  // Bobina: 6 caixas, semanal (lunes)
  // Pano: 2 rolos, semanal (lunes)
  // Sacolas: 200 fardos, quinzenal (lunes)
  const configs: { nome: string; quantidade: number; frequenciaDias: number }[] = [
    { nome: 'Álcool', quantidade: 4, frequenciaDias: 7 },
    { nome: 'Bobina', quantidade: 6, frequenciaDias: 7 },
    { nome: 'Pano', quantidade: 2, frequenciaDias: 7 },
    { nome: 'Sacolas', quantidade: 200, frequenciaDias: 15 },
  ];

  for (const cfg of configs) {
    const insumo = await prisma.insumo.findFirst({ where: { nome: cfg.nome } });
    if (!insumo) continue;

    const existente = await prisma.pedidoRecorrente.findFirst({
      where: { insumoId: insumo.id, ativo: true },
    });
    if (existente) {
      await prisma.pedidoRecorrente.update({
        where: { id: existente.id },
        data: { quantidade: cfg.quantidade, frequenciaDias: cfg.frequenciaDias, diaSugestao: 1 },
      });
    } else {
      await prisma.pedidoRecorrente.create({
        data: {
          insumoId: insumo.id,
          quantidade: cfg.quantidade,
          frequenciaDias: cfg.frequenciaDias,
          diaSugestao: 1, // Segunda-feira
        },
      });
    }
  }
}

async function seedMetasIndicador(): Promise<void> {
  // Metas padrão dos indicadores (fonte única de verdade configurável).
  const metas: { tipo: string; meta: number }[] = [
    { tipo: 'TROCO_SOLIDARIO', meta: 2000 },
    { tipo: 'RECARGAS_CELULAR', meta: 2000 },
    { tipo: 'CANCELAMENTO_ITENS', meta: 0.75 },
    { tipo: 'CANCELAMENTO_CUPOM', meta: 0.5 },
    { tipo: 'DEVOLUCOES', meta: 0.05 },
  ];
  for (const m of metas) {
    const existente = await prisma.metaIndicador.findUnique({
      where: { tipo: m.tipo },
    });
    if (!existente) {
      await prisma.metaIndicador.create({ data: { tipo: m.tipo, meta: m.meta } });
    }
  }
}

async function seedConfigApae(): Promise<void> {
  const existente = await prisma.configApae.findUnique({ where: { id: 'apae' } });
  if (!existente) {
    await prisma.configApae.create({
      data: { id: 'apae', precoSacola: 0.49, metaMensal: 500 },
    });
  }
}

async function seedConfigVendas(): Promise<void> {
  const existente = await prisma.configVendas.findUnique({
    where: { id: 'vendas' },
  });
  if (!existente) {
    await prisma.configVendas.create({
      data: { id: 'vendas', metaMensal: 0 },
    });
  }
}

async function main(): Promise<void> {
  // Gera o hash da senha inicial uma única vez antes de criar os usuários.
  senhaHashInicial = await bcrypt.hash(SENHA_INICIAL, 10);

  await seedColaboradoresFiscais();
  await seedGerentes();
  await seedOperadores();
  await seedOperadorTurnos();
  await seedInsumos();
  await seedEscalas();
  await seedPedidosRecorrentes();
  await seedMetasIndicador();
  await seedConfigApae();
  await seedConfigVendas();

  const totalUsuarios = await prisma.usuario.count();
  const totalFiscais = await prisma.fiscal.count();
  const totalColaboradores = await prisma.colaborador.count();
  const totalOperadores = await prisma.operador.count();
  const totalInsumos = await prisma.insumo.count();

  // eslint-disable-next-line no-console
  console.log(
    `Seed concluído: ${totalFiscais} fiscais, ${GERENTES.length} gerentes, ` +
      `${totalColaboradores} colaboradores, ${totalOperadores} operadores, ` +
      `${totalInsumos} insumos e ${totalUsuarios} usuários (logins individuais).`,
  );
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Falha ao executar o seed:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
