'use strict';
var fs = require('fs');
var path = require('path');
var shjs = require('shelljs');
var cli = require('jshint/src/cli');

// from JSHint //
// Storage for memoized results from find file
// Should prevent lots of directory traversal &
// lookups when liniting an entire project
var findFileResults = {};

/**
 * Searches for a file with a specified name starting with
 * 'dir' and going all the way up either until it finds the file
 * or hits the root.
 *
 * @param {string} name filename to search for (e.g. .jshintrc)
 * @param {string} dir  directory to start search from (default:
 *                      current working directory)
 *
 * @returns {string} normalized filename
 */
function findFile(name, dir) {
  dir = dir || process.cwd();

  var filename = path.normalize(path.join(dir, name));
  if (findFileResults[filename] !== undefined) {
    return findFileResults[filename];
  }

  var parent = path.resolve(dir, '../');

  if (shjs.test('-e', filename)) {
    findFileResults[filename] = filename;
    return filename;
  }

  if (dir === parent) {
    findFileResults[filename] = null;
    return null;
  }

  return findFile(name, parent);
}

/**
 * Tries to find a configuration file in either project directory
 * or in the home directory. Configuration files are named
 * '.jshintrc'.
 *
 * @param {string} file path to the file to be linted
 * @returns {string} a path to the config file
 */
function findConfig(file) {
  var dir  = path.dirname(path.resolve(file));
  var envs = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
  var home = path.normalize(path.join(envs, '.jshintrc'));

  var proj = findFile('.jshintrc', dir);
  if (proj) {
    return proj;
  }

  if (shjs.test('-e', home)) {
    return home;
  }

  return null;
}

/**
 * Tries to find JSHint configuration within a package.json file
 * (if any). It search in the current directory and then goes up
 * all the way to the root just like findFile.
 *
 * @param   {string} file path to the file to be linted
 * @returns {object} config object
 */
function loadNpmConfig(file) {
  var dir = path.dirname(path.resolve(file));
  var fp  = findFile('package.json', dir);

  if (!fp) {
    return null;
  }

  try {
    return require(fp).jshintConfig;
  } catch (e) {
    return null;
  }
}
// / //

function loadConfigIfValid(filename) {
	var strip = require('strip-json-comments');
	try {
		JSON.parse(strip(fs.readFileSync(filename)));
		return cli.loadConfig(filename);
	} catch (e) {
	}
	return {};
}

module.exports = function (file) {
	var config = loadNpmConfig(file) || loadConfigIfValid(findConfig(file));
	if (config && config.dirname) {
		delete config.dirname;
	}
	return config;
};
