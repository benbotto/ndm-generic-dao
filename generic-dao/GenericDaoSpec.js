describe('GenericDao test suite.', function() {
  'use strict';

  require('../bootstrap');

  const insulin        = require('insulin').mock();
  const deferred       = insulin.get('deferred');
  const ndm            = insulin.get('ndm');
  const NotFoundError  = insulin.get('NotFoundError');
  const DuplicateError = insulin.get('DuplicateError');
  const database       = new ndm.Database(require('./schema.json'));
  const db             = {};

  let dao, pool;

  beforeEach(function() {
    insulin.forget();

    // Mock a connection pool object, and give it to a DataContext.
    pool = jasmine.createSpyObj('pool', ['query']);
    db.dataContext = new ndm.MySQLDataContext(database, pool);
    db.then = (callback) => callback(db.dataContext);
    insulin.factory('db', () => db);

    // Now that the db is mocked, get a reference to the DAO.
    const GenericDao = insulin.get('GenericDao');
    dao = new GenericDao(db.dataContext, 'UsersCourses');
  });

  /**
   * Retrieve.
   */
  describe('retrieve test suite.', function() {
    it('checks that a list can be retrieved.', function() {
      const res = [
        {'usersCourses.userCourseID': 4, 'usersCourses.userID': 3},
        {'usersCourses.userCourseID': 5, 'usersCourses.userID': 3},
        {'usersCourses.userCourseID': 6, 'usersCourses.userID': 3}
      ];
      const where = {$eq: {'usersCourses.userID': 3}};

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
      const where  = {$eq: {'usersCourses.userID': ':userID'}};
      const params = {userID: 'asdf'};

      dao
        .retrieve(where, params)
        .then(() => expect(true).toBe(false))
        .catch(errList =>
          expect(errList.errors[0].message).toBe('userID is not a valid integer.'))
        .done();
    });

    it('checks that null is acceptable in a where condition.', function() {
      const where  = {$is: {'usersCourses.city': ':city'}};
      const params = {city: null};

      dao.retrieve(where, params);
      expect(pool.query).toHaveBeenCalled(); // Made it through validation.
    });

    it('checks that if non-nullable columns cannot be searched for using null values.', function() {
      const where  = {$is: {'usersCourses.userID': ':userID'}};
      const params = {userID: null};

      dao
        .retrieve(where, params)
        .then(() => expect(true).toBe(false))
        .catch(errList => expect(errList.errors[0].message).toBe('userID cannot be null.'));
      expect(pool.query).not.toHaveBeenCalled();
    });
  });

  /**
   * Retrieve single.
   */
  describe('retrieveSingle test suite.', function() {
    it('checks that a single resource can be retrieved.', function() {
      const res = [{'usersCourses.userCourseID': 4, 'usersCourses.userID': 3}];

      pool.query.and.callFake((query, callback) => callback(null, res));
      dao
        .retrieveSingle({$eq: {'usersCourses.userCourseID': 4}})
        .then(function(course) {
          expect(course.userID).toBe(3);
          expect(course.userCourseID).toBe(4);
        })
        .catch(() => expect(true).toBe(false));
    });

    it('checks that if multiple records are found, only the first is returned.', function() {
      const res = [
        {'usersCourses.userCourseID': 4, 'usersCourses.userID': 3},
        {'usersCourses.userCourseID': 5, 'usersCourses.userID': 3},
        {'usersCourses.userCourseID': 6, 'usersCourses.userID': 3}
      ];
      const where = {$eq: {'usersCourses.userID': 3}};

      pool.query.and.callFake((query, callback) => callback(null, res));
      dao
        .retrieveSingle(where)
        .then(function(course) {
          expect(course.userCourseID).toBe(4);
        })
        .catch(() => expect(true).toBe(false));
    });

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

    it('checks that the error can be customized.', function() {
      pool.query.and.callFake((query, callback) => callback(null, [])); // No records.
      const onNotFound = () => new NotFoundError('CUSTOM ERROR');

      dao
        .retrieveSingle({$eq: {'usersCourses.userCourseID': 42}}, null, onNotFound)
        .then(() => expect(true).toBe(false))
        .catch(err => expect(err.message).toBe('CUSTOM ERROR'));
    });
  });

  /**
   * Retrieve by ID.
   */
  describe('retrieveByID test suite.', function() {
    it('checks that the where clause and parameters are correct.', function() {
      spyOn(dao, 'retrieveSingle').and.callFake(function(where, params, onNotFound) {
        expect(where).toEqual({$eq: {'usersCourses.userCourseID': ':userCourseID'}});
        expect(params).toEqual({userCourseID: 42});
        expect(onNotFound().message).toBe('Invalid userCourseID.');
      });

      dao.retrieveByID(42);
    });
  });

  /**
   * Is unique.
   */
  describe('isUnique test suite.', function() {
    it('checks a single unique value.', function() {
      pool.query.and.callFake((query, callback) => callback(null, [])); // No records.
      dao
        .isUnique({$eq: {'usersCourses.name': ':name'}}, {name: 'Shady Oaks'})
        .then(res => expect(res).toBe(true))
        .catch(() => expect(true).toBe(false));
    });

    it('checks that a duplicate gets rejected with the correct id.', function() {
      const res = [{'usersCourses.userCourseID': 42}];
      pool.query.and.callFake((query, callback) => callback(null, res));
      dao
        .isUnique({$eq: {'usersCourses.name': ':name'}}, {name: 'Shady Oaks'})
        .then(() => expect(true).toBe(false))
        .catch(function(err) {
          expect(err.name).toBe('DuplicateError');
          expect(err.id).toBe(42);
        });
    });

    it('checks that the error can be customized.', function() {
      const res    = [{'usersCourses.userCourseID': 42}];
      const onDupe = (err) => new DuplicateError('This name is taken.', 'name', err.id);

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

  /**
   * Create if.
   */
  describe('createIf test suite.', function() {
    it('checks that an invalid resource is rejected with a ValidationErrorList.', function() {
      const course = {userID: 3};
      dao.createIf(course) // Condition not called.
        .then(() => expect(true).toBe(false))
        .catch(function(err) {
          expect(err.code).toBe('VAL_ERROR_LIST');
          expect(err.errors[0].message).toBe('name is required.');
        });
    });

    it('checks that if the condition is not met the result is chainable.', function() {
      const course = {userID: 3, name: 'Mackey'};
      const cond   = () => deferred.reject(new Error('FAKE ERROR!'));
      dao.createIf(course, cond)
        .then(() => expect(true).toBe(false))
        .catch(err => expect(err.message).toBe('FAKE ERROR!'));
    });

    it('checks that if the condition is met the resource is inserted.', function() {
      const course = {userID: 3, name: 'Mackey'};
      const cond   = () => deferred.resolve(true);
      pool.query.and.callFake((query, callback) => callback(null, {insertId: 42}));
      dao
        .createIf(course, cond)
        .then(course => expect(course.userCourseID).toBe(42))
        .catch(() => expect(true).toBe(false));
    });

    it('checks the create method which uses a no-op condition.', function() {
      const course = {userID: 3, name: 'Mackey'};
      spyOn(dao, 'createIf').and.callFake(function(resource, condition) {
        expect(resource).toBe(course);
        condition()
          .then(() => expect(true).toBe(true))
          .catch(() => expect(true).toBe(false));
      });

      dao.create(course);
    });
  });

  /**
   * Update if.
   */
  describe('updateIf test suite.', function() {
    it('checks that an invalid resource is rejected with a ValidationErrorList.', function() {
      const course = {userID: 3, name: 'Makey'};
      dao.updateIf(course)
        .then(() => expect(true).toBe(false))
        .catch(function(err) {
          // ID required on update.
          expect(err.code).toBe('VAL_ERROR_LIST');
          expect(err.errors[0].message).toBe('userCourseID is required.');
        });
    });

    it('checks that if the condition is not met the result is chainable.', function() {
      const course = {userID: 3, name: 'Mackey', userCourseID: 12};
      const cond   = () => deferred.reject(new Error('FAKE ERROR!'));
      dao.updateIf(course, cond)
        .then(() => expect(true).toBe(false))
        .catch(err => expect(err.message).toBe('FAKE ERROR!'));
    });

    it('checks that if the condition is met the resource is updated.', function() {
      const course = {userID: 3, name: 'Mackey', userCourseID: 12};
      const cond   = () => deferred.resolve(true);
      pool.query.and.callFake((query, callback) => callback(null, {affectedRows: 1}));
      dao
        .updateIf(course, cond)
        .then(c => expect(c).toBe(course))
        .catch(() => expect(true).toBe(false));
    });

    it('checks that if the ID is invalid a 404 is returned.', function() {
      const course = {userID: 3, name: 'Mackey', userCourseID: 12};
      const cond   = () => deferred.resolve(true);
      pool.query.and.callFake((query, callback) => callback(null, {affectedRows: 0}));
      dao
        .updateIf(course, cond)
        .then(() => expect(true).toBe(false))
        .catch((err) => {
          expect(err.name).toBe('NotFoundError');
          expect(err.message).toBe('Resource not found.');
        });
    });

    it('checks the update method which uses a no-op condition.', function() {
      const course = {userID: 3, name: 'Mackey', userCourseID: 12};

      spyOn(dao, 'updateIf').and.callFake(function(resource, condition) {
        expect(resource).toBe(course);
        condition()
          .then(() => expect(true).toBe(true))
          .catch(() => expect(true).toBe(false));
      });

      dao.update(course);
    });
  });

  /**
   * Delete.
   */
  describe('delete test suite.', function() {
    it('checks that an invalid resource is rejected with a ValidationErrorList.', function() {
      const course = {userID: 'asdf'};

      dao.delete(course)
        .then(() => expect(true).toBe(false))
        .catch(function(err) {
          // ID required on delete.
          expect(err.code).toBe('VAL_ERROR_LIST');
          expect(err.errors[0].message).toBe('userCourseID is required.');
        });
    });

    it('checks that if the ID is invalid a 404 is returned.', function() {
      const course = {userID: 3, name: 'Mackey', userCourseID: 12};
      pool.query.and.callFake((query, callback) => callback(null, {affectedRows: 0}));

      dao
        .delete(course)
        .then(() => expect(true).toBe(false))
        .catch((err) => {
          expect(err.name).toBe('NotFoundError');
          expect(err.message).toBe('Resource not found.');
        });
    });
  });
});

