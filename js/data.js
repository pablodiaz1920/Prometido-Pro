// Contenido de las fases, notas de ejemplo y traductor (textos originales).
'use strict';

// Cycle Phases Catalog with Male-Friendly Metaphors & Cervical Secretions
const PHASES = {
  winter: {
    id: 'winter',
    title: 'Fase Menstrual (Invierno)',
    alias: 'Modo Manta, Calma y Mimos',
    daysDesc: 'Días 1 a 5 aprox.',
    battery: '20% - 40%',
    sensitivity: 'Alta (Física y Emocional)',
    craving: 'Chocolate amargo, sopitas calientes, pasta y descanso',
    secretionBadge: '🩸 Sangrado Menstrual',
    secretionTitle: 'Flujo Sanguíneo Activo (Desprendimiento)',
    secretionDesc: 'Rojo brillante a marrón oscuro. El moco cervical está oculto por el sangrado. Cero fertilidad funcional.',
    secretionAdvice: 'Ten productos de higiene a la mano (toallas, tampones o su copa). Bríndale comodidad absoluta, té caliente y comprensión.',
    shield: '🛡️ Zona de Resguardo',
    shieldClass: 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30',
    cardClass: 'phase-glow-winter bg-gradient-to-br from-rose-50/90 to-amber-50/60 dark:from-slate-900/90 dark:to-rose-950/30 border-rose-200 dark:border-rose-900/60',
    goldenRule: 'No la hagas tomar decisiones complicadas hoy. Prepara cobijas, agua caliente y déjala descansar sin culpas.',
    summary: 'La progesterona y el estrógeno están en su punto más bajo. Su útero está haciendo un trabajo pesado y puede haber dolor, fatiga e inflamación.',
    dos: [
      'Ofrécele una compresa o bolsa de agua caliente en el vientre.',
      'Ten a mano sus analgésicos o infusiones (manzanilla/jengibre).',
      'Toma la iniciativa con tareas domésticas sin que tenga que pedirlo.',
      'Proponle plan sillón, serie o película con snacks ricos.'
    ],
    donts: [
      'NUNCA preguntes "¿Por qué estás de mal humor?" ni menciones la regla en tono de queja.',
      'No le organices una fiesta sorpresa o salidas agotadoras.',
      'No le digas "no es para tanto" o "a ti siempre te duele todo".',
      'Evita debates existenciales o discusiones sobre presupuestos hoy.'
    ],
    missions: [
      { id: 'w1', text: 'Sorprenderla con su postre o infusión caliente favorita sin que lo pida.' },
      { id: 'w2', text: 'Darle un masaje suave en pies o espalda baja durante 10 minutos.' },
      { id: 'w3', text: 'Hacerte cargo 100% de la cena de hoy (cocinar o pedir a domicilio).' }
    ]
  },
  spring: {
    id: 'spring',
    title: 'Fase Folicular (Primavera)',
    alias: 'Modo Superpoderes y Nuevas Aventuras',
    daysDesc: 'Días 6 a 12 aprox.',
    battery: '70% - 95%',
    sensitivity: 'Baja / Positiva',
    craving: 'Ensaladas frescas, mariscos, comida ligera, cócteles',
    secretionBadge: '🌱 Seco a Cremoso',
    secretionTitle: 'Moco Cremoso / Textura Loción',
    secretionDesc: 'Al inicio post-regla hay sensación seca. Conforme sube el estrógeno, el flujo se vuelve blanco lechoso o cremoso. Fertilidad en ascenso.',
    secretionAdvice: 'Al inicio puede haber menor lubricación natural; ten paciencia. Con los días aumentará su hidratación y deseo.',
    shield: '🚀 Batería Máxima',
    shieldClass: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    cardClass: 'phase-glow-spring bg-gradient-to-br from-emerald-50/90 to-teal-50/60 dark:from-slate-900/90 dark:to-emerald-950/30 border-emerald-200 dark:border-emerald-900/60',
    goldenRule: 'Es la mejor época para planear viajes, probar restaurantes nuevos, hacer ejercicio juntos y conversar sobre el futuro.',
    summary: 'El estrógeno comienza a subir a toda velocidad. Vuelve su vitalidad, optimismo, claridad mental y creatividad.',
    dos: [
      'Invítala a salir a un lugar nuevo o a hacer una actividad al aire libre.',
      'Habla de proyectos que tengan como pareja: boda, vacaciones, metas.',
      'Acompáñala en sus ideas espontáneas; su creatividad está al 100%.',
      'Dile lo radiante y bien que se ve (lo notará de inmediato).'
    ],
    donts: [
      'No te quedes encerrado en la cueva cuando ella tenga ganas de comerse el mundo.',
      'No frenes su entusiasmo con comentarios pesimistas.',
      'No dejes pasar esta ventana para tener citas divertidas.'
    ],
    missions: [
      { id: 'sp1', text: 'Invitarla a una cita fuera de la rutina (cine, café lindo, caminata).' },
      { id: 'sp2', text: 'Preguntarle qué proyectos o ideas tiene en mente y escucharla con interés.' },
      { id: 'sp3', text: 'Tomarle una foto linda espontánea y mandársela diciéndole lo hermosa que está.' }
    ]
  },
  summer: {
    id: 'summer',
    title: 'Fase Ovulatoria (Verano)',
    alias: 'Modo Diosa / Alta Confianza y Magnetismo',
    daysDesc: 'Días 13 a 16 aprox.',
    battery: '95% - 100%',
    sensitivity: 'Empática y Conectada',
    craving: 'Cenas elegantes, sabores intensos, aperitivos sociales',
    secretionBadge: '☀️ Clara de Huevo',
    secretionTitle: 'Clara de Huevo Elástica (Máxima Fertilidad)',
    secretionDesc: 'Transparente, elástico y muy resbaladizo. Diseñado por la naturaleza para que los espermatozoides naden fácilmente hacia el óvulo.',
    secretionAdvice: 'Lubricación natural en su punto máximo. ¡Cuidado máximo si no buscan embarazo! Si están buscando concebir, son los días clave.',
    shield: '🔥 Clímax Energético',
    shieldClass: 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30',
    cardClass: 'phase-glow-summer bg-gradient-to-br from-amber-50/90 to-orange-50/60 dark:from-slate-900/90 dark:to-amber-950/30 border-amber-200 dark:border-amber-900/60',
    goldenRule: 'Máxima conexión romántica y química. Ponte tu mejor perfume, arréglate bien y sé su fan número uno.',
    summary: 'Pico de estrógeno y liberación del óvulo. Su piel brilla, su confianza está por las nubes y busca contacto afectivo profundo.',
    dos: [
      'Ponte coqueto y detallista: arréglate para ella, usa la colonia que le gusta.',
      'Salgan con amigos o a eventos sociales; brillará en cualquier reunión.',
      'Sorpréndela con flores sin ningún motivo aparente.',
      'Exprésale cuánto la admiras y deseas compartir tu vida con ella.'
    ],
    donts: [
      'No seas descuidado con tu apariencia estos días.',
      'No ignores sus muestras de cariño o coqueteo.',
      'Si no están buscando embarazo ahora mismo, ¡precaución máxima de fertilidad!'
    ],
    missions: [
      { id: 'su1', text: 'Vestirte elegante para verla o ponerte su loción favorita.' },
      { id: 'su2', text: 'Comprarle unas flores o una nota romántica escrita a mano.' },
      { id: 'su3', text: 'Planear una noche íntima con velas o comida deliciosa.' }
    ]
  },
  autumn: {
    id: 'autumn',
    title: 'Fase Lútea / SPM (Otoño)',
    alias: 'Protocolo Paz Armada & Apoyo Incondicional',
    daysDesc: 'Días 17 a 28 aprox.',
    battery: '30% - 60% (Bajando)',
    sensitivity: 'MUY ALTA (Detector de fallas activado)',
    craving: 'Papas fritas, hamburguesas, chocolate, helado, salado y dulce a la vez',
    secretionBadge: '🍂 Espeso / Pegajoso',
    secretionTitle: 'Moco Denso o Pastoso (Tapón Protector)',
    secretionDesc: 'Blanco opaco o amarillento suave, pegajoso o sensación de sequedad. La progesterona sella el cuello uterino para protegerlo.',
    secretionAdvice: 'Puede haber mayor sequedad o sensibilidad. Días antes de la regla puede haber ligero manchado marrón (spotting normal).',
    shield: '⚠️ Alto Voltaje Emocional',
    shieldClass: 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30',
    cardClass: 'phase-glow-autumn bg-gradient-to-br from-purple-50/90 to-rose-50/60 dark:from-slate-900/90 dark:to-purple-950/30 border-purple-200 dark:border-purple-900/60',
    goldenRule: 'Cualquier cosa que digas puede y será usada en tu contra. Respira hondo, ten paciencia de monje budista y mantén la despensa abastecida.',
    summary: 'La progesterona sube y luego cae abruptamente. Puede haber hinchazón, cambios bruscos de humor, cansancio y antojos voraces.',
    dos: [
      'Abastécete con sus antojos antes de que ella note que los quiere.',
      'Valida sus emociones: "Es completamente comprensible que te sientas así".',
      'Si la notas saturada, quítale peso de decisiones cotidianas.',
      'Sé su refugio seguro, no un contendiente más en el ring.'
    ],
    donts: [
      'PROHIBIDO decir: "¿Estás así porque te va a bajar?" (Peligro crítico de discusión).',
      'No le preguntes a las 9pm con hambre: "¿Qué cenamos?". Dale opciones concretas: "¿Pedimos sushi o pizza?".',
      'No dejes ropa tirada o platos sucios en el fregadero; su tolerancia al desorden es cero.',
      'No intentes resolver sus problemas emocionales con lógica fría; solo escucha.'
    ],
    missions: [
      { id: 'au1', text: 'Rellenar la alacena con su antojo preferido (salado o dulce).' },
      { id: 'au2', text: 'Ordenar la habitación o la sala sin que nadie te lo pida.' },
      { id: 'au3', text: 'Darle un abrazo largo de oso en silencio cuando suspire hondo.' }
    ]
  }
};

