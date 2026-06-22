/**
 * Script de seed (cadastro inicial) do Check-out PRO.
 *
 * Cria de forma idempotente (upsert por chave única, sem duplicação):
 *  - Fiscais por turno, cada um com um `Usuario` de login individual e único
 *    (Req 6.4.2-6.4.5, 6.4.8, 6.4.11, 7.1.4).
 *  - Gerentes (perfil GERENTE), cada um com um `Usuario` de login individual
 *    (Req 6.4.6, 6.4.7).
 *  - Os 39 operadores do cadastro inicial (Req 6.5.2), excluindo a operadora
 *    desligada e os nomes sempre ignorados.
 *
 * Executar: `npm run seed` (ou `npm run db:seed`) no diretório `backend/`.
 * Requer um DATABASE_URL apontando para um PostgreSQL acessível.
 */
import * as bcrypt from 'bcrypt';
import { CategoriaInsumo, Perfil, PrismaClient, TurnoFiscal } from '@prisma/client';

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

interface SeedFiscal {
  nome: string;
  matricula: string;
  turno: TurnoFiscal;
  especial?: boolean;
}

// Fiscais cadastradas com matrícula (login por matrícula). A senha inicial é a
// própria matrícula (pode ser alterada depois).
const FISCAIS: SeedFiscal[] = [
  // Turno de abertura (Req 6.4.2)
  { nome: 'Carmen Felicia Moreno', matricula: '232150', turno: TurnoFiscal.ABERTURA },
  { nome: 'Fabiana Sirley Sarafim', matricula: '243183', turno: TurnoFiscal.ABERTURA },
  // Josiane Cardoso possui escala especial individual (Req 6.4.8)
  { nome: 'Josiane Cardoso da Silva', matricula: '227315', turno: TurnoFiscal.ABERTURA, especial: true },
  // Turno intermediário (Req 6.4.3)
  { nome: 'Sheila Vieira', matricula: '234958', turno: TurnoFiscal.INTERMEDIARIO },
  { nome: 'Auri Nellys Coronado De Garcia', matricula: '232849', turno: TurnoFiscal.INTERMEDIARIO, especial: true },
  { nome: 'Raquel Silve De Oliveira Beneton', matricula: '248011', turno: TurnoFiscal.INTERMEDIARIO },
  // Turno de fechamento (Req 6.4.4)
  { nome: 'Karen Nicholle Mendoza Barro', matricula: '223747', turno: TurnoFiscal.FECHAMENTO },
  { nome: 'Betzabeth Elisa Castellano Reyes', matricula: '231787', turno: TurnoFiscal.FECHAMENTO },
  { nome: 'Maryolis Alexandra Lanza Lamar', matricula: '239242', turno: TurnoFiscal.FECHAMENTO },
  { nome: 'Yannelyt Elizabet Lopez Subero', matricula: '233902', turno: TurnoFiscal.FECHAMENTO },
];

interface SeedGerente {
  nome: string;
  /** Matrícula usada como login (login por matrícula). Se ausente, usa o slug. */
  matricula?: string;
  /** Senha inicial específica; se ausente, usa SENHA_INICIAL. */
  senha?: string;
  /** Perfil; padrão GERENTE. Pedro é o GERENTE_DESENVOLVEDOR (acesso total). */
  perfil?: Perfil;
}

// Gerentes com perfil GERENTE (Req 6.4.6). O login é a matrícula, quando
// informada; caso contrário, o slug do nome.
const GERENTES: SeedGerente[] = [
  {
    nome: 'Pedro Munoz',
    matricula: '232152',
    senha: '123456',
    perfil: Perfil.GERENTE_DESENVOLVEDOR,
  },
  { nome: 'Arlete Pacheco Fernandes' },
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

async function seedFiscais(): Promise<void> {
  for (const f of FISCAIS) {
    const login = f.matricula;
    // Senha inicial = a própria matrícula (login por matrícula).
    const senhaHash = await bcrypt.hash(f.matricula, 10);
    // Usuário individual e único por fiscal (Req 6.4.11, 7.1.4).
    const usuario = await prisma.usuario.upsert({
      where: { login },
      update: { perfil: Perfil.FISCAL, nome: f.nome },
      create: {
        login,
        nome: f.nome,
        senhaHash,
        perfil: Perfil.FISCAL,
      },
    });

    await prisma.fiscal.upsert({
      where: { nome: f.nome },
      update: {
        turno: f.turno,
        especial: f.especial ?? false,
        usuarioId: usuario.id,
      },
      create: {
        nome: f.nome,
        turno: f.turno,
        especial: f.especial ?? false,
        usuarioId: usuario.id,
      },
    });
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

async function main(): Promise<void> {
  // Gera o hash da senha inicial uma única vez antes de criar os usuários.
  senhaHashInicial = await bcrypt.hash(SENHA_INICIAL, 10);

  await seedFiscais();
  await seedGerentes();
  await seedOperadores();
  await seedInsumos();
  await seedEscalas();
  await seedPedidosRecorrentes();

  const totalUsuarios = await prisma.usuario.count();
  const totalFiscais = await prisma.fiscal.count();
  const totalOperadores = await prisma.operador.count();
  const totalInsumos = await prisma.insumo.count();

  // eslint-disable-next-line no-console
  console.log(
    `Seed concluído: ${totalFiscais} fiscais, ${GERENTES.length} gerentes, ` +
      `${totalOperadores} operadores, ${totalInsumos} insumos e ${totalUsuarios} usuários (logins individuais).`,
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
