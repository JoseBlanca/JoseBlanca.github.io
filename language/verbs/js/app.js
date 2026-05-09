// UI-Logik: füllt die Dropdowns, reagiert auf Auswahländerungen
// und rendert die Konjugationstabelle.

(function () {
    const verbSelect    = document.getElementById('verb-select');
    const tenseSelect   = document.getElementById('tense-select');
    const tableBody     = document.getElementById('conjugation-body');
    const tenseTitle    = document.getElementById('tense-title');
    const tenseGerman   = document.getElementById('tense-german');
    const npInfinitivo  = document.getElementById('np-infinitivo');
    const npGerundio    = document.getElementById('np-gerundio');
    const npParticipio  = document.getElementById('np-participio');

    const STORAGE_VERB  = 'verbs.lastVerb';
    const STORAGE_TENSE = 'verbs.lastTense';
    const DEFAULT_VERB  = 'hablar';
    const DEFAULT_TENSE = 'presente';

    function populateVerbSelect() {
        const sortedVerbs = Object.keys(VERBS).sort((a, b) => a.localeCompare(b, 'es'));
        sortedVerbs.forEach(verb => {
            const option = document.createElement('option');
            option.value = verb;
            option.textContent = `${verb}  —  ${VERBS[verb].de}`;
            verbSelect.appendChild(option);
        });
    }

    function populateTenseSelect() {
        const groups = {};
        TENSES.forEach(t => {
            if (!groups[t.group]) groups[t.group] = [];
            groups[t.group].push(t);
        });

        Object.keys(groups).forEach(groupName => {
            const og = document.createElement('optgroup');
            og.label = groupName;
            groups[groupName].forEach(t => {
                const option = document.createElement('option');
                option.value = t.key;
                option.textContent = `${t.de}  (${t.es})`;
                og.appendChild(option);
            });
            tenseSelect.appendChild(og);
        });
    }

    function getTenseInfo(key) {
        return TENSES.find(t => t.key === key);
    }

    function render() {
        const verb = verbSelect.value;
        const tenseKey = tenseSelect.value;
        const tenseInfo = getTenseInfo(tenseKey);

        const conj = Conjugator.conjugate(verb);
        const forms = conj[tenseKey];
        const isImperative = !!tenseInfo.imperative;
        const labels = isImperative ? IMPERATIVE_PERSON_LABELS : PERSON_LABELS;

        // Nicht-personale Formen (Infinitiv, Gerundium, Partizip)
        npInfinitivo.textContent = conj.infinitivo;
        npGerundio.textContent   = conj.gerundio;
        npParticipio.textContent = conj.participio;

        // Titel der ausgewählten Zeitform
        tenseTitle.textContent  = tenseInfo.es;
        tenseGerman.textContent = tenseInfo.de;

        // Tabelle neu aufbauen
        tableBody.innerHTML = '';
        forms.forEach((form, i) => {
            const tr = document.createElement('tr');
            const tdPerson = document.createElement('td');
            tdPerson.className = 'person';
            tdPerson.textContent = labels[i];
            const tdForm = document.createElement('td');
            tdForm.className = 'form';
            tdForm.textContent = form;
            tr.appendChild(tdPerson);
            tr.appendChild(tdForm);
            tableBody.appendChild(tr);
        });

        // Auswahl merken
        try {
            localStorage.setItem(STORAGE_VERB, verb);
            localStorage.setItem(STORAGE_TENSE, tenseKey);
        } catch (e) {
            // localStorage nicht verfügbar – ignorieren
        }
    }

    function restoreSelection() {
        let verb, tense;
        try {
            verb = localStorage.getItem(STORAGE_VERB);
            tense = localStorage.getItem(STORAGE_TENSE);
        } catch (e) { /* ignore */ }

        verbSelect.value  = (verb && VERBS[verb]) ? verb : DEFAULT_VERB;
        tenseSelect.value = (tense && TENSES.find(t => t.key === tense)) ? tense : DEFAULT_TENSE;
    }

    function init() {
        populateVerbSelect();
        populateTenseSelect();
        restoreSelection();
        render();

        verbSelect.addEventListener('change', render);
        tenseSelect.addEventListener('change', render);
    }

    init();
})();
