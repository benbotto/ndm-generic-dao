'use strict';

module.exports = function(grunt) {
  const VERBOSE = false;

  let scripts = (require('./grunt/scriptGarner.js'))(VERBOSE);

  grunt.initConfig({
    jshint:         require('./grunt/jshint')(grunt, scripts),
    jasmine_nodejs: require('./grunt/jasmine-nodejs')(grunt, scripts),
    watch:          require('./grunt/watch')(grunt, scripts)
  });

  grunt.registerTask('default', ['jshint', 'jasmine_nodejs']);
};

