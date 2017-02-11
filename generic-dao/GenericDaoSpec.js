describe('GenericDao()', function() {
  'use strict';

  require('../bootstrap');

  const insulin        = require('insulin').mock();
  const deferred       = insulin.get('deferred');
  const NotFoundError  = insulin.get('NotFoundError');
  const DuplicateError = insulin.get('DuplicateError');
  const database       = insulin.get('ndm_testDB');
  const DataContext    = insulin.get('ndm_MySQLDataContext');
  const GenericDao     = insulin.get('ndm_GenericDao');

  let dataContext, dao, pool;

  beforeEach(function() {
    insulin.forget();

    // Mock a connection pool object on the dataContext; queries don't actually
    // get executed.
    pool        = jasmine.createSpyObj('pool', ['query']);
    dataContext = new DataContext(database, pool);

    // GenericDao instance, testing against the 'users' table.
    dao = new GenericDao(dataContext, 'users');
  });

  /**
   * Retrieve.
   */
  describe('.retrieve()', function() {
    it('retrieves a list of resources when no parameters are supplied.', function() {
      const res = [
        {'users.userID': 1},
        {'users.userID': 2},
        {'users.userID': 3}
      ];

      pool.query.and.callFake((query, params, callback) => callback(null, res));

      dao
        .retrieve()
        .then(function(users) {
          expect(users.length).toBe(3);
          expect(users[0].ID).toBe(1);
          expect(users[1].ID).toBe(2);
          expect(users[2].ID).toBe(3);
        })
        .catch(() => expect(true).toBe(false))
        .done();
    });

    it('passes the parameters to the query executer.', function() {
      const res = [
        {'users.userID': 1}
      ];
      const where  = {$eq: {'users.userID': ':userID'}};
      const params = {userID: 1};

      pool.query.and.callFake(function(q, p, callback) {
        expect(p).toEqual(params);
        callback(null, res);
      });

      dao
        .retrieve(where, params)
        .then(function(users) {
          expect(users.length).toBe(1);
          expect(users[0].ID).toBe(1);
        })
        .catch(() => expect(true).toBe(false))
        .done();
    });

    it('propagates query execution errors back to the caller.', function() {
      const err = new Error('fake');

      pool.query.and.callFake((query, params, callback) => callback(err));

      dao
        .retrieve()
        .then(() => expect(true).toBe(false))
        .catch(e => expect(e).toBe(err))
        .done();
    });
  });

  /**
   * Retrieve single.
   */
  describe('.retrieveSingle()', function() {
    it('retrieves a single resource object.', function() {
      const res = [{'users.userID': 4}];

      pool.query.and.callFake((query, params, callback) => callback(null, res));

      dao
        .retrieveSingle()
        .then(user => expect(user.ID).toBe(4))
        .catch(() => expect(true).toBe(false));
    });

    it('returns the first record if multiple are found.', function() {
      const res = [
        {'users.userID': 4},
        {'users.userID': 5},
        {'users.userID': 6}
      ];

      pool.query.and.callFake((query, params, callback) => callback(null, res));
      dao
        .retrieveSingle()
        .then(user => expect(user.ID).toBe(4))
        .catch(() => expect(true).toBe(false));
    });

    it('returns a NotFoundError instance when there is no matching record.', function() {
      pool.query.and.callFake((query, params, callback) => callback(null, [])); // No records.

      dao
        .retrieveSingle()
        .then(() => expect(true).toBe(false))
        .catch(function(err) {
          expect(err.message).toBe('Resource not found.');
          expect(err.name).toBe('NotFoundError');
          expect(err.code).toBe('NOT_FOUND_ERROR');
        });
    });

    it('allows the NotFoundError to be customized.', function() {
      pool.query.and.callFake((query, params, callback) => callback(null, [])); // No records.
      const onNotFound = () => new NotFoundError('CUSTOM ERROR');

      dao
        .retrieveSingle(null, null, onNotFound)
        .then(() => expect(true).toBe(false))
        .catch(err => expect(err.message).toBe('CUSTOM ERROR'));
    });
  });

  /**
   * Retrieve by ID.
   */
  describe('.retrieveByID()', function() {
    it('generates the where clause and parameters dynamically.', function() {
      spyOn(dao, '_retrieveSingle').and.callFake(function(where, params, onNotFound) {
        expect(where).toEqual({$eq: {'users.userID': ':userID'}});
        expect(params).toEqual({userID: 42});
        expect(onNotFound().message).toBe('Invalid userID.');
      });

      dao.retrieveByID(42);
      expect(dao._retrieveSingle).toHaveBeenCalled();
    });
  });

  /**
   * Is unique.
   */
  describe('.isUnique()', function() {
    it('resolves with true when no records match.', function() {
      pool.query.and.callFake((query, params, callback) => callback(null, [])); // No records.

      dao
        .isUnique()
        .then(res => expect(res).toBe(true))
        .catch(() => expect(true).toBe(false));
    });

    it('rejects with a DuplicateError containing the matching ID if the ' +
     'record is not unique.', function() {
      const res = [{'users.userID': 42}];

      pool.query.and.callFake((query, params, callback) => callback(null, res));

      dao
        .isUnique()
        .then(() => expect(true).toBe(false))
        .catch(function(err) {
          expect(err.name).toBe('DuplicateError');
          expect(err.id).toBe(42);
        });
    });

    it('allows the DuplicateError to be customized.', function() {
      const res    = [{'users.userID': 42}];
      const onDupe = (err) => new DuplicateError('This name is taken.', 'name', err.id);

      pool.query.and.callFake((query, params, callback) => callback(null, res));

      dao
        .isUnique(null, null, onDupe)
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
  describe('.createIf()', function() {
    const goodUser = {first: 'Joe', last: 'Dimaggio'};

    it('rejects invalid resource with a ValidationErrorList instance.', function() {
      const user = {};

      dao.createIf(user) // Condition not called.
        .then(() => expect(true).toBe(false))
        .catch(function(err) {
          expect(err.code).toBe('VAL_ERROR_LIST');
          expect(err.errors[0].message).toBe('first is required.');
          expect(err.errors[1].message).toBe('last is required.');
        });
    });

    it('rejects with the condition\'s error (chained) if there is one.', function() {
      const cond = () => deferred.reject(new Error('FAKE ERROR!'));

      dao.createIf(goodUser, cond)
        .then(() => expect(true).toBe(false))
        .catch(err => expect(err.message).toBe('FAKE ERROR!'));
    });

    it('inserts the resource if the condition is met.', function() {
      const cond = () => deferred.resolve(true);

      pool.query.and.callFake((query, params, callback) => callback(null, {insertId: 42}));

      dao
        .createIf(goodUser, cond)
        .then(user => expect(user.ID).toBe(42))
        .catch(() => expect(true).toBe(false));
    });
  });

  /**
   * Create.
   */
  describe('.create()', function() {
    const goodUser = {first: 'Joe', last: 'Dimaggio'};

    it('is the same as createIf() with a no-op condition.', function() {
      spyOn(dao, '_createIf').and.callFake(function(resource, condition) {
        expect(resource).toBe(goodUser);
        condition()
          .then(() => expect(true).toBe(true))
          .catch(() => expect(true).toBe(false));
      });

      dao.create(goodUser);
      expect(dao._createIf).toHaveBeenCalled();
    });
  });

  /**
   * Update if.
   */
  describe('.updateIf()', function() {
    const goodUser = {ID: 42, first: 'Joe', last: 'Dimaggio'};

    it('rejects invalid resources with a ValidationErrorList instance.', function() {
      const user = {};

      dao.updateIf(user) // cond not called.
        .then(() => expect(true).toBe(false))
        .catch(function(err) {
          // ID required on update.
          expect(err.code).toBe('VAL_ERROR_LIST');
          expect(err.errors[0].message).toBe('ID is required.');
        });
    });

    it('rejects with the condition\'s rejection (chained) if the condition is not met.',
      function() {
      const cond = () => deferred.reject(new Error('FAKE ERROR!'));

      dao.updateIf(goodUser, cond)
        .then(() => expect(true).toBe(false))
        .catch(err => expect(err.message).toBe('FAKE ERROR!'));
    });

    it('updates the user if the condition is met.', function() {
      const cond = () => deferred.resolve(true);

      pool.query.and.callFake((query, params, callback) => callback(null, {affectedRows: 1}));

      dao
        .updateIf(goodUser, cond)
        .then(c => expect(c).toBe(goodUser))
        .catch(() => expect(true).toBe(false));
    });

    it('rejects with a NotFoundError instance if the resource is not found.', function() {
      const cond = () => deferred.resolve(true);

      // No rows affected.
      pool.query.and.callFake((query, params, callback) => callback(null, {affectedRows: 0}));

      dao
        .updateIf(goodUser, cond)
        .then(() => expect(true).toBe(false))
        .catch((err) => {
          expect(err.name).toBe('NotFoundError');
          expect(err.message).toBe('Resource not found.');
        });
    });
  });

  /**
   * Update.
   */
  describe('.update()', function() {
    const goodUser = {ID: 42, first: 'Joe', last: 'Dimaggio'};

    it('is the sames as updateIf() with a no-op condition.', function() {
      spyOn(dao, '_updateIf').and.callFake(function(resource, condition) {
        expect(resource).toBe(goodUser);
        condition()
          .then(() => expect(true).toBe(true))
          .catch(() => expect(true).toBe(false));
      });

      dao.update(goodUser);
      expect(dao._updateIf).toHaveBeenCalled();
    });
  });

  /**
   * Delete.
   */
  xdescribe('delete test suite.', function() {
    xit('checks that an invalid resource is rejected with a ValidationErrorList.', function() {
      const user = {userID: 'asdf'};

      dao
        .delete(user)
        .then(() => expect(true).toBe(false))
        .catch(function(err) {
          // ID required on delete.
          expect(err.code).toBe('VAL_ERROR_LIST');
          expect(err.errors[0].message).toBe('userID is required.');
        });
    });

    xit('checks that if the ID is invalid a 404 is returned.', function() {
      const user = {userID: 3, name: 'Mackey'};
      pool.query.and.callFake((query, params, callback) => callback(null, {affectedRows: 0}));

      dao
        .delete(user)
        .then(() => expect(true).toBe(false))
        .catch((err) => {
          expect(err.name).toBe('NotFoundError');
          expect(err.message).toBe('Resource not found.');
        });
    });
  });

  /**
   * Replace.
   */
  xdescribe('replace test suite.', function() {
    xit('checks that the parentID is validated.', function() {
      dao
        .replace('Users', 'asdf')
        .then(() => expect(true).toBe(false))
        .catch(errList => {
          expect(errList.errors.length).toBe(1);
          expect(errList.errors[0].message).toBe('userID is not a valid integer.');
        });
    });

    xit('checks that the parent ID is set on each resource.', function() {
      const users = [
        {name: 'Shady Oaks', userID: 1}, {name: 'Rocklin', userID: 2}
      ];

      dao
        .replace('Users', 42, users)
        .then(() => users.forEach(c => expect(c.userID).toBe(42)))
        .catch(() => expect(true).toBe(false));
    });

    xit('checks that each resource is validated.', function() {
      const users = [
        {name: 'Shady Oaks'}, {}, {name: ''}
      ];

      dao
        .replace('Users', 42, users)
        .then(() => expect(true).toBe(false))
        .catch(errList => {
          expect(errList.errors.length).toBe(1);
          expect(errList.errors[0].message).toBe('name is required.');
        });
    });

    xdescribe('query tests.', function() {
      beforeEach(function() {
        let callCount = 0;

        pool.query.and.callFake(function(query, params, callback) {
          if (++callCount === 1) {
            callback(null, {affectedRows: 1});
          }
          else {
            callback(null, {insertId: callCount});
          }
        });
      });

      xit('checks that the resources are deleted.', function() {
        const users   = [];

        pool.query.and.callFake(function(query, params, callback) {
          expect(query).toBe(
            'DELETE  `users`\n' +
            'FROM    `users` AS `users`\n' +
            'WHERE   `users`.`userID` = 42'
          );
          callback(null, {affectedRows: 1});
        });

        dao
          .replace('Users', 42, users)
          .catch(() => expect(true).toBe(false));
      });

      xit('checks that the new resources are inserted.', function() {
        let   callCount = 0;
        const users   = [
          {name: 'Shady Oaks'}
        ];

        pool.query.and.callFake(function(query, params, callback) {
          if (++callCount === 1) {
            callback(null, {affectedRows: 1});
          }
          else {
            expect(query).toBe(
              'INSERT INTO `users` (`name`, `userID`)\n' +
              'VALUES (\'Shady Oaks\', 42)'
            );
            callback(null, {insertId: callCount});
          }
        });

        dao
          .replace('Users', 42, users)
          .catch(() => expect(true).toBe(false))
          .done();
      });

      xit('checks that primary keys are updated.', function() {
        const users = [
          {userID: 10, name: 'Shady Oaks'},
          {name: 'Rocklin'},
          {userID: 12, name: 'Mackey'}
        ];

        dao
          .replace('Users', 42, users)
          .then(() => {
            expect(users[0].userID).toBe(2);
            expect(users[1].userID).toBe(3);
            expect(users[2].userID).toBe(4);
          })
          .catch(() => expect(true).toBe(false));
      });

      xit('checks that the users are returned.', function() {
        const users = [
          {name: 'Shady Oaks'}
        ];

        dao
          .replace('Users', 42, users)
          .then(c => expect(c).toBe(users))
          .catch(() => expect(true).toBe(false));
      });
    });
  });
});

