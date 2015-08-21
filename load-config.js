'use babel';
import fs from 'fs';
import path from 'path';
import shjs from 'shelljs';
import cli from 'jshint/src/cli';
import userHome from 'user-home';

// from JSHint //
// Storage for memoized results from find file
// Should prevent lots of directory traversal &
// lookups when liniting an entire project
const findFileResults = {};

/**
 * Searches for a file with a specified name starting with
 * 'dir' and going all the way up either until it finds the file
 * or hits the root.
 *
 * @param {string} name filename to search for (e.g. .jshintrc)
 * @param {string} dir  directory to start search from
 *
 * @returns {string} normalized filename
 */
const findFile = (name, dir) => {
	const filename = path.normalize(path.join(dir, name));
	if (findFileResults[filename] !== undefined) {
		return findFileResults[filename];
	}

	const parent = path.resolve(dir, '../');

	if (shjs.test('-e', filename)) {
		findFileResults[filename] = filename;
		return filename;
	}

	if (dir === parent) {
		findFileResults[filename] = null;
		return null;
	}

	return findFile(name, parent);
};

/**
 * Tries to find a configuration file in either project directory
 * or in the home directory. Configuration files are named
 * '.jshintrc'.
 *
 * @param {string} file path to the file to be linted
 * @returns {string} a path to the config file
 */
const findConfig = file => {
	const dir = path.dirname(path.resolve(file));
	const home = path.normalize(path.join(userHome, '.jshintrc'));

	const proj = findFile('.jshintrc', dir);
	if (proj) {
		return proj;
	}

	if (shjs.test('-e', home)) {
		return home;
	}

	return null;
};

/**
 * Tries to find JSHint configuration within a package.json file
 * (if any). It search in the current directory and then goes up
 * all the way to the root just like findFile.
 *
 * @param   {string} file path to the file to be linted
 * @returns {object} config object
 */
const loadNpmConfig = file => {
	const dir = path.dirname(path.resolve(file));
	const fp = findFile('package.json', dir);

	if (!fp) {
		return null;
	}

	try {
		return require(fp).jshintConfig;
	} catch (e) {
		return null;
	}
};
// / //

const loadConfigIfValid = filename => {
	const strip = require('strip-json-comments');
	try {
		JSON.parse(strip(fs.readFileSync(filename, 'utf8')));
		return cli.loadConfig(filename);
	} catch (e) {
	}
	return {};
};

const loadConfig = file => {
	const config = loadNpmConfig(file) || loadConfigIfValid(findConfig(file));
	if (config && config.dirname) {
		delete config.dirname;
	}
	return config;
};

export default loadConfig;
