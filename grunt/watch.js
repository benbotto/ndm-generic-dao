'use strict';

module.exports = function(grunt, scripts) {
  let watch = {
    test: {
      options: {
        atBegin: true
      },
      files: scripts.app.concat(scripts.spec),
      tasks: ['jshint', 'jasmine_nodejs']
    }
  };

  grunt.loadNpmTasks('grunt-contrib-watch');

  return watch;
};
  
