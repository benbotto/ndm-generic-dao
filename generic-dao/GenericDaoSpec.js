describe('GenericDao test suite.', function() {
  'use strict';

  require('../bootstrap');

  let insulin        = require('insulin').mock();
  let deferred       = insulin.get('deferred');
  let ndm            = insulin.get('ndm');
  let NotFoundError  = insulin.get('NotFoundError');
  let DuplicateError = insulin.get('DuplicateError');
  let database       = new ndm.Database(require('./schema.json'));
  let db             = {};
  let dao, pool;

  beforeEach(function() {
    insulin.forget();

    // Mock a connection pool object, and give it to a DataContext.
    pool = jasmine.createSpyObj('pool', ['query']);
    db.dataContext = new ndm.MySQLDataContext(database, pool);
    db.then = (callback) => callback(db.dataContext);
    insulin.factory('db', () => db);

    // Now that the db is mocked, get a reference to the DAO.
    let GenericDao = insulin.get('GenericDao');
    dao = new GenericDao('UsersCourses');
  });

  describe('retrieve test suite.', function() {
    // Checks that a list can be retrieved.
    it('checks that a list can be retrieved.', function() {
      let res = [
        {'usersCourses.userCourseID': 4, 'usersCourses.userID': 3},
        {'usersCourses.userCourseID': 5, 'usersCourses.userID': 3},
        {'usersCourses.userCourseID': 6, 'usersCourses.userID': 3}
      ];
      let where = {$eq: {'usersCourses.userID': 3}};

      pool.query.and.callFake((query, callback) => callback(null, res));
      dao
        .retrieve(where)
        .then(function(courses) {
          expect(courses.length).toBe(3);
          expect(courses[0].userCourseID).toBe(4);
          expect(courses[1].userCourseID).toBe(5);
          expect(courses[2].userCourseID).toBe(6);
        })
        .catch(() => expect(true).toBe(false));
    });

    it('checks that where parameters are validated.', function() {
      let where  = {$eq: {'usersCourses.userID': ':userID'}};
      let params = {userID: 'asdf'};

      dao
        .retrieve(where, params)
        .then(() => expect(true).toBe(false))
        .catch(errList =>
          expect(errList.errors[0].message).toBe('userID is not a valid integer.'))
        .done();
    });

    it('checks that null is acceptable in a where condition.', function() {
      let where  = {$is: {'usersCourses.city': ':city'}};
      let params = {city: null};

      dao.retrieve(where, params);
      expect(pool.query).toHaveBeenCalled(); // Made it through validation.
    });

    it('checks that if non-nullable columns cannot be searched for using null values.', function() {
      let where  = {$is: {'usersCourses.userID': ':userID'}};
      let params = {userID: null};

      dao
        .retrieve(where, params)
        .then(() => expect(true).toBe(false))
        .catch(errList => expect(errList.errors[0].message).toBe('userID cannot be null.'));
      expect(pool.query).not.toHaveBeenCalled();
    });
  });

  describe('retrieveSingle test suite.', function() {
    // Checks that a single resource can be retrieved.
    it('checks that a single resource can be retrieved.', function() {
      let res = [{'usersCourses.userCourseID': 4, 'usersCourses.userID': 3}];

      pool.query.and.callFake((query, callback) => callback(null, res));
      dao
        .retrieveSingle({$eq: {'usersCourses.userCourseID': 4}})
        .then(function(course) {
          expect(course.userID).toBe(3);
          expect(course.userCourseID).toBe(4);
        })
        .catch(() => expect(true).toBe(false));
    });

    // Checks that if multiple records are found, only the first is returned.
    it('checks that if multiple records are found, only the first is returned.', function() {
      let res = [
        {'usersCourses.userCourseID': 4, 'usersCourses.userID': 3},
        {'usersCourses.userCourseID': 5, 'usersCourses.userID': 3},
        {'usersCourses.userCourseID': 6, 'usersCourses.userID': 3}
      ];
      let where = {$eq: {'usersCourses.userID': 3}};

      pool.query.and.callFake((query, callback) => callback(null, res));
      dao
        .retrieveSingle(where)
        .then(function(course) {
          expect(course.userCourseID).toBe(4);
        })
        .catch(() => expect(true).toBe(false));
    });

    // Checks that a NotFoundError is returned when there is no matching record.
    it('checks that a NotFoundError is returned when there is no matching record.', function() {
      pool.query.and.callFake((query, callback) => callback(null, [])); // No records.
      dao
        .retrieveSingle({$eq: {'usersCourses.userCourseID': 42}})
        .then(() => expect(true).toBe(false))
        .catch(function(err) {
          expect(err.message).toBe('Resource not found.');
          expect(err.name).toBe('NotFoundError');
          expect(err.code).toBe('NOT_FOUND_ERROR');
        });
    });

    // Checks that the error can be customized.
    it('checks that the error can be customized.', function() {
      pool.query.and.callFake((query, callback) => callback(null, [])); // No records.
      let onNotFound = () => new NotFoundError('CUSTOM ERROR');

      dao
        .retrieveSingle({$eq: {'usersCourses.userCourseID': 42}}, null, onNotFound)
        .then(() => expect(true).toBe(false))
        .catch(err => expect(err.message).toBe('CUSTOM ERROR'));
    });
  });

  describe('isUnique test suite.', function() {
    // Checks a single unique value.
    it('checks a single unique value.', function() {
      pool.query.and.callFake((query, callback) => callback(null, [])); // No records.
      dao
        .isUnique({$eq: {'usersCourses.name': ':name'}}, {name: 'Shady Oaks'})
        .then(res => expect(res).toBe(true))
        .catch(() => expect(true).toBe(false));
    });

    // Checks that a duplicate gets rejected with the correct id.
    it('checks that a duplicate gets rejected with the correct id.', function() {
      let res = [{'usersCourses.userCourseID': 42}];
      pool.query.and.callFake((query, callback) => callback(null, res));
      dao
        .isUnique({$eq: {'usersCourses.name': ':name'}}, {name: 'Shady Oaks'})
        .then(() => expect(true).toBe(false))
        .catch(function(err) {
          expect(err.name).toBe('DuplicateError');
          expect(err.id).toBe(42);
        });
    });

    // Checks that the error can be customized.
    it('checks that the error can be customized.', function() {
      let res    = [{'usersCourses.userCourseID': 42}];
      let onDupe = (err) => new DuplicateError('This name is taken.', 'name', err.id);

      pool.query.and.callFake((query, callback) => callback(null, res));
      dao
        .isUnique({$eq: {'usersCourses.name': ':name'}}, {name: 'Shady Oaks'}, onDupe)
        .then(() => expect(true).toBe(false))
        .catch(function(err) {
          expect(err.name).toBe('DuplicateError');
          expect(err.id).toBe(42);
          expect(err.message).toBe('This name is taken.');
          expect(err.field).toBe('name');
        });
    });
  });

  describe('createIf test suite.', function() {
    // Checks that an invalid resource is rejected with a ValidationErrorList.
    it('checks that an invalid resource is rejected with a ValidationErrorList.', function() {
      let course = {userID: 3};
      dao.createIf(course) // Condition not called.
        .then(() => expect(true).toBe(false))
        .catch(function(err) {
          expect(err.code).toBe('VAL_ERROR_LIST');
          expect(err.errors[0].message).toBe('name is required.');
        });
    });

    // Checks that if the condition is not met the result is chainable.
    it('checks that if the condition is not met the result is chainable.', function() {
      let course = {userID: 3, name: 'Mackey'};
      let cond   = () => deferred.reject(new Error('FAKE ERROR!'));
      dao.createIf(course, cond)
        .then(() => expect(true).toBe(false))
        .catch(err => expect(err.message).toBe('FAKE ERROR!'));
    });

    // Checks that if the condition is met the resource is inserted.
    it('checks that if the condition is met the resource is inserted.', function() {
      let course = {userID: 3, name: 'Mackey'};
      let cond   = () => deferred.resolve(true);
      pool.query.and.callFake((query, callback) => callback(null, {insertId: 42}));
      dao
        .createIf(course, cond)
        .then(course => expect(course.userCourseID).toBe(42))
        .catch(() => expect(true).toBe(false));
    });

    // Checks the create method which uses a no-op condition.
    it('checks the create method which uses a no-op condition.', function() {
      let course = {userID: 3, name: 'Mackey'};
      spyOn(dao, 'createIf').and.callFake(function(resource, condition) {
        expect(resource).toBe(course);
        condition()
          .then(() => expect(true).toBe(true))
          .catch(() => expect(true).toBe(false));
      });

      dao.create(course);
    });
  });

  describe('updateIf test suite.', function() {
    // Checks that an invalid resource is rejected with a ValidationErrorList.
    it('checks that an invalid resource is rejected with a ValidationErrorList.', function() {
      let course = {userID: 3, name: 'Makey'};
      dao.updateIf(course)
        .then(() => expect(true).toBe(false))
        .catch(function(err) {
          // ID required on update.
          expect(err.code).toBe('VAL_ERROR_LIST');
          expect(err.errors[0].message).toBe('userCourseID is required.');
        });
    });

    // Checks that if the condition is not met the result is chainable.
    it('checks that if the condition is not met the result is chainable.', function() {
      let course = {userID: 3, name: 'Mackey', userCourseID: 12};
      let cond   = () => deferred.reject(new Error('FAKE ERROR!'));
      dao.updateIf(course, cond)
        .then(() => expect(true).toBe(false))
        .catch(err => expect(err.message).toBe('FAKE ERROR!'));
    });

    // Checks that if the condition is met the resource is updated.
    it('checks that if the condition is met the resource is updated.', function() {
      let course = {userID: 3, name: 'Mackey', userCourseID: 12};
      let cond   = () => deferred.resolve(true);
      pool.query.and.callFake((query, callback) => callback(null, {affectedRows: 1}));
      dao
        .updateIf(course, cond)
        .then(c => expect(c).toBe(course))
        .catch(() => expect(true).toBe(false));
    });

    it('checks that if the ID is invalid a 404 is returned.', function() {
      let course = {userID: 3, name: 'Mackey', userCourseID: 12};
      let cond   = () => deferred.resolve(true);
      pool.query.and.callFake((query, callback) => callback(null, {affectedRows: 0}));
      dao
        .updateIf(course, cond)
        .then(() => expect(true).toBe(false))
        .catch((err) => {
          expect(err.name).toBe('NotFoundError');
          expect(err.message).toBe('Resource not found.');
        });
    });

    // Checks the update method which uses a no-op condition.
    it('checks the update method which uses a no-op condition.', function() {
      let course = {userID: 3, name: 'Mackey', userCourseID: 12};

      spyOn(dao, 'updateIf').and.callFake(function(resource, condition) {
        expect(resource).toBe(course);
        condition()
          .then(() => expect(true).toBe(true))
          .catch(() => expect(true).toBe(false));
      });

      dao.update(course);
    });
  });
});

