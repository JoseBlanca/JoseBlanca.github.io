// Liste der Verben mit deutscher Übersetzung und (falls nötig) Überschreibungen
// für unregelmäßige Formen.
//
// Mögliche Felder pro Verb:
//   de:           deutsche Übersetzung
//   stemChange:   'e-ie' | 'o-ue' | 'u-ue' | 'e-i'  (Diphthongierung)
//   presente:     [yo, tú, él, nos, vos, ellos]
//   imperfecto:   [yo, tú, él, nos, vos, ellos]
//   preterite:    [yo, tú, él, nos, vos, ellos]
//   futureStem:   z.B. 'tendr' (Stamm für Futur und Konditional)
//   presSubj:     [yo, tú, él, nos, vos, ellos]
//   participio:   z.B. 'hecho'
//   gerundio:     z.B. 'leyendo'
//   imperTu:      z.B. 'ten'

const VERBS = {
    // Vollkommen regelmäßige -ar Verben
    'ayudar':       { de: 'helfen' },
    'bailar':       { de: 'tanzen' },
    'cambiar':      { de: 'wechseln, ändern' },
    'cantar':       { de: 'singen' },
    'charlar':      { de: 'plaudern' },
    'comprar':      { de: 'kaufen' },
    'descansar':    { de: 'sich ausruhen' },
    'entrar':       { de: 'hereinkommen, eintreten' },
    'escuchar':     { de: 'hören, zuhören' },
    'estudiar':     { de: 'lernen, studieren' },
    'experimentar': { de: 'erleben, experimentieren' },
    'gustar':       { de: 'gefallen' },
    'hablar':       { de: 'sprechen' },
    'informar':     { de: 'informieren' },
    'lavar':        { de: 'waschen' },
    'levantar':     { de: 'heben, hochheben' },
    'limpiar':      { de: 'putzen, sauber machen' },
    'llevar':       { de: 'tragen, bringen' },
    'mirar':        { de: 'schauen, ansehen' },
    'nadar':        { de: 'schwimmen' },
    'necesitar':    { de: 'brauchen' },
    'olvidar':      { de: 'vergessen' },
    'ordenar':      { de: 'aufräumen, ordnen' },
    'pasar':        { de: 'verbringen, passieren' },
    'pasear':       { de: 'spazieren gehen' },
    'planchar':     { de: 'bügeln' },
    'preguntar':    { de: 'fragen' },
    'quedar':       { de: 'bleiben, sich treffen' },
    'solucionar':   { de: 'lösen' },
    'tomar':        { de: 'nehmen' },
    'trabajar':     { de: 'arbeiten' },
    'viajar':       { de: 'reisen' },
    'visitar':      { de: 'besuchen' },

    // Regelmäßige -er Verben
    'beber':        { de: 'trinken' },
    'comer':        { de: 'essen' },
    'esconder':     { de: 'verstecken' },
    'meter':        { de: 'hineinstecken, hineintun' },
    'responder':    { de: 'antworten' },

    // Regelmäßige -ir Verben
    'cumplir':      { de: 'erfüllen, Geburtstag haben' },
    'discutir':     { de: 'diskutieren, streiten' },
    'vivir':        { de: 'leben, wohnen' },

    // Verben mit orthographischer Veränderung -car (c -> qu vor e)
    'buscar':       { de: 'suchen' },
    'explicar':     { de: 'erklären' },
    'practicar':    { de: 'üben' },
    'sacar':        { de: 'herausnehmen, herausholen' },
    'tocar':        { de: 'berühren, ein Instrument spielen' },

    // Verben mit orthographischer Veränderung -gar (g -> gu vor e)
    'llegar':       { de: 'ankommen' },

    // Verben mit unregelmäßigem Partizip
    'abrir':        { de: 'öffnen', participio: 'abierto' },
    'escribir':     { de: 'schreiben', participio: 'escrito' },

    // Stammveränderung e -> ie
    'cerrar':       { de: 'schließen, zumachen', stemChange: 'e-ie' },
    'entender':     { de: 'verstehen', stemChange: 'e-ie' },
    'pensar':       { de: 'denken', stemChange: 'e-ie' },

    // Stammveränderung o -> ue
    'contar':       { de: 'zählen, erzählen', stemChange: 'o-ue' },
    'encontrar':    { de: 'finden, treffen', stemChange: 'o-ue' },
    'probar':       { de: 'probieren, kosten', stemChange: 'o-ue' },

    // Stammveränderung + orthographische Veränderung
    'empezar':      { de: 'anfangen, beginnen', stemChange: 'e-ie' },
    'jugar':        { de: 'spielen', stemChange: 'u-ue' },

    // Stammveränderung + unregelmäßiges Partizip
    'volver':       { de: 'zurückkehren, zurückkommen', stemChange: 'o-ue', participio: 'vuelto' },

    // Spezialfall: i -> y zwischen Vokalen
    'leer': {
        de: 'lesen',
        preterite: ['leí', 'leíste', 'leyó', 'leímos', 'leísteis', 'leyeron'],
        gerundio: 'leyendo',
        participio: 'leído'
    },

    // Stark unregelmäßige Verben
    'ser': {
        de: 'sein (Eigenschaft)',
        presente:   ['soy', 'eres', 'es', 'somos', 'sois', 'son'],
        imperfecto: ['era', 'eras', 'era', 'éramos', 'erais', 'eran'],
        preterite:  ['fui', 'fuiste', 'fue', 'fuimos', 'fuisteis', 'fueron'],
        presSubj:   ['sea', 'seas', 'sea', 'seamos', 'seáis', 'sean'],
        imperTu:    'sé',
        gerundio:   'siendo'
    },

    'estar': {
        de: 'sein (Zustand, Ort)',
        presente:   ['estoy', 'estás', 'está', 'estamos', 'estáis', 'están'],
        preterite:  ['estuve', 'estuviste', 'estuvo', 'estuvimos', 'estuvisteis', 'estuvieron'],
        presSubj:   ['esté', 'estés', 'esté', 'estemos', 'estéis', 'estén']
    },

    'tener': {
        de: 'haben',
        presente:   ['tengo', 'tienes', 'tiene', 'tenemos', 'tenéis', 'tienen'],
        preterite:  ['tuve', 'tuviste', 'tuvo', 'tuvimos', 'tuvisteis', 'tuvieron'],
        futureStem: 'tendr',
        presSubj:   ['tenga', 'tengas', 'tenga', 'tengamos', 'tengáis', 'tengan'],
        imperTu:    'ten'
    },

    'haber': {
        de: 'haben (Hilfsverb), es gibt',
        presente:   ['he', 'has', 'ha', 'hemos', 'habéis', 'han'],
        preterite:  ['hube', 'hubiste', 'hubo', 'hubimos', 'hubisteis', 'hubieron'],
        futureStem: 'habr',
        presSubj:   ['haya', 'hayas', 'haya', 'hayamos', 'hayáis', 'hayan']
    },

    'hacer': {
        de: 'machen, tun',
        presente:   ['hago', 'haces', 'hace', 'hacemos', 'hacéis', 'hacen'],
        preterite:  ['hice', 'hiciste', 'hizo', 'hicimos', 'hicisteis', 'hicieron'],
        futureStem: 'har',
        presSubj:   ['haga', 'hagas', 'haga', 'hagamos', 'hagáis', 'hagan'],
        participio: 'hecho',
        imperTu:    'haz'
    },

    'ver': {
        de: 'sehen',
        presente:   ['veo', 'ves', 've', 'vemos', 'veis', 'ven'],
        imperfecto: ['veía', 'veías', 'veía', 'veíamos', 'veíais', 'veían'],
        preterite:  ['vi', 'viste', 'vio', 'vimos', 'visteis', 'vieron'],
        presSubj:   ['vea', 'veas', 'vea', 'veamos', 'veáis', 'vean'],
        participio: 'visto'
    },

    'poner': {
        de: 'stellen, legen, anziehen',
        presente:   ['pongo', 'pones', 'pone', 'ponemos', 'ponéis', 'ponen'],
        preterite:  ['puse', 'pusiste', 'puso', 'pusimos', 'pusisteis', 'pusieron'],
        futureStem: 'pondr',
        presSubj:   ['ponga', 'pongas', 'ponga', 'pongamos', 'pongáis', 'pongan'],
        participio: 'puesto',
        imperTu:    'pon'
    },

    'salir': {
        de: 'hinausgehen, ausgehen',
        presente:   ['salgo', 'sales', 'sale', 'salimos', 'salís', 'salen'],
        futureStem: 'saldr',
        presSubj:   ['salga', 'salgas', 'salga', 'salgamos', 'salgáis', 'salgan'],
        imperTu:    'sal'
    },

    'ir': {
        de: 'gehen, fahren',
        presente:   ['voy', 'vas', 'va', 'vamos', 'vais', 'van'],
        imperfecto: ['iba', 'ibas', 'iba', 'íbamos', 'ibais', 'iban'],
        preterite:  ['fui', 'fuiste', 'fue', 'fuimos', 'fuisteis', 'fueron'],
        presSubj:   ['vaya', 'vayas', 'vaya', 'vayamos', 'vayáis', 'vayan'],
        imperTu:    've',
        gerundio:   'yendo'
    },

    'venir': {
        de: 'kommen',
        presente:   ['vengo', 'vienes', 'viene', 'venimos', 'venís', 'vienen'],
        preterite:  ['vine', 'viniste', 'vino', 'vinimos', 'vinisteis', 'vinieron'],
        futureStem: 'vendr',
        presSubj:   ['venga', 'vengas', 'venga', 'vengamos', 'vengáis', 'vengan'],
        gerundio:   'viniendo',
        imperTu:    'ven'
    },

    'querer': {
        de: 'wollen, lieben, mögen',
        stemChange: 'e-ie',
        preterite:  ['quise', 'quisiste', 'quiso', 'quisimos', 'quisisteis', 'quisieron'],
        futureStem: 'querr'
    },

    'poder': {
        de: 'können, dürfen',
        stemChange: 'o-ue',
        preterite:  ['pude', 'pudiste', 'pudo', 'pudimos', 'pudisteis', 'pudieron'],
        futureStem: 'podr',
        gerundio:   'pudiendo'
    },

    'preferir': {
        de: 'bevorzugen, lieber mögen',
        presente:   ['prefiero', 'prefieres', 'prefiere', 'preferimos', 'preferís', 'prefieren'],
        preterite:  ['preferí', 'preferiste', 'prefirió', 'preferimos', 'preferisteis', 'prefirieron'],
        presSubj:   ['prefiera', 'prefieras', 'prefiera', 'prefiramos', 'prefiráis', 'prefieran'],
        gerundio:   'prefiriendo'
    }
};

