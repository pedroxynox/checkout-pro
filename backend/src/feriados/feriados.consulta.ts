/**
 * A ÚNICA resolução de "que dias do período são feriado".
 *
 * Existia duas vezes: `FeriadosService.mapaNoPeriodo` e um
 * `feriadosDoPeriodo` privado dentro da escala publicada. Faziam a mesma coisa
 * com formas diferentes de chave (timestamp × `yyyy-mm-dd`) e enumeravam os anos
 * de modo diferente — e "o que é feriado" é justamente uma pergunta que não pode
 * ter duas respostas: o dia decide carga, extras a 100%, isenção de hora devida e
 * o horário que a equipe lê na escala. Duas cópias significam que uma delas pode
 * divergir sem ninguém notar.
 *
 * É uma função livre, e não um serviço, porque o único ingrediente é o Prisma —
 * que os dois chamadores já recebem como dependência **obrigatória**. Transformá-la
 * em dependência injetada opcional criaria um modo silencioso "nenhum feriado
 * existe", que é exatamente o tipo de degradação que este arquivo evita.
 */
import { PrismaService } from '../prisma/prisma.service';
import { inicioDoDia } from '../common/datas';
import { feriadosNacionais } from './feriados.domain';

/**
 * Mapa `tempo(00:00 UTC) → nome` dos feriados em `[inicio, fimExclusivo)`,
 * juntando os nacionais (calculados) com os manuais (estaduais/municipais).
 *
 * Num só passo para a semana não disparar sete consultas.
 *
 * A chave é o **timestamp da meia-noite UTC** do dia. Toda linha em banco já
 * nasce normalizada assim (`FeriadosService.adicionar`), e o `inicioDoDia` aqui é
 * a garantia de que uma linha legada com hora ≠ 0 caia no mesmo dia.
 *
 * **O manual prevalece** sobre o nacional na mesma data: quem cadastrou à mão
 * descreve melhor o feriado local. (Atenção: `FeriadosService.listarDoAno` — a
 * tela de cadastro — aplica a precedência OPOSTA de propósito; ver
 * `docs/03-atlas-backend/feriados.md`.)
 */
export async function carregarMapaDeFeriados(
  prisma: PrismaService,
  inicio: Date,
  fimExclusivo: Date,
): Promise<Map<number, string>> {
  const mapa = new Map<number, string>();
  // Todos os anos tocados pelo intervalo — não só as pontas. Cobre a virada de
  // ano e não depende de o período ser curto.
  const anoFim = new Date(fimExclusivo.getTime() - 1).getUTCFullYear();
  for (let ano = inicio.getUTCFullYear(); ano <= anoFim; ano++) {
    for (const n of feriadosNacionais(ano)) {
      if (n.data >= inicio && n.data < fimExclusivo) {
        mapa.set(n.data.getTime(), n.nome);
      }
    }
  }
  const manuais = await prisma.feriado.findMany({
    where: { data: { gte: inicio, lt: fimExclusivo } },
    select: { data: true, nome: true },
  });
  for (const m of manuais) {
    mapa.set(inicioDoDia(m.data).getTime(), m.nome);
  }
  return mapa;
}
