'use strict';
var inherit = require('./inherit');
var View = require('atom').View;
var Range = require('atom').Range;

function ErrorView(range, editorView) {
	View.apply(this, arguments);

	this.editorView = editorView;
	this.editor = this.editorView.getEditor();
	range = this.editor.screenRangeForBufferRange(Range.fromObject(range));
	this.startPosition = range.start;
	this.endPosition = range.end;
	this.createMarker();
	this.subscribe(this.editorView, 'jshint:display-updated', this.updatePosition.bind(this));
	this.updatePosition();
}

inherit(ErrorView, View);

ErrorView.content = function () {
	return this.div({class: 'error'});
};

ErrorView.prototype.createMarker = function () {
	this.marker = this.editor.markScreenRange(new Range(this.startPosition, this.endPosition), {
		invalidation: 'inside',
		replicate: false
	});

	this.marker.on('changed', function (e) {
		this.startPosition = e.newTailScreenPosition;
		this.endPosition = e.newHeadScreenPosition;
	}.bind(this));
};

ErrorView.prototype.beforeRemove = function () {
	this.marker.destroy();
};

ErrorView.prototype.updatePosition = function () {
	var startPixelPosition = this.editorView.pixelPositionForScreenPosition(this.startPosition);
	var endPixelPosition = this.editorView.pixelPositionForScreenPosition(this.endPosition);

	this.css({
		top: startPixelPosition.top,
		left: startPixelPosition.left,
		width: endPixelPosition.left - startPixelPosition.left,
		height: this.editorView.lineHeight
	});

	this.show();
};

ErrorView.prototype.destroy = function () {
	this.remove();
};

module.exports = ErrorView;
