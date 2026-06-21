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
  { nome: 'Auri Nellys Coronado De Garcia', matricula: '232849', turno: TurnoFiscal.INTERMEDIARIO },
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
  { nome: 'Sacolas', categoria: CategoriaInsumo.SACOLA, unidade: 'sacola', embalagem: 'fardo', fatorEmbalagem: 1000, limiteMinimo: 1000 },
  { nome: 'Bobina', categoria: CategoriaInsumo.BOBINA, unidade: 'bobina', embalagem: 'caixa', fatorEmbalagem: 20, limiteMinimo: 20 },
  { nome: 'Pano', categoria: CategoriaInsumo.PANO, unidade: 'metro', embalagem: 'rolo', fatorEmbalagem: 100, limiteMinimo: 100 },
  { nome: 'Álcool', categoria: CategoriaInsumo.ALCOOL, unidade: 'litro', embalagem: 'galão', fatorEmbalagem: 5, limiteMinimo: 5 },
];

async function seedInsumos(): Promise<void> {
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
    } else {
      await prisma.insumo.create({
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
