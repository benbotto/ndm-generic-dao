'use strict';

require('insulin').factory('GenericDao', GenericDaoProducer);

function GenericDaoProducer(deferred, NotFoundError, DuplicateError, InsertValidator,
  UpdateValidator, ModelValidator) {
  /**
   * Generic data-access object for simple CRUD operations.
   */
  class GenericDao {
    /**
     * Initialize the DAO.  Note that the db is expected to be connected
     * before any of this class's methods are used.
     * @param dataContext A DataContext instance that is used to run queries.
     * @param tableName The name of the table that this DAO operates on.
     */
    constructor(dataContext, tableName) {
      this.dc    = dataContext;
      this.table = this.dc.getDatabase().getTableByName(tableName);
    }

    /**
     * Retrieve an array of resources.
     * @param where An optional where condition.
     * @param params Query parameters for the where condition.
     * @returns A promise that is resolved with the results as an array.
     */
    retrieve(where, params) {
      const tblAlias = this.table.getAlias();
      const query    = this.dc.from(this.table.getName());

      params = params || {};

      if (where)
        query.where(where, params);

      return new ModelValidator(params, tblAlias, this.dc.getDatabase())
        .validate()
        .then(() => query.select().execute())
        .then(res => res[tblAlias]);
    }

    /**
     * Retrieve a single resource as an object.
     * @param where An optional where condition.
     * @param params Query parameters for the where condition.
     * @param onNotFound An optional function that produces an error when
     *        a resource is not found.
     * @returns A promise that is resolved with the first matching resource.
     *          If there are no matches found, then the promise is rejected
     *          with a NotFoundError instance.
     */
    retrieveSingle(where, params, onNotFound) {
      return this
        .retrieve(where, params)
        .then(res => {
          if (res.length === 0) {
            const err = new NotFoundError('Resource not found.');

            if (onNotFound)
              return deferred.reject(onNotFound(err));
            return deferred.reject(err);
          }

          return res[0];
        });
    }

    /**
     * Retrieve a single resource by ID.  Specialized version of retrieveSingle.
     * @param id The unique identifier of the resource.
     */
    retrieveByID(id) {
      const pkName     = this.table.getPrimaryKey()[0].getName();
      const fqcn       = `${this.table.getAlias()}.${pkName}`;
      const where      = {$eq: {[fqcn]: `:${pkName}`}};
      const params     = {[pkName]: id};
      const onNotFound = () => new NotFoundError(`Invalid ${pkName}.`);

      return this.retrieveSingle(where, params, onNotFound);
    }

    /**
     * Helper function to check that something is unique.  This is useful
     * before creating or updating a record.
     * @param where A where condition (how to find the record).
     * @param params Query parameters for the where condition.
     * @param onDupe An option function that is called when a duplicate is
     *        found.  If the resource is not found and this function is
     *        defined, the resource is rejected with the result of this
     *        function.
     * @returns A promise that is resolved if the resource is unique (that is,
     *          if no records are found).  If the resource is not unique then
     *          the promise is rejected with a DuplicateError instance.
     */
    isUnique(where, params, onDupe) {
      return this
        .retrieve(where, params)
        .then(dupe => {
          if (dupe.length === 0)
            return deferred.resolve(true);

          // This is the id of the duplicate record.
          const pkName = this.table.getPrimaryKey()[0].getName();
          const id     = dupe[0][pkName];
          const err    = new DuplicateError('Duplicate resource', null, id);

          if (onDupe)
            return deferred.reject(onDupe(err));
          return deferred.reject(err);
        });
    }

    /**
     * Create a resource if a condition resolves successfully.  Note
     * that prior to invoking the condition the resource is validated
     * using an InsertValidator.
     * @param resource A model to create.
     * @param condition A function that returns a promise.  If the promise
     *        is resolved then the model is created.  resource is passed
     *        to condition.
     * @returns A promise that is:
     *          1) Resolved with the model if the model is valid and the
     *             condition is resolved.  The model will be updated with
     *             the new ID if possible.
     *          2) Rejected with a ValidationErrorList if the model is invalid.
     *          3) Rejected with condition's promise if condition is rejected.
     */
    createIf(resource, condition) {
      const tblAlias = this.table.getAlias();

      return new InsertValidator(resource, tblAlias, this.dc.getDatabase())
        .validate()
        .then(() => condition(resource))
        .then(() => this.dc.insert({[tblAlias]: resource}).execute())
        .then(() => resource);
    }

    /**
     * Generic create method that validates a model using an InsertValidator
     * and then inserts the model.
     * @param resource A model to create.
     */
    create(resource) {
      // Same as createIf with a no-op condition.
      return this.createIf(resource, () => deferred.resolve());
    }

    /**
     * Update a resource if a condition resolves successfully.  Note
     * that prior to invoking the condition the resource is validated
     * using an UpdateValidator.
     * @param resource A model to update by ID.
     * @param condition A function that returns a promise.  If the promise
     *        is resolved then the model is created.  resource is passed
     *        to condition.
     * @returns A promise that is:
     *          1) Resolved with the model if the model is valid and the
     *             condition is resolved.
     *          2) Rejected with a ValidationErrorList if the model is invalid.
     *          3) Rejected with condition's promise if condition is rejected.
     */
    updateIf(resource, condition) {
      const tblAlias = this.table.getAlias();

      return new UpdateValidator(resource, tblAlias, this.dc.getDatabase())
        .validate()
        .then(() => condition(resource))
        .then(() => this.dc.update({[tblAlias]: resource}).execute())
        .then(function(updRes) {
          return updRes.affectedRows === 1 ? resource : deferred.reject(
            new NotFoundError('Resource not found.'));
        });
    }

    /**
     * Generic update method that validates a model using an UpdateValidator
     * and then updates it by ID.
     * @param resource A model to update by ID.
     */
    update(resource) {
      // Same as updateIf with a no-op condition.
      return this.updateIf(resource, () => deferred.resolve());
    }
  }

  return GenericDao;
}

