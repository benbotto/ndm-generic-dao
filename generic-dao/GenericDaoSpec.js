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

    it('rejects invalid resources with a ValidationErrorList instance.', function() {
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
  describe('.delete()', function() {
    const goodUser = {ID: 42};

    it('rejects invalid resources with a ValidationErrorList instance.', function() {
      const user = {};

      dao
        .delete(user)
        .then(() => expect(true).toBe(false))
        .catch(function(err) {
          // ID required on delete.
          expect(err.code).toBe('VAL_ERROR_LIST');
          expect(err.errors[0].message).toBe('ID is required.');
        });
    });

    it('rejects with a NotFoundError instance if the resource is not found.', function() {
      // No rows affected.
      pool.query.and.callFake((query, params, callback) => callback(null, {affectedRows: 0}));

      dao
        .delete(goodUser)
        .then(() => expect(true).toBe(false))
        .catch(function(err) {
          expect(err.name).toBe('NotFoundError');
          expect(err.message).toBe('Resource not found.');
        });
    });
  });

  /**
   * Replace.
   */
  describe('.replace()', function() {
    let id;

    // In these tests, phone_numbers is used, which is a child
    // of users (each user has zero or more numbers).
    beforeEach(function() {
      dao = new GenericDao(dataContext, 'phone_numbers');

      // Default action for pool; return a new ID each time.
      id = 0;
      pool.query.and.callFake((query, params, callback) => callback(null, {insertId: ++id}));
    });

    it('rejects with an error if the parentID is invalid.', function() {
      dao
        .replace('users', 'asdf')
        .then(() => expect(true).toBe(false))
        .catch(errList => {
          expect(errList.errors.length).toBe(1);
          expect(errList.errors[0].message).toBe('ID is not a valid integer.');
        })
        .done();
    });

    it('sets the parentID on each resource using the column\'s mapping, ' +
      'and replaces the resource identifier on each resource.', function() {
      const phones = [
        {ID: 30, phoneNumber: '111-222-3333'},
        {ID: 31, phoneNumber: '444-555-6666'}
      ];

      dao
        .replace('users', 42, phones)
        .then(() => {
          // userID set using the mapping.
          expect(phones[0].uID).toBe(42);
          expect(phones[1].uID).toBe(42);

          // ID replaced (note that the callback bumps the ID during the
          // deletes, so the ID starts at 2 instead of 1.
          expect(phones[0].ID).toBe(2);
          expect(phones[1].ID).toBe(3);
        })
        .catch(() => expect(true).toBe(false));
    });

    it('rejects with a ValidationErrorList if any resources are invalid.', function() {
      // phoneNumber cannot be null.
      const phones = [{}];

      dao
        .replace('users', 42, phones)
        .then(() => expect(true).toBe(false))
        .catch(errList => {
          expect(errList.errors.length).toBe(1);
          expect(errList.errors[0].message).toBe('phoneNumber is required.');
        });
    });

    /**
     * Insert/delete tests for replace.
     */
    describe('query tests.', function() {
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

      it('deletes the resources, then inserts them (replace).', function() {
        const phones = [
          {phoneNumber: '111-222-3333'}
        ];

        dao
          .replace('users', 42, phones)
          .catch(() => expect(true).toBe(false))
          .done();

        // Delete.
        expect(pool.query.calls.argsFor(0)[0]).toBe(
          'DELETE  `phone_numbers`\n' +
          'FROM    `phone_numbers` AS `phone_numbers`\n' +
          'WHERE   `phone_numbers`.`userID` = :ID'
        );
        expect(pool.query.calls.argsFor(0)[1]).toEqual({ID: 42});

        // Insert.
        expect(pool.query.calls.argsFor(1)[0]).toBe(
          'INSERT INTO `phone_numbers` (`phoneNumber`, `userID`)\n' +
          'VALUES (:phoneNumber, :uID)'
        );
        expect(pool.query.calls.argsFor(1)[1]).toEqual({
          uID: 42,
          phoneNumber: '111-222-3333'
        });
      });
    });
  });

  /**
   * Options.
   */
  describe('.options()', function() {
    it('removes private properties from the schema.', function() {
      dao = new GenericDao(dataContext, 'products');

      dao
        .options()
        .then(desc => {
          expect(desc.schema._mapToLookup).not.toBeDefined();
          expect(desc.schema._nameLookup).not.toBeDefined();
        });
    });

    it('removes converters from the columns.', function() {
      dao = new GenericDao(dataContext, 'products');

      dao
        .options()
        .then(desc => {
          desc.schema.columns.forEach(col => expect(col.converter).not.toBeDefined());
          desc.schema.primaryKey.forEach(col => expect(col.converter).not.toBeDefined());
        });
    });

    it('has the table name and mapTo.', function() {
      dao = new GenericDao(dataContext, 'phone_numbers');

      dao
        .options()
        .then(desc => {
          expect(desc.schema.name).toBe('phone_numbers');
          expect(desc.schema.mapTo).toBe('phoneNumbers');
        });
    });

    it('has the column descriptions.', function() {
      dao = new GenericDao(dataContext, 'users');

      dao
        .options()
        .then(desc => {
          expect(desc.schema.columns).toEqual([
						{ name: 'userID',
							mapTo: 'ID',
							isPrimary: true,
							dataType: 'int',
							isNullable: false },
						{ name: 'firstName',
							mapTo: 'first',
							dataType: 'varchar',
							isNullable: false,
							maxLength: 255,
							isPrimary: false },
						{ name: 'lastName',
							mapTo: 'last',
							dataType: 'varchar',
							isNullable: false,
							maxLength: 255,
							isPrimary: false } 
          ]);
        });
    });

    it('provides a usage description with type information.', function() {
      dao = new GenericDao(dataContext, 'products');

      dao
        .options()
        .then(desc => {
          expect(desc.example).toEqual({
            ID             : '<{dataType=int}{primaryKey}>', // Uses the mapping.
            description    : '<{dataType=varchar}{maxLength=255}>',
            isActive       : '<{dataType=bit}{optional}{defaultValue=1}>',
            primaryPhotoID : '<{dataType=int}{optional}>'
          });
        });
    });
  });
});

