'use strict';
var inherit = require('./inherit');
var View = require('atom').View;
var jshint = require('jshint').JSHINT;
var ErrorView = require('./error-view');

function JshintView(editorView) {
	View.apply(this, arguments);

	this.editorView = editorView;
	this.views = [];
	this.subscribeToBuffer();
}

inherit(JshintView, View);

JshintView.content = function () {
	return this.div({class: 'jshint'});
};

JshintView.prototype.beforeRemove = function () {
	this.unsubscribeFromBuffer();
};

JshintView.prototype.unsubscribeFromBuffer = function () {
	this.destroyViews();
	if (this.buffer) {
		this.unsubscribe(this.buffer);
		this.buffer = null;
	}
};

JshintView.prototype.subscribeToBuffer = function () {
	this.unsubscribeFromBuffer();
	this.buffer = this.editorView.getEditor().getBuffer();
	this.subscribe(this.buffer, 'contents-modified', this.updateErrors.bind(this));
	this.updateErrors();
};

JshintView.prototype.destroyViews = function () {
	var view;

	while (view = this.views.shift()) {
		view.destroy();
	}
};

JshintView.prototype.addViews = function (errors) {
	errors.forEach(function (error) {
		var view = new ErrorView(error, this.editorView);
		this.views.push(view);
		this.append(view);
	}, this);
};

JshintView.prototype.updateErrors = function () {
	var editor = this.editorView.getEditor();

	jshint(editor.getText());

	var errors = jshint.errors.map(function (error) {
		return [[error.line - 1, error.character - 1], [error.line - 1, error.character]];
	});

	this.destroyViews();
	this.addViews(errors);
};

module.exports = JshintView;
