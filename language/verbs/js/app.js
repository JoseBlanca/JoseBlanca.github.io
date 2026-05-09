// UI-Logik für den Übungsmodus:
//  - Schüler tippt eine Form pro Person in Eingabefelder ein
//  - "Korrigieren" prüft alle Felder
//  - Akzent-Knöpfe fügen Sonderzeichen am Cursor ein
//  - "Lösung zeigen" füllt alle Felder mit der korrekten Form
//  - "Zurücksetzen" leert alle Felder

(function () {
    const verbSelect      = document.getElementById('verb-select');
    const tenseSelect     = document.getElementById('tense-select');
    const promptVerb      = document.getElementById('prompt-verb');
    const promptTense     = document.getElementById('prompt-tense');
    const practiceForm    = document.getElementById('practice-form');
    const rowsContainer   = document.getElementById('practice-rows');
    const scoreEl         = document.getElementById('score');
    const showSolutionBtn = document.getElementById('show-solution');
    const resetBtn        = document.getElementById('reset');
    const accentBar       = document.querySelector('.accent-bar');

    const STORAGE_VERB  = 'verbs.lastVerb';
    const STORAGE_TENSE = 'verbs.lastTense';
    const DEFAULT_VERB  = 'hablar';
    const DEFAULT_TENSE = 'presente';

    // Merkt sich das zuletzt fokussierte Eingabefeld, damit die
    // Akzent-Knöpfe wissen, wo eingefügt werden soll.
    let lastFocused = null;

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

    function clearRowFeedback(row) {
        row.classList.remove('correct', 'almost', 'wrong');
        const fb = row.querySelector('.feedback');
        if (fb) {
            fb.textContent = '';
            fb.className = 'feedback';
        }
    }

    function buildRows() {
        const verb = verbSelect.value;
        const tenseKey = tenseSelect.value;
        const tenseInfo = getTenseInfo(tenseKey);
        const isImperative = !!tenseInfo.imperative;
        const labels = isImperative ? IMPERATIVE_PERSON_LABELS : PERSON_LABELS;

        promptVerb.textContent  = `${verb}  —  ${VERBS[verb].de}`;
        promptTense.textContent = `${tenseInfo.de}  (${tenseInfo.es})`;

        rowsContainer.innerHTML = '';
        labels.forEach((label, i) => {
            const row = document.createElement('div');
            row.className = 'practice-row';
            row.dataset.index = i;

            const labelEl = document.createElement('label');
            const personId = `person-${i}`;
            labelEl.setAttribute('for', personId);
            labelEl.textContent = label;

            const wrapper = document.createElement('div');
            wrapper.className = 'input-wrapper';

            const input = document.createElement('input');
            input.type = 'text';
            input.id = personId;
            input.autocomplete = 'off';
            input.setAttribute('autocapitalize', 'off');
            input.setAttribute('autocorrect', 'off');
            input.spellcheck = false;

            input.addEventListener('focus', () => { lastFocused = input; });
            input.addEventListener('input', () => clearRowFeedback(row));

            const feedback = document.createElement('span');
            feedback.className = 'feedback';

            wrapper.appendChild(input);
            wrapper.appendChild(feedback);
            row.appendChild(labelEl);
            row.appendChild(wrapper);
            rowsContainer.appendChild(row);
        });

        scoreEl.hidden = true;
        scoreEl.textContent = '';
        scoreEl.classList.remove('perfect');

        const firstInput = rowsContainer.querySelector('input');
        if (firstInput) {
            firstInput.focus();
            lastFocused = firstInput;
        }
    }

    // Akzente und überflüssige Leerzeichen entfernen, alles in Kleinbuchstaben.
    function normalize(s) {
        return (s || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function checkAnswers() {
        const verb = verbSelect.value;
        const tenseKey = tenseSelect.value;
        const conj = Conjugator.conjugate(verb);
        const correctForms = conj[tenseKey];

        const rows = rowsContainer.querySelectorAll('.practice-row');
        let correctCount = 0;

        rows.forEach((row, i) => {
            const input = row.querySelector('input');
            const feedback = row.querySelector('.feedback');
            const studentAnswer = (input.value || '').trim();
            const correctAnswer = correctForms[i];

            row.classList.remove('correct', 'almost', 'wrong');
            feedback.className = 'feedback';
            feedback.textContent = '';

            if (studentAnswer === correctAnswer) {
                row.classList.add('correct');
                feedback.classList.add('correct');
                feedback.textContent = '✓ richtig';
                correctCount++;
            } else if (studentAnswer.length > 0 && normalize(studentAnswer) === normalize(correctAnswer)) {
                // Inhaltlich richtig, aber Akzente fehlen oder sind falsch.
                row.classList.add('almost');
                feedback.classList.add('almost');
                feedback.innerHTML = '⚠ Akzent fehlt: <span class="correct-form"></span>';
                feedback.querySelector('.correct-form').textContent = correctAnswer;
            } else {
                row.classList.add('wrong');
                feedback.classList.add('wrong');
                feedback.innerHTML = '✗ Richtig: <span class="correct-form"></span>';
                feedback.querySelector('.correct-form').textContent = correctAnswer;
            }
        });

        const total = rows.length;
        scoreEl.hidden = false;
        scoreEl.textContent = `${correctCount} von ${total} richtig`;
        scoreEl.classList.toggle('perfect', correctCount === total);
    }

    function showSolution() {
        const verb = verbSelect.value;
        const tenseKey = tenseSelect.value;
        const conj = Conjugator.conjugate(verb);
        const correctForms = conj[tenseKey];

        const rows = rowsContainer.querySelectorAll('.practice-row');
        rows.forEach((row, i) => {
            const input = row.querySelector('input');
            input.value = correctForms[i];
            clearRowFeedback(row);
        });
        scoreEl.hidden = true;
        scoreEl.classList.remove('perfect');
    }

    function resetForm() {
        const rows = rowsContainer.querySelectorAll('.practice-row');
        rows.forEach(row => {
            row.querySelector('input').value = '';
            clearRowFeedback(row);
        });
        scoreEl.hidden = true;
        scoreEl.classList.remove('perfect');
        const firstInput = rowsContainer.querySelector('input');
        if (firstInput) firstInput.focus();
    }

    function insertAtCursor(input, text) {
        const start = input.selectionStart || 0;
        const end = input.selectionEnd || 0;
        input.value = input.value.slice(0, start) + text + input.value.slice(end);
        const pos = start + text.length;
        input.setSelectionRange(pos, pos);
        input.focus();
        // Damit das Feedback ggf. zurückgesetzt wird:
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function setupAccentBar() {
        // mousedown statt click, damit das Eingabefeld den Fokus behält.
        accentBar.addEventListener('mousedown', e => {
            const button = e.target.closest('.accent');
            if (!button) return;
            e.preventDefault();
            const target = (lastFocused && document.body.contains(lastFocused))
                ? lastFocused
                : rowsContainer.querySelector('input');
            if (!target) return;
            insertAtCursor(target, button.dataset.char);
        });
    }

    function restoreSelection() {
        let verb, tense;
        try {
            verb = localStorage.getItem(STORAGE_VERB);
            tense = localStorage.getItem(STORAGE_TENSE);
        } catch (e) { /* localStorage nicht verfügbar */ }

        verbSelect.value  = (verb && VERBS[verb]) ? verb : DEFAULT_VERB;
        tenseSelect.value = (tense && TENSES.find(t => t.key === tense)) ? tense : DEFAULT_TENSE;
    }

    function persistSelection() {
        try {
            localStorage.setItem(STORAGE_VERB, verbSelect.value);
            localStorage.setItem(STORAGE_TENSE, tenseSelect.value);
        } catch (e) { /* ignore */ }
    }

    function init() {
        populateVerbSelect();
        populateTenseSelect();
        restoreSelection();
        buildRows();

        verbSelect.addEventListener('change', () => {
            persistSelection();
            buildRows();
        });
        tenseSelect.addEventListener('change', () => {
            persistSelection();
            buildRows();
        });

        practiceForm.addEventListener('submit', e => {
            e.preventDefault();
            checkAnswers();
        });
        showSolutionBtn.addEventListener('click', showSolution);
        resetBtn.addEventListener('click', resetForm);

        setupAccentBar();
    }

    init();
})();
