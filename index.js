/** @babel */
import {CompositeDisposable} from 'event-kit';
import path from 'path';
import lazyRequire from 'lazy-req';

const lazyReq = lazyRequire(require);
const lodash = lazyReq('lodash');
const jshint = lazyReq('jshint');
const jsxhint = lazyReq('jshint-jsx');
const cli = lazyReq('jshint/src/cli');
const loadConfig = lazyReq('./load-config');
const markersByEditorId = {};
const errorsByEditorId = {};

let subscriptionTooltips = new CompositeDisposable();
let subscriptionEvents = new CompositeDisposable();

let _;
let statusBar;

const SUPPORTED_GRAMMARS = [
	'source.js',
	'source.jsx',
	'source.js.jsx'
];

let currentLine;
let currentChar;

const goToError = () => {
	const editor = atom.workspace.getActiveTextEditor();

	if (!editor || !currentLine || !currentChar) {
		return;
	}

	editor.setCursorBufferPosition([currentLine - 1, currentChar - 1]);
};

const jsHintStatusBar = document.createElement('a');
jsHintStatusBar.setAttribute('id', 'jshint-statusbar');
jsHintStatusBar.classList.add('inline-block');
jsHintStatusBar.addEventListener('click', goToError);

const updateStatusText = (line, character, reason) => {
	jsHintStatusBar.textContent = line && character && reason ? `JSHint ${line}:${character} ${reason}` : '';
	currentLine = line;
	currentChar = character;
};

const getMarkersForEditor = editor => {
	if (editor && markersByEditorId[editor.id]) {
		return markersByEditorId[editor.id];
	}

	return {};
};

const getErrorsForEditor = editor => {
	if (errorsByEditorId[editor.id]) {
		return errorsByEditorId[editor.id];
	}

	return [];
};

const destroyMarkerAtRow = (editor, row) => {
	if (markersByEditorId[editor.id] && markersByEditorId[editor.id][row]) {
		markersByEditorId[editor.id][row].destroy();
		delete markersByEditorId[editor.id][row];
	}
};

const getRowForError = error => {
	// JSHint reports `line: 0` when config error
	const line = error[0].line || 1;

	const row = line - 1;

	return row;
};

const clearOldMarkers = (editor, errors) => {
	subscriptionTooltips.dispose();
	subscriptionTooltips = new CompositeDisposable();

	const rows = _.map(errors, error => getRowForError(error));

	const oldMarkers = getMarkersForEditor(editor);
	_.each(_.keys(oldMarkers), row => {
		if (!_.contains(rows, row)) {
			destroyMarkerAtRow(editor, row);
		}
	});
};

const saveMarker = (editor, marker, row) => {
	if (!markersByEditorId[editor.id]) {
		markersByEditorId[editor.id] = {};
	}

	markersByEditorId[editor.id][row] = marker;
};

const getMarkerAtRow = (editor, row) => {
	if (!markersByEditorId[editor.id]) {
		return null;
	}

	return markersByEditorId[editor.id][row];
};

const updateStatusbar = () => {
	if (!statusBar) {
		return;
	}

	if (!jsHintStatusBar.parentNode) {
		statusBar.addLeftTile({item: jsHintStatusBar});
	}

	const editor = atom.workspace.getActiveTextEditor();

	if (!editor || !errorsByEditorId[editor.id]) {
		updateStatusText();
		return;
	}

	const line = editor.getCursorBufferPosition().row + 1;
	let error = errorsByEditorId[editor.id][line] || _.first(_.compact(errorsByEditorId[editor.id]));
	error = Array.isArray(error) ? error[0] : {};

	updateStatusText(error.line, error.character, error.reason);
};

const goToNextError = () => {
	const editor = atom.workspace.getActiveTextEditor();

	if (!editor || !markersByEditorId[editor.id] || !errorsByEditorId[editor.id]) {
		return;
	}

	const cursorRow = editor.getCursorBufferPosition().row;

	const markerRows = _.sortBy(_.map(_.keys(getMarkersForEditor(editor)), x => Number(x)));
	let nextRow = _.find(markerRows, x => x > cursorRow);
	if (!nextRow) {
		nextRow = _.first(markerRows);
	}
	if (!nextRow) {
		return;
	}

	const errors = errorsByEditorId[editor.id][nextRow + 1];
	if (errors) {
		editor.setCursorBufferPosition([nextRow, errors[0].character - 1]);
	}
};

const getReasonsForError = err => _.map(err, el => `${el.character}: ${el.reason} (${el.code})`);

const addReasons = (editor, marker, error) => {
	const row = getRowForError(error);
	const editorElement = atom.views.getView(editor);
	const reasons = `<div class="jshint-errors">${getReasonsForError(error).join('<br>')}</div>`;
	const target = editorElement.shadowRoot.querySelector(`.line-number[data-buffer-row="${row}"]`);

	if (!target) {
		return;
	}

	const tooltip = atom.tooltips.add(target, {
		title: reasons,
		placement: 'bottom',
		delay: {show: 200}
	});

	subscriptionTooltips.add(tooltip);
};

