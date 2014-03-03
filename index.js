'use strict';
var _ = require('lodash');
var Subscriber = require('emissary').Subscriber;
var jshint = require('jshint').JSHINT;
var loadConfig = require('./load-config');
var plugin = module.exports;

Subscriber.extend(plugin);

function updateStatusbar(error) {
	atom.workspaceView.statusBar.appendLeft('<span id="jshint-statusbar">JSHint ' + error.line + ':' + error.character + ' ' + error.reason + '</span>');
}

function displayError(error, editor, editorView) {
	var row = error[0].line - 1;
	var gutter = editorView.gutter;
	var bufferRange = editor.bufferRangeForBufferRow(row);
	bufferRange.start.column = bufferRange.end.column = error.character;
	var screenRange = editor.screenRangeForBufferRange(bufferRange);
	var lineEl = editorView.lineElementForScreenRow(screenRange.start.row);
	lineEl.addClass('jshint-line');

	var reasons = _.map(error, function (el) {
		return el.character + ': ' + el.reason;
	}).join('\n\n');

	var gutterRow = gutter.find(gutter.getLineNumberElement(row));
	gutterRow.removeAttr('title');
	gutterRow.attr('title', reasons);
	gutterRow.addClass('jshint-line-number');
}

function lint() {
	var editor = atom.workspace.getActiveEditor();
	var editorView = atom.workspaceView.getActiveView();

	if (!editor) {
		return;
	}

	if (editor.getGrammar().name !== 'JavaScript') {
		return;
	}

	var file = editor.getUri();
	var config = file ? loadConfig(file) : {};

	// reset
	editorView.resetDisplay();
	editorView.gutter.find('.jshint-line-number').removeClass('jshint-line-number');
	atom.workspaceView.statusBar.find('#jshint-statusbar').remove();

	jshint(editor.getText(), config);

	// workaround the errors array sometimes containing `null`
	var errors = _.compact(jshint.errors);

	if (errors.length === 0) {
		return;
	}

	var ret = [];

	// aggregate same-line errors
	_.each(errors, function (el) {
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

	_.chain(ret).compact().each(function (error, i) {
		if (i === 0) {
			updateStatusbar(error[0]);
		}

		displayError(error, editor, editorView);
	});
}

function registerEvents() {
	lint();

	atom.workspace.eachEditor(function (editor) {
		var buffer = editor.getBuffer();
		var events = 'saved contents-modified';

		plugin.unsubscribe(buffer);

		if (atom.config.get('jshint.validateOnlyOnSave')) {
			events = 'saved';
		}

		plugin.subscribe(buffer, events, lint);
	});
}

plugin.configDefaults = {
	validateOnlyOnSave: false
};

plugin.activate = function () {
	//atom.workspaceView.command('jshint', lint);
	registerEvents();
	plugin.subscribe(atom.config.observe('jshint.validateOnlyOnSave', registerEvents));
};