// Default personality notes
const DEFAULT_NOTES = [
  {
    id: 'n1',
    category: 'loved',
    phase: 'winter',
    title: 'Bolsa de agua caliente + té de manzanilla',
    content: 'Cuando tiene cólicos el día 1 o 2, prepararle el té sin que lo pida la hace sentir súper cuidada.'
  },
  {
    id: 'n2',
    category: 'trigger',
    phase: 'autumn',
    title: 'Preguntarle qué quiere cenar sin opciones',
    content: 'En la fase lútea le da parálisis de decisión y hambre repentina. Es mejor proponer: "¿Quieres hamburguesa o comida china?".'
  },
  {
    id: 'n3',
    category: 'craving',
    phase: 'autumn',
    title: 'Papas fritas con sal y helado de vainilla',
    content: 'Le encanta mezclar lo salado y lo dulce cuando está en los días previos a la regla.'
  },
  {
    id: 'n4',
    category: 'quirk',
    phase: 'all',
    title: 'Pies fríos crónicos al acostarse',
    content: 'Siempre tiene los pies helados. Calentar la cama o dejarle medias a mano suma 100 puntos.'
  }
];

const TRANSLATIONS = {
  fine: {
    raw: '"No me pasa nada, déjame."',
    real: 'Traducción: "Me pasa todo, pero no quiero tener que explicártelo desde cero ni sentirme juzgada".',
    danger: 'ERROR FATAL: Decir "Bueno, tú te lo pierdes" o irte a jugar videojuegos sonriendo.',
    tactic: 'RESPUESTA RECOMENDADA: "Está bien mi amor, te doy tu espacio, pero aquí estoy si necesitas un abrazo, agua caliente o si quieres hablar después". Deja un chocolate cerca y mantente disponible.'
  },
  dinner: {
    raw: '"No sé qué quiero cenar... elige tú lo que sea."',
    real: 'Traducción: "Tengo fatiga de decisión y hambre. No me hagas pensar en 20 opciones".',
    danger: 'ERROR FATAL: Empezar una lista abierta como "¿Quieres pizza? ¿O ensalada? ¿O tacos? ¿O qué quieres?".',
    tactic: 'RESPUESTA RECOMENDADA: Dale una opción cerrada entre dos cosas: "Pediré sushi o hamburguesas deliciosas de ese lugar que te gusta. ¿Cuál te suena mejor hoy?".'
  },
  ugly: {
    raw: '"Hoy me siento fea y nada me queda bien."',
    real: 'Traducción: "Estoy hinchada por la retención de líquidos hormonal y mi autoestima biológica está vulnerable".',
    danger: 'ERROR FATAL: Decir "Siempre te ves igual" (lo interpreta como que no te fijas) o intentar dar tips de ropa.',
    tactic: 'RESPUESTA RECOMENDADA: Mírala fijamente a los ojos, dale un beso y dile con total convicción: "Para mí eres la mujer más hermosa del mundo entero, y te amo tal cual eres".'
  },
  busy: {
    raw: '"¿Estás ocupado o podemos hablar dos minutos?"',
    real: 'Traducción: "Necesito desahogarme con la persona en quien más confío. No busco que resuelvas el problema, solo que me escuches".',
    danger: 'ERROR FATAL: Responder "Habla rápido que estoy jugando" o empezar a darle soluciones lógicas antes de validar su sentir.',
    tactic: 'RESPUESTA RECOMENDADA: Deja el teléfono a un lado, mírala y dile: "Para ti siempre tengo tiempo. ¿Qué pasó mi amor?". Escucha con atención sin interrumpir.'
  },
  plans: {
    raw: '"¿Tenemos algún plan este fin de semana?"',
    real: 'Traducción: "Quiero sentir que piensas en nosotros y que tomas la iniciativa sin que yo tenga que organizarlo todo".',
    danger: 'ERROR FATAL: Decir "No sé, lo que tú quieras hacer".',
    tactic: 'RESPUESTA RECOMENDADA: "Tengo una idea linda en mente para nosotros dos, déjamelo a mí. Tú solo ponte cómoda".'
  }
};