// Definition aller verfügbaren Zeitformen, gruppiert nach Modus.
// Reihenfolge bestimmt die Anzeige im Dropdown.
const TENSES = [
    // Indicativo
    { key: 'presente',             group: 'Indicativo', es: 'Presente',                       de: 'Präsens' },
    { key: 'imperfecto',           group: 'Indicativo', es: 'Pretérito imperfecto',           de: 'Imperfekt' },
    { key: 'indefinido',           group: 'Indicativo', es: 'Pretérito indefinido',           de: 'Indefinido (einfache Vergangenheit)' },
    { key: 'futuro',               group: 'Indicativo', es: 'Futuro simple',                  de: 'Futur I' },
    { key: 'condicional',          group: 'Indicativo', es: 'Condicional simple',             de: 'Konditional I' },
    { key: 'perfecto',             group: 'Indicativo', es: 'Pretérito perfecto compuesto',   de: 'Perfekt' },
    { key: 'pluscuamperfecto',     group: 'Indicativo', es: 'Pretérito pluscuamperfecto',     de: 'Plusquamperfekt' },
    { key: 'futuroPerfecto',       group: 'Indicativo', es: 'Futuro perfecto',                de: 'Futur II' },
    { key: 'condicionalPerfecto',  group: 'Indicativo', es: 'Condicional compuesto',          de: 'Konditional II' },

    // Subjuntivo
    { key: 'presenteSubj',         group: 'Subjuntivo', es: 'Presente de subjuntivo',         de: 'Subjuntivo Präsens' },
    { key: 'imperfectoSubj',       group: 'Subjuntivo', es: 'Imperfecto de subjuntivo',       de: 'Subjuntivo Imperfekt' },
    { key: 'perfectoSubj',         group: 'Subjuntivo', es: 'Perfecto de subjuntivo',         de: 'Subjuntivo Perfekt' },
    { key: 'pluscuamperfectoSubj', group: 'Subjuntivo', es: 'Pluscuamperfecto de subjuntivo', de: 'Subjuntivo Plusquamperfekt' },

    // Imperativo (nur 5 Personen, kein "yo")
    { key: 'imperativoAfirm',      group: 'Imperativo', es: 'Imperativo afirmativo',          de: 'Imperativ (bejaht)',   imperative: true },
    { key: 'imperativoNeg',        group: 'Imperativo', es: 'Imperativo negativo',            de: 'Imperativ (verneint)', imperative: true }
];

// Personen-Bezeichnungen für die Tabelle
const PERSON_LABELS = ['yo', 'tú', 'él / ella / Ud.', 'nosotros / -as', 'vosotros / -as', 'ellos / ellas / Uds.'];
const IMPERATIVE_PERSON_LABELS = ['tú', 'usted', 'nosotros / -as', 'vosotros / -as', 'ustedes'];
