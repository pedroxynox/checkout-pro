/**
 * Script de seed (cadastro inicial) do Stok Center.
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
import { Perfil, PrismaClient, TurnoFiscal } from '@prisma/client';

const prisma = new PrismaClient();

// Senha inicial aplicada apenas aos usuários recém-criados (gerentes e
// fiscais). Pode ser definida via variável de ambiente SENHA_INICIAL; caso
// contrário, usa um valor padrão que deve ser trocado após o primeiro acesso.
//
// Importante: o hash é definido somente na CRIAÇÃO do usuário (upsert.create).
// Re-execuções do seed NÃO sobrescrevem a senha de usuários já existentes,
// preservando a idempotência e qualquer senha alterada posteriormente.
const SENHA_INICIAL = process.env.SENHA_INICIAL || 'StokCenter@2025';
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
  turno: TurnoFiscal;
  especial?: boolean;
}

const FISCAIS: SeedFiscal[] = [
  // Turno de abertura (Req 6.4.2)
  { nome: 'Carmen Felicia', turno: TurnoFiscal.ABERTURA },
  { nome: 'Fabiana Sirlei Sarafim', turno: TurnoFiscal.ABERTURA },
  // Josiane Cardoso possui escala especial individual (Req 6.4.8)
  { nome: 'Josiane Cardoso', turno: TurnoFiscal.ABERTURA, especial: true },
  // Turno intermediário (Req 6.4.3)
  { nome: 'Sheila Vieira', turno: TurnoFiscal.INTERMEDIARIO },
  { nome: 'Auri Nellys Coronado de Garcia', turno: TurnoFiscal.INTERMEDIARIO },
  { nome: 'Raquel Silva de Oliveira Beneton', turno: TurnoFiscal.INTERMEDIARIO },
  // Turno de fechamento (Req 6.4.4)
  { nome: 'Karen Barro', turno: TurnoFiscal.FECHAMENTO },
  { nome: 'Betzabeth Elisa Castellano Reyes', turno: TurnoFiscal.FECHAMENTO },
  { nome: 'Maryolis Alexandra Lanza Lamar', turno: TurnoFiscal.FECHAMENTO },
  { nome: 'Yannelit Subero', turno: TurnoFiscal.FECHAMENTO },
];

// Gerentes com perfil GERENTE (Req 6.4.6)
const GERENTES: string[] = ['Pedro Munoz', 'Arlete Pacheco Fernandes'];

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
    const login = slugLogin(f.nome);
    // Usuário individual e único por fiscal (Req 6.4.11, 7.1.4).
    const usuario = await prisma.usuario.upsert({
      where: { login },
      update: { perfil: Perfil.FISCAL },
      create: {
        login,
        senhaHash: senhaHashInicial,
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
  for (const nome of GERENTES) {
    const login = slugLogin(nome);
    // Usuário individual e único por gerente (Req 6.4.6, 6.4.7, 7.1.4).
    await prisma.usuario.upsert({
      where: { login },
      update: { perfil: Perfil.GERENTE },
      create: {
        login,
        senhaHash: senhaHashInicial,
        perfil: Perfil.GERENTE,
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

async function main(): Promise<void> {
  // Gera o hash da senha inicial uma única vez antes de criar os usuários.
  senhaHashInicial = await bcrypt.hash(SENHA_INICIAL, 10);

  await seedFiscais();
  await seedGerentes();
  await seedOperadores();

  const totalUsuarios = await prisma.usuario.count();
  const totalFiscais = await prisma.fiscal.count();
  const totalOperadores = await prisma.operador.count();

  // eslint-disable-next-line no-console
  console.log(
    `Seed concluído: ${totalFiscais} fiscais, ${GERENTES.length} gerentes, ` +
      `${totalOperadores} operadores e ${totalUsuarios} usuários (logins individuais).`,
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
