// Konjugationsmaschine für spanische Verben.
// Behandelt regelmäßige Verben, Stammveränderungen (e->ie, o->ue, u->ue),
// orthographische Veränderungen (-car/-gar/-zar) und individuelle
// Überschreibungen aus VERBS für unregelmäßige Verben.

const Conjugator = {

    // Konjugation des Hilfsverbs "haber" für die zusammengesetzten Zeiten.
    haberForms: {
        presente:    ['he', 'has', 'ha', 'hemos', 'habéis', 'han'],
        imperfecto:  ['había', 'habías', 'había', 'habíamos', 'habíais', 'habían'],
        futuro:      ['habré', 'habrás', 'habrá', 'habremos', 'habréis', 'habrán'],
        condicional: ['habría', 'habrías', 'habría', 'habríamos', 'habríais', 'habrían'],
        presSubj:    ['haya', 'hayas', 'haya', 'hayamos', 'hayáis', 'hayan'],
        impSubj:     ['hubiera', 'hubieras', 'hubiera', 'hubiéramos', 'hubierais', 'hubieran']
    },

    presenteEndings: {
        ar: ['o', 'as', 'a', 'amos', 'áis', 'an'],
        er: ['o', 'es', 'e', 'emos', 'éis', 'en'],
        ir: ['o', 'es', 'e', 'imos', 'ís', 'en']
    },

    imperfectoEndings: {
        ar: ['aba', 'abas', 'aba', 'ábamos', 'abais', 'aban'],
        er: ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'],
        ir: ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían']
    },

    preteriteEndings: {
        ar: ['é', 'aste', 'ó', 'amos', 'asteis', 'aron'],
        er: ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron'],
        ir: ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron']
    },

    futuroEndings:      ['é', 'ás', 'á', 'emos', 'éis', 'án'],
    condicionalEndings: ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'],

    presSubjEndings: {
        ar: ['e', 'es', 'e', 'emos', 'éis', 'en'],
        er: ['a', 'as', 'a', 'amos', 'áis', 'an'],
        ir: ['a', 'as', 'a', 'amos', 'áis', 'an']
    },

    vowelAccents: { 'a': 'á', 'e': 'é', 'i': 'í', 'o': 'ó', 'u': 'ú' },

    applyStemChange(stem, change) {
        if (!change) return stem;
        const map = { 'e-ie': ['e', 'ie'], 'o-ue': ['o', 'ue'], 'u-ue': ['u', 'ue'], 'e-i': ['e', 'i'] };
        const [from, to] = map[change];
        const idx = stem.lastIndexOf(from);
        if (idx === -1) return stem;
        return stem.slice(0, idx) + to + stem.slice(idx + 1);
    },

    // c->qu, g->gu, z->c am Stammende, wenn die Endung mit e/é beginnt.
    applyOrthographic(stem, ending, verbEnding) {
        if (verbEnding !== 'ar') return stem;
        if (!(ending.startsWith('e') || ending.startsWith('é'))) return stem;
        if (stem.endsWith('c')) return stem.slice(0, -1) + 'qu';
        if (stem.endsWith('g')) return stem.slice(0, -1) + 'gu';
        if (stem.endsWith('z')) return stem.slice(0, -1) + 'c';
        return stem;
    },

    accentLastVowel(s) {
        for (let i = s.length - 1; i >= 0; i--) {
            if (this.vowelAccents[s[i]]) {
                return s.slice(0, i) + this.vowelAccents[s[i]] + s.slice(i + 1);
            }
        }
        return s;
    },

    buildPresente(stem, verbEnding, data) {
        if (data.presente) return data.presente;
        const endings = this.presenteEndings[verbEnding];
        const changedStem = this.applyStemChange(stem, data.stemChange);
        // Stammveränderung gilt für yo, tú, él, ellos – nicht für nosotros, vosotros.
        const stems = [changedStem, changedStem, changedStem, stem, stem, changedStem];
        return stems.map((s, i) => s + endings[i]);
    },

    buildImperfecto(stem, verbEnding, data) {
        if (data.imperfecto) return data.imperfecto;
        return this.imperfectoEndings[verbEnding].map(e => stem + e);
    },

    buildPreterite(stem, verbEnding, data) {
        if (data.preterite) return data.preterite;
        return this.preteriteEndings[verbEnding].map(e => {
            return this.applyOrthographic(stem, e, verbEnding) + e;
        });
    },

    buildFuturo(infinitive, data) {
        const stem = data.futureStem || infinitive;
        return this.futuroEndings.map(e => stem + e);
    },

    buildCondicional(infinitive, data) {
        const stem = data.futureStem || infinitive;
        return this.condicionalEndings.map(e => stem + e);
    },

    buildPresenteSubj(stem, verbEnding, data) {
        if (data.presSubj) return data.presSubj;
        const endings = this.presSubjEndings[verbEnding];
        const changedStem = this.applyStemChange(stem, data.stemChange);
        const stems = [changedStem, changedStem, changedStem, stem, stem, changedStem];
        return stems.map((s, i) => {
            return this.applyOrthographic(s, endings[i], verbEnding) + endings[i];
        });
    },

    // Imperfecto de subjuntivo wird aus der 3. Pers. Pl. des Indefinido gebildet:
    // hablaron -> habla- + ra/ras/ra/'ramos/rais/ran  (nosotros mit Akzent)
    buildImperfectoSubj(preterite) {
        const thirdPlural = preterite[5];
        if (!thirdPlural || !thirdPlural.endsWith('ron')) {
            return ['—', '—', '—', '—', '—', '—'];
        }
        const base = thirdPlural.slice(0, -3);
        const accentedBase = this.accentLastVowel(base);
        return [
            base + 'ra',
            base + 'ras',
            base + 'ra',
            accentedBase + 'ramos',
            base + 'rais',
            base + 'ran'
        ];
    },

    buildCompound(haberForms, participio) {
        return haberForms.map(h => h + ' ' + participio);
    },

    buildParticipio(stem, verbEnding, data) {
        if (data.participio) return data.participio;
        return verbEnding === 'ar' ? stem + 'ado' : stem + 'ido';
    },

    buildGerundio(stem, verbEnding, data) {
        if (data.gerundio) return data.gerundio;
        return verbEnding === 'ar' ? stem + 'ando' : stem + 'iendo';
    },

    // Imperativo afirmativo (5 Formen, ohne "yo"):
    //   tú       <- 3. Pers. Sg. Präsens (oder explizite Form)
    //   usted    <- 3. Pers. Sg. Subjuntivo
    //   nosotros <- 1. Pers. Pl. Subjuntivo
    //   vosotros <- Infinitiv mit -d statt -r
    //   ustedes  <- 3. Pers. Pl. Subjuntivo
    buildImperativoAfirm(infinitive, data, presente, presSubj) {
        const tu = data.imperTu || presente[2];
        const usted = presSubj[2];
        const nosotros = presSubj[3];
        const vosotros = infinitive.slice(0, -1) + 'd';
        const ustedes = presSubj[5];
        return [tu, usted, nosotros, vosotros, ustedes];
    },

    // Imperativo negativo: alle Formen aus dem Subjuntivo mit "no" davor.
    buildImperativoNeg(presSubj) {
        return [
            'no ' + presSubj[1],
            'no ' + presSubj[2],
            'no ' + presSubj[3],
            'no ' + presSubj[4],
            'no ' + presSubj[5]
        ];
    },

    conjugate(infinitive) {
        const data = VERBS[infinitive] || { de: '?' };
        const verbEnding = infinitive.slice(-2);
        const stem = infinitive.slice(0, -2);

        const presente             = this.buildPresente(stem, verbEnding, data);
        const imperfecto           = this.buildImperfecto(stem, verbEnding, data);
        const indefinido           = this.buildPreterite(stem, verbEnding, data);
        const futuro               = this.buildFuturo(infinitive, data);
        const condicional          = this.buildCondicional(infinitive, data);
        const presenteSubj         = this.buildPresenteSubj(stem, verbEnding, data);
        const imperfectoSubj       = this.buildImperfectoSubj(indefinido);
        const participio           = this.buildParticipio(stem, verbEnding, data);
        const gerundio             = this.buildGerundio(stem, verbEnding, data);

        const perfecto             = this.buildCompound(this.haberForms.presente, participio);
        const pluscuamperfecto     = this.buildCompound(this.haberForms.imperfecto, participio);
        const futuroPerfecto       = this.buildCompound(this.haberForms.futuro, participio);
        const condicionalPerfecto  = this.buildCompound(this.haberForms.condicional, participio);
        const perfectoSubj         = this.buildCompound(this.haberForms.presSubj, participio);
        const pluscuamperfectoSubj = this.buildCompound(this.haberForms.impSubj, participio);

        const imperativoAfirm = this.buildImperativoAfirm(infinitive, data, presente, presenteSubj);
        const imperativoNeg   = this.buildImperativoNeg(presenteSubj);

        return {
            infinitivo: infinitive,
            gerundio,
            participio,
            presente,
            imperfecto,
            indefinido,
            futuro,
            condicional,
            perfecto,
            pluscuamperfecto,
            futuroPerfecto,
            condicionalPerfecto,
            presenteSubj,
            imperfectoSubj,
            perfectoSubj,
            pluscuamperfectoSubj,
            imperativoAfirm,
            imperativoNeg
        };
    }
};
