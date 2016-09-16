'use strict';

module.exports = function(grunt, scripts) {
  let jasmineNode = {
    options: {
      specNameSuffix: 'Spec.js',
      useHelpers:     false,
      stopOnFailure:  false
    },
    all: {
      specs: scripts.spec
    }
  };

  grunt.loadNpmTasks('grunt-jasmine-nodejs');

  return jasmineNode;
};