const displayError = (editor, err) => {
	const row = getRowForError(err);

	if (getMarkerAtRow(editor, row)) {
		return;
	}

	const marker = editor.markBufferRange([[row, 0], [row, 1]]);
	editor.decorateMarker(marker, {type: 'line', class: 'jshint-line'});
	editor.decorateMarker(marker, {type: 'line-number', class: 'jshint-line-number'});
	saveMarker(editor, marker, row);
	addReasons(editor, marker, err);
};

const displayErrors = editor => {
	const errors = _.compact(getErrorsForEditor(editor));
	clearOldMarkers(editor, errors);
	updateStatusbar();
	_.each(errors, err => displayError(editor, err));
};

const removeMarkersForEditorId = id => {
	if (markersByEditorId[id]) {
		delete markersByEditorId[id];
	}
};

const removeErrorsForEditorId = id => {
	if (errorsByEditorId[id]) {
		delete errorsByEditorId[id];
	}
};

const lint = () => {
	const editor = atom.workspace.getActiveTextEditor();

	if (!editor) {
		return;
	}

	if (SUPPORTED_GRAMMARS.indexOf(editor.getGrammar().scopeName) === -1) {
		return;
	}

	const file = editor.getURI();

	// Hack to make JSHint look for .jshintignore in the correct dir
	// Because JSHint doesn't use its `cwd` option
	process.chdir(path.dirname(file));

	// Remove errors and don't lint if file is ignored in .jshintignore
	if (file && cli().gather({args: [file]}).length === 0) {
		removeErrorsForEditorId(editor.id);
		displayErrors(editor);
		removeMarkersForEditorId(editor.id);
		return;
	}

	const config = file ? loadConfig()(file) : {};
	const linter = (atom.config.get('jshint.supportLintingJsx') || atom.config.get('jshint.transformJsx')) ? jsxhint().JSXHINT : jshint().JSHINT;

	if (Object.keys(config).length === 0 && atom.config.get('jshint.onlyConfig')) {
		return;
	}

	try {
		linter(editor.getText(), config, config.globals);
	} catch (err) {}

	removeErrorsForEditorId(editor.id);

	// workaround the errors array sometimes containing `null`
	const errors = _.compact(linter.errors);

	if (errors.length > 0) {
		// aggregate same-line errors
		const ret = [];
		_.each(errors, el => {
			const l = el.line;

			if (Array.isArray(ret[l])) {
				ret[l].push(el);

				ret[l] = _.sortBy(ret[l], el => el.character);
			} else {
				ret[l] = [el];
			}
		});

		errorsByEditorId[editor.id] = ret;
	}

	displayErrors(editor);
};

let debouncedLint = null;
let debouncedDisplayErrors = null;
let debouncedUpdateStatusbar = null;

const registerEvents = () => {
	subscriptionEvents.dispose();
	subscriptionEvents = new CompositeDisposable();

	updateStatusbar();

	const editor = atom.workspace.getActiveTextEditor();
	if (!editor) {
		return;
	}

	displayErrors(editor);

	if (!atom.config.get('jshint.validateOnlyOnSave')) {
		subscriptionEvents.add(editor.onDidChange(debouncedLint));
		debouncedLint();
	}

	subscriptionEvents.add(editor.onDidSave(debouncedLint));
	subscriptionEvents.add(editor.onDidChangeScrollTop(() => debouncedDisplayErrors(editor)));
	subscriptionEvents.add(editor.onDidChangeCursorPosition(debouncedUpdateStatusbar));

	subscriptionEvents.add(editor.onDidDestroy(() => {
		removeErrorsForEditorId(editor.id);
		displayErrors(editor);
		removeMarkersForEditorId(editor.id);
	}));
};

export const config = {
	onlyConfig: {
		type: 'boolean',
		default: false,
		description: 'Disable linter if there is no config file found for the linter.'
	},
	validateOnlyOnSave: {
		type: 'boolean',
		default: false
	},
	supportLintingJsx: {
		type: 'boolean',
		default: false,
		title: 'Support Linting JSX'
	}
};

let subscriptionMain = null;

export const activate = () => {
	_ = lodash();
	debouncedLint = _.debounce(lint, 200);
	debouncedDisplayErrors = _.debounce(displayErrors, 200);
	debouncedUpdateStatusbar = _.debounce(updateStatusbar, 100);

	subscriptionMain = new CompositeDisposable();
	subscriptionMain.add(atom.workspace.observeActivePaneItem(registerEvents));
	subscriptionMain.add(atom.config.observe('jshint.validateOnlyOnSave', registerEvents));
	subscriptionMain.add(atom.commands.add('atom-workspace', 'jshint:lint', lint));
	subscriptionMain.add(atom.commands.add('atom-workspace', 'jshint:go-to-error', goToError));
	subscriptionMain.add(atom.commands.add('atom-workspace', 'jshint:go-to-next-error', goToNextError));
};

export const deactivate = () => {
	subscriptionTooltips.dispose();
	subscriptionEvents.dispose();
	subscriptionMain.dispose();
};

export const consumeStatusBar = instance => {
	statusBar = instance;
};
