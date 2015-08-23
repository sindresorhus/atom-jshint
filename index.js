'use babel';
import {CompositeDisposable} from 'event-kit';
import path from 'path';
import reactDomPragma from 'react-dom-pragma';
import lazyRequire from 'lazy-req';

const lazyReq = lazyRequire(require);
const lodash = lazyReq('lodash');
const jshint = lazyReq('jshint');
const jsxhint = lazyReq('jshint-jsx');
const cli = lazyReq('jshint/src/cli');
const loadConfig = lazyReq('./load-config');
const plugin = {};
const markersByEditorId = {};
const errorsByEditorId = {};
const subscriptionTooltips = new CompositeDisposable();
let _;

const SUPPORTED_GRAMMARS = [
	'source.js',
	'source.jsx',
	'source.js.jsx'
];

const jsHintStatusBar = document.createElement('span');
jsHintStatusBar.setAttribute('id', 'jshint-statusbar');
jsHintStatusBar.classList.add('inline-block');

const updateStatusText = (line, character, reason) => {
	jsHintStatusBar.textContent = line && character && reason ? `JSHint ${line}:${character} ${reason}` : '';
};

const getMarkersForEditor = () => {
	const editor = atom.workspace.getActiveTextEditor();

	if (editor && markersByEditorId[editor.id]) {
		return markersByEditorId[editor.id];
	}

	return {};
};

const getErrorsForEditor = () => {
	const editor = atom.workspace.getActiveTextEditor();

	if (editor && errorsByEditorId[editor.id]) {
		return errorsByEditorId[editor.id];
	}

	return [];
};

const destroyMarkerAtRow = row => {
	const editor = atom.workspace.getActiveTextEditor();

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

const clearOldMarkers = errors => {
	subscriptionTooltips.dispose();

	const rows = _.map(errors, error => getRowForError(error));

	const oldMarkers = getMarkersForEditor();
	_.each(_.keys(oldMarkers), row => {
		if (!_.contains(rows, row)) {
			destroyMarkerAtRow(row);
		}
	});
};

const saveMarker = (marker, row) => {
	const editor = atom.workspace.getActiveTextEditor();

	if (!markersByEditorId[editor.id]) {
		markersByEditorId[editor.id] = {};
	}

	markersByEditorId[editor.id][row] = marker;
};

const getMarkerAtRow = row => {
	const editor = atom.workspace.getActiveTextEditor();

	if (!markersByEditorId[editor.id]) {
		return null;
	}

	return markersByEditorId[editor.id][row];
};

const updateStatusbar = () => {
	const statusBar = atom.views.getView(atom.workspace).querySelector('.status-bar');

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
	error = error[0];

	updateStatusText(error.line, error.character, error.reason);
};

const getReasonsForError = error => {
	return _.map(error, el => `${el.character}: ${el.reason}`);
};

const addReasons = (marker, error) => {
	const row = getRowForError(error);
	const editorElement = atom.views.getView(atom.workspace.getActiveTextEditor());
	const reasons = `<div class="jshint-errors">${getReasonsForError(error).join('<br>')}</div>`;
	const target = editorElement.shadowRoot.querySelectorAll(`.jshint-line-number.line-number-${row}`);
	const tooltip = atom.tooltips.add(target, {
		title: reasons,
		placement: 'bottom',
		delay: {show: 200}
	});

	subscriptionTooltips.add(tooltip);
};

const displayError = err => {
	const row = getRowForError(err);

	if (getMarkerAtRow(row)) {
		return;
	}

	const editor = atom.workspace.getActiveTextEditor();
	const marker = editor.markBufferRange([[row, 0], [row, 1]]);
	editor.decorateMarker(marker, {type: 'line', class: 'jshint-line'});
	editor.decorateMarker(marker, {type: 'line-number', class: 'jshint-line-number'});
	saveMarker(marker, row);
	addReasons(marker, err);
};

const displayErrors = () => {
	const errors = _.compact(getErrorsForEditor());
	clearOldMarkers(errors);
	updateStatusbar();
	_.each(errors, displayError);
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
		displayErrors();
		removeMarkersForEditorId(editor.id);
		return;
	}

	const config = file ? loadConfig()(file) : {};
	const linter = (atom.config.get('jshint.supportLintingJsx') || atom.config.get('jshint.transformJsx')) ? jsxhint().JSXHINT : jshint().JSHINT;

	if (Object.keys(config).length === 0 && atom.config.get('jshint.onlyConfig')) {
		return;
	}

	const origCode = editor.getText();
	const grammarScope = editor.getGrammar().scopeName;
	const isJsx = grammarScope === 'source.jsx' || grammarScope === 'source.js.jsx';
	const code = isJsx ? reactDomPragma(origCode) : origCode;
	const pragmaWasAdded = code !== origCode;

	try {
		linter(code, config, config.globals);
	} catch (err) {}

	removeErrorsForEditorId(editor.id);

	// workaround the errors array sometimes containing `null`
	const errors = _.compact(linter.errors);

	if (errors.length > 0) {
		// aggregate same-line errors
		const ret = [];
		_.each(errors, el => {
			if (pragmaWasAdded) {
				el.line--;
			}

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

	displayErrors();
};

let debouncedLint = null;
let debouncedDisplayErrors = null;
let debouncedUpdateStatusbar = null;

const registerEvents = () => {
	lint();
	const workspaceElement = atom.views.getView(atom.workspace);

	debouncedLint = debouncedLint || _.debounce(lint, 50);
	debouncedDisplayErrors = debouncedDisplayErrors || _.debounce(displayErrors, 200);
	debouncedUpdateStatusbar = debouncedUpdateStatusbar || _.debounce(updateStatusbar, 100);

	atom.workspace.observeTextEditors(editor => {
		const buffer = editor.getBuffer();

		editor.emitter.off('scroll-top-changed', debouncedDisplayErrors);
		editor.emitter.off('did-change-cursor-position', debouncedUpdateStatusbar);
		buffer.emitter.off('did-save did-change-modified', debouncedLint);

		if (!atom.config.get('jshint.validateOnlyOnSave')) {
			buffer.onDidChangeModified(debouncedLint);
		}

		buffer.onDidSave(debouncedLint);

		editor.onDidChangeScrollTop(debouncedDisplayErrors);
		editor.onDidChangeCursorPosition(debouncedUpdateStatusbar);
	});

	workspaceElement.addEventListener('editor:will-be-removed', (e, editorView) => {
		if (editorView && editorView.editor) {
			removeErrorsForEditorId(editorView.editor.id);
			removeMarkersForEditorId(editorView.editor.id);
		}
	});
};

export const config = plugin.config = {
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

export const activate = plugin.activate = () => {
	_ = lodash();
	registerEvents();
	atom.config.observe('jshint.onlyConfig', registerEvents);
	atom.config.observe('jshint.validateOnlyOnSave', registerEvents);
	atom.commands.add('atom-workspace', 'jshint:lint', lint);
};

export default plugin;
