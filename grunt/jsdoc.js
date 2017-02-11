'use strict';

module.exports = function(grunt, scripts) {
  const jsdoc = {
    dist: {
      src:     scripts.app,
      options: {
        destination: 'doc',
        recurse:     true
      }
    }
  };

  grunt.loadNpmTasks('grunt-jsdoc');

  return jsdoc;
};

