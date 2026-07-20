/**
 * Catálogo CID-10 para o autocompletar dos atestados.
 *
 * Contém uma seleção CURADA dos códigos mais frequentes em atestados médicos
 * (nível de categoria, 3 caracteres, mais alguns de subcategoria). Não é o
 * catálogo completo do DATASUS (~14 mil itens); foi escolhido para cobrir os
 * motivos usuais mantendo o app leve. A busca é feita em memória sobre esta
 * lista (código OU descrição). Para ampliar, basta acrescentar itens aqui (ou,
 * no futuro, carregar a lista oficial completa a partir de um arquivo/tabela,
 * sem mudar a interface `buscarCid`).
 */

/** Uma entrada do catálogo CID-10 (código + descrição em português). */
export interface EntradaCid {
  codigo: string;
  descricao: string;
}

/** Seleção curada de códigos CID-10 comuns em atestados. */
export const CID10: readonly EntradaCid[] = Object.freeze([
  // Doenças infecciosas e parasitárias (A/B)
  { codigo: 'A08', descricao: 'Infecções intestinais virais' },
  {
    codigo: 'A09',
    descricao: 'Diarreia e gastroenterite de origem infecciosa',
  },
  { codigo: 'A90', descricao: 'Dengue clássico' },
  { codigo: 'A91', descricao: 'Dengue hemorrágico' },
  { codigo: 'B01', descricao: 'Varicela (catapora)' },
  { codigo: 'B26', descricao: 'Caxumba (parotidite epidêmica)' },
  { codigo: 'B27', descricao: 'Mononucleose infecciosa' },
  { codigo: 'B34', descricao: 'Infecção viral não especificada' },
  // COVID-19
  { codigo: 'U07.1', descricao: 'COVID-19, vírus identificado' },
  { codigo: 'U07.2', descricao: 'COVID-19, vírus não identificado (clínico)' },
  // Neoplasias / sangue (seleção)
  { codigo: 'D50', descricao: 'Anemia por deficiência de ferro' },
  { codigo: 'D64', descricao: 'Anemia não especificada' },
  // Endócrinas e metabólicas (E)
  { codigo: 'E10', descricao: 'Diabetes mellitus tipo 1' },
  { codigo: 'E11', descricao: 'Diabetes mellitus tipo 2' },
  { codigo: 'E86', descricao: 'Depleção de volume (desidratação)' },
  // Transtornos mentais e comportamentais (F)
  { codigo: 'F10', descricao: 'Transtornos por uso de álcool' },
  { codigo: 'F32', descricao: 'Episódios depressivos' },
  { codigo: 'F33', descricao: 'Transtorno depressivo recorrente' },
  { codigo: 'F41', descricao: 'Outros transtornos ansiosos' },
  {
    codigo: 'F43',
    descricao: 'Reações ao stress grave e transtornos de adaptação',
  },
  {
    codigo: 'F48',
    descricao: 'Outros transtornos neuróticos (inclui esgotamento)',
  },
  // Sistema nervoso (G)
  { codigo: 'G43', descricao: 'Enxaqueca' },
  { codigo: 'G44', descricao: 'Outras síndromes de algias cefálicas' },
  { codigo: 'G47', descricao: 'Distúrbios do sono' },
  // Olhos e ouvidos (H)
  { codigo: 'H10', descricao: 'Conjuntivite' },
  { codigo: 'H60', descricao: 'Otite externa' },
  { codigo: 'H66', descricao: 'Otite média supurativa e não especificada' },
  {
    codigo: 'H81',
    descricao: 'Distúrbios da função vestibular (labirintite/vertigem)',
  },
  // Circulatório (I)
  { codigo: 'I10', descricao: 'Hipertensão essencial (primária)' },
  { codigo: 'I20', descricao: 'Angina pectoris' },
  { codigo: 'I84', descricao: 'Hemorroidas' },
  // Respiratório (J)
  { codigo: 'J00', descricao: 'Nasofaringite aguda (resfriado comum)' },
  { codigo: 'J01', descricao: 'Sinusite aguda' },
  { codigo: 'J02', descricao: 'Faringite aguda' },
  { codigo: 'J03', descricao: 'Amigdalite aguda' },
  { codigo: 'J04', descricao: 'Laringite e traqueíte agudas' },
  { codigo: 'J06', descricao: 'Infecções agudas das vias aéreas superiores' },
  { codigo: 'J10', descricao: 'Influenza (gripe) devida a vírus identificado' },
  {
    codigo: 'J11',
    descricao: 'Influenza (gripe) devida a vírus não identificado',
  },
  { codigo: 'J18', descricao: 'Pneumonia por microrganismo não especificado' },
  { codigo: 'J20', descricao: 'Bronquite aguda' },
  { codigo: 'J21', descricao: 'Bronquiolite aguda' },
  { codigo: 'J30', descricao: 'Rinite alérgica e vasomotora' },
  { codigo: 'J32', descricao: 'Sinusite crônica' },
  {
    codigo: 'J40',
    descricao: 'Bronquite não especificada como aguda ou crônica',
  },
  { codigo: 'J45', descricao: 'Asma' },
  // Digestivo (K)
  {
    codigo: 'K08',
    descricao: 'Outros transtornos dos dentes e estruturas de suporte',
  },
  { codigo: 'K21', descricao: 'Doença de refluxo gastroesofágico' },
  { codigo: 'K29', descricao: 'Gastrite e duodenite' },
  { codigo: 'K30', descricao: 'Dispepsia' },
  { codigo: 'K35', descricao: 'Apendicite aguda' },
  { codigo: 'K52', descricao: 'Gastroenterite e colite não infecciosas' },
  { codigo: 'K57', descricao: 'Doença diverticular do intestino' },
  { codigo: 'K58', descricao: 'Síndrome do intestino irritável' },
  { codigo: 'K59', descricao: 'Outros transtornos funcionais do intestino' },
  { codigo: 'K80', descricao: 'Colelitíase (cálculo biliar)' },
  // Pele (L)
  { codigo: 'L03', descricao: 'Celulite (erisipela)' },
  { codigo: 'L20', descricao: 'Dermatite atópica' },
  { codigo: 'L23', descricao: 'Dermatite alérgica de contato' },
  { codigo: 'L50', descricao: 'Urticária' },
  // Osteomuscular e tecido conjuntivo (M)
  { codigo: 'M25.5', descricao: 'Dor articular' },
  { codigo: 'M51', descricao: 'Outros transtornos de discos intervertebrais' },
  { codigo: 'M54', descricao: 'Dorsalgia' },
  { codigo: 'M54.2', descricao: 'Cervicalgia' },
  { codigo: 'M54.5', descricao: 'Dor lombar baixa (lombalgia)' },
  { codigo: 'M65', descricao: 'Sinovite e tenossinovite' },
  { codigo: 'M75', descricao: 'Lesões do ombro' },
  { codigo: 'M77', descricao: 'Outras entesopatias (inclui epicondilite)' },
  { codigo: 'M79', descricao: 'Outros transtornos dos tecidos moles' },
  // Geniturinário (N)
  { codigo: 'N23', descricao: 'Cólica nefrética não especificada' },
  { codigo: 'N30', descricao: 'Cistite' },
  {
    codigo: 'N39',
    descricao: 'Outros transtornos do trato urinário (inclui ITU)',
  },
  { codigo: 'N70', descricao: 'Salpingite e ooforite' },
  {
    codigo: 'N76',
    descricao: 'Outras afecções inflamatórias da vagina e da vulva',
  },
  {
    codigo: 'N94',
    descricao: 'Dor associada ao ciclo menstrual (inclui dismenorreia)',
  },
  // Gravidez, parto e puerpério (O)
  { codigo: 'O21', descricao: 'Vômitos excessivos na gravidez (hiperêmese)' },
  { codigo: 'O80', descricao: 'Parto único espontâneo' },
  // Sintomas e sinais (R)
  { codigo: 'R05', descricao: 'Tosse' },
  { codigo: 'R07', descricao: 'Dor de garganta e no peito' },
  { codigo: 'R10', descricao: 'Dor abdominal e pélvica' },
  { codigo: 'R11', descricao: 'Náusea e vômitos' },
  { codigo: 'R42', descricao: 'Tontura e instabilidade' },
  { codigo: 'R50', descricao: 'Febre de origem desconhecida' },
  { codigo: 'R51', descricao: 'Cefaleia (dor de cabeça)' },
  { codigo: 'R52', descricao: 'Dor não classificada em outra parte' },
  { codigo: 'R53', descricao: 'Mal-estar, fadiga' },
  // Lesões e traumatismos (S/T)
  { codigo: 'S13', descricao: 'Luxação/entorse de articulações do pescoço' },
  { codigo: 'S33', descricao: 'Luxação/entorse da coluna lombar e da pelve' },
  { codigo: 'S43', descricao: 'Luxação/entorse da cintura escapular (ombro)' },
  { codigo: 'S52', descricao: 'Fratura do antebraço' },
  { codigo: 'S62', descricao: 'Fratura ao nível do punho e da mão' },
  { codigo: 'S72', descricao: 'Fratura do fêmur' },
  { codigo: 'S82', descricao: 'Fratura da perna, incluindo tornozelo' },
  { codigo: 'S83', descricao: 'Luxação/entorse do joelho' },
  { codigo: 'S92', descricao: 'Fratura do pé (exceto tornozelo)' },
  { codigo: 'S93', descricao: 'Luxação/entorse do tornozelo e do pé' },
  {
    codigo: 'T14',
    descricao: 'Traumatismo de região não especificada do corpo',
  },
  // Fatores que influenciam o estado de saúde (Z)
  {
    codigo: 'Z00',
    descricao: 'Exame geral e investigação de pessoas sem queixa',
  },
  { codigo: 'Z34', descricao: 'Supervisão de gravidez normal (pré-natal)' },
  {
    codigo: 'Z76.3',
    descricao: 'Pessoa em boa saúde acompanhando doente (acompanhante)',
  },
]);
