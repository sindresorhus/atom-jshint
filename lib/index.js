var JshintView = require('./jshint-view');
var plugin = module.exports;

plugin.activate = function () {
	return atom.workspaceView.eachEditorView(function (editorView) {
		if (editorView.attached && editorView.getPane()) {
			return editorView.underlayer.append(new JshintView(editorView));
		}
	});
};
