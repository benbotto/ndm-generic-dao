'use strict';

module.exports = function(verbose) {
  const glob = require('glob');

  let files = {};
  let opts;

  // Application files.
  opts = {
    ignore: [
      'node_modules/**',
      'grunt/**',
      'Gruntfile.js',
      '**/*Spec.js'
    ]
  };
  files.app = glob.sync('**/*.js', opts);

  // Specs.
  opts = {
    ignore: [
      'node_modules/**',
      'grunt/**',
      'Gruntfile.js'
    ]
  };
  files.spec = glob.sync('**/*Spec.js', opts);

  // Grunt files.
  opts = {};
  files.grunt = ['Gruntfile.js'].concat(glob.sync('grunt/*.js', opts));

  if (verbose) {
    console.log('Script garner gathered the following files.');
    console.dir(files);
  }

  return files;
};

