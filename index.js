/* globals atom */
'use strict';
var CompositeDisposable = require('atom').CompositeDisposable;
var emissary = require('emissary');
var lazyReq = require('lazy-req')(require);
var lodash = lazyReq('lodash');
var jshint = lazyReq('jshint');
var jsxhint = lazyReq('jshint-jsx');
var path = require('path');
var cli = lazyReq('jshint/src/cli');
var reactDomPragma = require('react-dom-pragma');
var loadConfig = lazyReq('./load-config');
var plugin = module.exports;
var _;
var markersByEditorId = {};
var errorsByEditorId = {};
var subscriptionTooltips = new CompositeDisposable();

emissary.Subscriber.extend(plugin);

var SUPPORTED_GRAMMARS = [
	'source.js',
	'source.jsx',
	'source.js.jsx'
];

var jsHintStatusBar = document.createElement('span');
jsHintStatusBar.setAttribute('id', 'jshint-statusbar');
jsHintStatusBar.classList.add('inline-block');

function updateStatusText(line, character, reason) {
	jsHintStatusBar.textContent = line && character && reason ? 'JSHint ' + line + ':' + character + ' ' + reason : '';
}

function getMarkersForEditor() {
	var editor = atom.workspace.getActiveTextEditor();

	if (editor && markersByEditorId[editor.id]) {
		return markersByEditorId[editor.id];
	}

	return {};
}

function getErrorsForEditor() {
	var editor = atom.workspace.getActiveTextEditor();

	if (editor && errorsByEditorId[editor.id]) {
		return errorsByEditorId[editor.id];
	}

	return [];
}

function clearOldMarkers(errors) {
	subscriptionTooltips.dispose();

	var rows = _.map(errors, function (error) {
		return getRowForError(error);
	});

	var oldMarkers = getMarkersForEditor();
	_.each(_.keys(oldMarkers), function (row) {
		if (!_.contains(rows, row)) {
			destroyMarkerAtRow(row);
		}
	});
}

function destroyMarkerAtRow(row) {
	var editor = atom.workspace.getActiveTextEditor();
	if (markersByEditorId[editor.id] && markersByEditorId[editor.id][row]) {
		markersByEditorId[editor.id][row].destroy();
		delete markersByEditorId[editor.id][row];
	}
}

function saveMarker(marker, row) {
	var editor = atom.workspace.getActiveTextEditor();

	if (!markersByEditorId[editor.id]) {
		markersByEditorId[editor.id] = {};
	}

	markersByEditorId[editor.id][row] = marker;
}

function getMarkerAtRow(row) {
	var editor = atom.workspace.getActiveTextEditor();

	if (!markersByEditorId[editor.id]) {
		return null;
	}

	return markersByEditorId[editor.id][row];
}

function updateStatusbar() {
	var statusBar = atom.views.getView(atom.workspace).querySelector('.status-bar');
	if (!statusBar) {
		return;
	}

	if (!jsHintStatusBar.parentNode) {
		statusBar.addLeftTile({item: jsHintStatusBar});
	}

	var editor = atom.workspace.getActiveTextEditor();
	if (!editor || !errorsByEditorId[editor.id]) {
		updateStatusText();
		return;
	}

	var line = editor.getCursorBufferPosition().row + 1;
	var error = errorsByEditorId[editor.id][line] || _.first(_.compact(errorsByEditorId[editor.id]));
	error = error[0];

	updateStatusText(error.line, error.character, error.reason);
}

function getRowForError(error) {
	var line = error[0].line || 1; // JSHint reports `line: 0` when config error
	var row = line - 1;
	return row;
}

function displayError(error) {
	var row = getRowForError(error);

	if (getMarkerAtRow(row)) {
		return;
	}

	var editor = atom.workspace.getActiveTextEditor();
	var marker = editor.markBufferRange([[row, 0], [row, 1]]);
	editor.decorateMarker(marker, {type: 'line', class: 'jshint-line'});
	editor.decorateMarker(marker, {type: 'line-number', class: 'jshint-line-number'});
	saveMarker(marker, row);
	addReasons(marker, error);
}

