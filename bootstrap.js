'use strict';

/**
 * This script sets up the dependency injection container, insulin.
 */
const insulin = require('insulin');
const scripts = (require('./grunt/scriptGarner.js'))().app;

// Static dependencies.
insulin
  .factory('mysql',    () => require('mysql'))
  .factory('deferred', () => require('deferred'));

// These auto-register with insulin.
require('bsy-validation');
require('bsy-error');

// Application (dynamic) dependencies.
scripts.forEach(script => require(script));

// Export the list of files.
module.exports = scripts;