function getReasonsForError(error) {
	return _.map(error, function (el) {
		return el.character + ': ' + el.reason;
	});
}

function addReasons(marker, error) {
	var row = getRowForError(error);
	var editorElement = atom.views.getView(atom.workspace.getActiveTextEditor());
	var reasons = '<div class="jshint-errors">' + getReasonsForError(error).join('<br>') + '</div>';

	var target = editorElement.shadowRoot.querySelectorAll('.jshint-line-number.line-number-' + row);
	var tooltip = atom.tooltips.add(target, {
		title: reasons,
		placement: 'bottom',
		delay: { show: 200 }
	});
	subscriptionTooltips.add(tooltip);
}

function lint() {
	var editor = atom.workspace.getActiveTextEditor();

	if (!editor) {
		return;
	}

	if (SUPPORTED_GRAMMARS.indexOf(editor.getGrammar().scopeName) === -1) {
		return;
	}

	var file = editor.getURI();

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

	var config = file ? loadConfig()(file) : {};

	var linter = (atom.config.get('jshint.supportLintingJsx') || atom.config.get('jshint.transformJsx')) ? jsxhint().JSXHINT : jshint().JSHINT;

	var origCode = editor.getText();
	var code = editor.getGrammar().scopeName === 'source.jsx' ? reactDomPragma(origCode) : origCode;
	var pragmaWasAdded = code !== origCode;

	try {
		linter(code, config, config.globals);
	} catch (err) {}

	removeErrorsForEditorId(editor.id);

	// workaround the errors array sometimes containing `null`
	var errors = _.compact(linter.errors);

	if (errors.length > 0) {
		// aggregate same-line errors
		var ret = [];
		_.each(errors, function (el) {
			if (pragmaWasAdded) {
				el.line--;
			}

			var l = el.line;

			if (Array.isArray(ret[l])) {
				ret[l].push(el);

				ret[l] = _.sortBy(ret[l], function (el) {
					return el.character;
				});
			} else {
				ret[l] = [el];
			}
		});

		errorsByEditorId[editor.id] = ret;
	}

	displayErrors();
}

var debouncedLint = null;

function displayErrors() {
	var errors = _.compact(getErrorsForEditor());
	clearOldMarkers(errors);
	updateStatusbar();
	_.each(errors, displayError);
}

var debouncedDisplayErrors = null;

function removeMarkersForEditorId(id) {
	if (markersByEditorId[id]) {
		delete markersByEditorId[id];
	}
}

function removeErrorsForEditorId(id) {
	if (errorsByEditorId[id]) {
		delete errorsByEditorId[id];
	}
}

function registerEvents() {
	lint();
	var workspaceElement = atom.views.getView(atom.workspace);

	atom.workspace.observeTextEditors(function (editor) {
		var buffer = editor.getBuffer();
		debouncedLint = debouncedLint || _.debounce(lint, 50);
		debouncedDisplayErrors = debouncedDisplayErrors || _.debounce(displayErrors, 200);

		editor.emitter.off('scroll-top-changed', debouncedDisplayErrors);
		buffer.emitter.off('did-save did-change-modified', debouncedLint);

		if (!atom.config.get('jshint.validateOnlyOnSave')) {
			buffer.onDidChangeModified(debouncedLint);
		}

		buffer.onDidSave(debouncedLint);

		editor.onDidChangeScrollTop(debouncedDisplayErrors);
	});

	workspaceElement.addEventListener('editor:will-be-removed', function (e, editorView) {
		if (editorView && editorView.editor) {
			removeErrorsForEditorId(editorView.editor.id);
			removeMarkersForEditorId(editorView.editor.id);
		}
	});

	workspaceElement.addEventListener('cursor:moved', updateStatusbar);
}

plugin.config = {
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

plugin.activate = function () {
	_ = lodash();
	registerEvents();
	plugin.subscribe(atom.config.observe('jshint.validateOnlyOnSave', registerEvents));
	atom.commands.add('atom-workspace', 'jshint:lint', lint);
};
