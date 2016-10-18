'use strict';

require('insulin').factory('GenericDao', GenericDaoProducer);

function GenericDaoProducer(deferred, NotFoundError, DuplicateError, InsertValidator,
  UpdateValidator, ModelValidator, DeleteValidator) {
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

    // <<private>>

    /**
     * Private implementation details for retrieve.
     * @param where See retrieve().
     * @param params See retrieve().
     */
    _retrieve(where, params) {
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
     * Private implementation details for retrieveSingle.
     * @param where See retrieveSingle().
     * @param params See retrieveSingle().
     * @param onNotFound See retrieveSingle().
     */
    _retrieveSingle(where, params, onNotFound) {
      return this
        ._retrieve(where, params)
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
     * Private implementation details for retrieveByID.
     * @param id See retrieveByID().
     */
    _retrieveByID(id) {
      const pkName     = this.table.getPrimaryKey()[0].getName();
      const fqcn       = `${this.table.getAlias()}.${pkName}`;
      const where      = {$eq: {[fqcn]: `:${pkName}`}};
      const params     = {[pkName]: id};
      const onNotFound = () => new NotFoundError(`Invalid ${pkName}.`);

      return this._retrieveSingle(where, params, onNotFound);
    }

    /**
     * Private implementation details for isUnique.
     * @param where See isUnique().
     * @param params See isUnique(). 
     * @param onDupe See isUnique(). 
     */
    _isUnique(where, params, onDupe) {
      return this
        ._retrieve(where, params)
        .then(dupe => {
          if (dupe.length === 0)
            return deferred.resolve(true);

          // This is the id of the duplicate record.
          const pkName = this.table.getPrimaryKey()[0].getName();
          const id     = dupe[0][pkName];
          const err    = new DuplicateError('Duplicate resource.', null, id);

          if (onDupe)
            return deferred.reject(onDupe(err));
          return deferred.reject(err);
        });
    }

    /**
     * Private implementation details for createIf.
     * @param resource See createIf().
     * @param condition See createIf().
     */
    _createIf(resource, condition) {
      const tblAlias = this.table.getAlias();

      return new InsertValidator(resource, tblAlias, this.dc.getDatabase())
        .validate()
        .then(() => condition(resource))
        .then(() => this.dc.insert({[tblAlias]: resource}).execute())
        .then(() => resource);
    }

    /**
     * Private implementation details for create().
     * @param resource See create().
     */
    _create(resource) {
      // Same as createIf with a no-op condition.
      return this._createIf(resource, () => deferred.resolve());
    }

    /**
     * Private implementation details for updateIf.
     * @param resource See updateIf().
     * @param condition See updateIf().
     */
    _updateIf(resource, condition) {
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
     * Private implementation details for update().
     * @param resource See update().
     */
    _update(resource) {
      // Same as updateIf with a no-op condition.
      return this._updateIf(resource, () => deferred.resolve());
    }

    /**
     * Private implementation details for delete().
     * @param resource See delete().
     */
    _delete(resource) {
      const tblAlias = this.table.getAlias();

      return new DeleteValidator(resource, tblAlias, this.dc.getDatabase())
        .validate()
        .then(() => this.dc.delete({[tblAlias]: resource}).execute())
        .then(function(delRes) {
          return delRes.affectedRows === 1 ? resource : deferred.reject(
            new NotFoundError('Resource not found.'));
        });
    }

    /**
     * Private implementation details for replace().
     * @param parentTableName See replace().
     * @param parentID See replace().
     * @param resources See replace().
     */
    _replace(parentTableName, parentID, resources) {
      const pTbl      = this.dc.getDatabase().getTableByName(parentTableName);
      const pTblAlias = pTbl.getAlias();
      const pPKName   = pTbl.getPrimaryKey()[0].getName();
      const pPKAlias  = pTbl.getPrimaryKey()[0].getAlias();
      const parent    = {[pPKName]: parentID};

      const tblAlias  = this.table.getAlias();
      const pkAlias   = this.table.getPrimaryKey()[0].getAlias();
      const fkName    = this.table.getColumnByName(pPKName).getName();
      const fkAlias   = this.table.getColumnByName(pPKName).getAlias();
      const fqFKName  = `${this.table.getAlias()}.${fkName}`;

      // 1) Validate the parentID.
      // 2) Set/overwrite the parentID on each resource, and remove any resouce
      //    identifiers.
      // 3) Validate each resource.
      // 4) Delete the old resources.
      // 5) Insert the new resources.
      return new DeleteValidator(parent, pTblAlias, this.dc.getDatabase())
        .validate()
        .then(() => {
          resources.forEach(r => {
            r[fkAlias] = parentID;
            delete r[pkAlias];
          });

          return deferred.map(resources, resource => 
            new InsertValidator(resource, tblAlias, this.dc.getDatabase()).validate());
        })
        .then(() => {
          return this.dc
            .from(this.table.getName())
            .where({'$eq': {[fqFKName]: `:${pPKAlias}`}}, parent)
            .delete()
            .execute();
        })
        .then(() => {
          return this.dc
            .insert({[tblAlias]: resources})
            .execute();
        })
        .then(resources => resources[tblAlias]);
    }

    // <<public>>

    /**
     * Retrieve an array of resources.
     * @memberOf GenericDao
     * @param where An optional where condition.
     * @param params Query parameters for the where condition.
     * @returns A promise that is resolved with the results as an array.
     */
    retrieve(where, params) {
      return this._retrieve(where, params);
    }

    /**
     * Retrieve a single resource as an object.
     * @memberOf GenericDao
     * @param where An optional where condition.
     * @param params Query parameters for the where condition.
     * @param onNotFound An optional function that produces an error when
     *        a resource is not found.
     * @returns A promise that is resolved with the first matching resource.
     *          If there are no matches found, then the promise is rejected
     *          with a NotFoundError instance.
     */
    retrieveSingle(where, params, onNotFound) {
      return this._retrieveSingle(where, params, onNotFound);
    }

    /**
     * Retrieve a single resource by ID.  Specialized version of retrieveSingle.
     * @memberOf GenericDao
     * @param id The unique identifier of the resource.
     */
    retrieveByID(id) {
      return this._retrieveByID(id);
    }

    /**
     * Helper function to check that something is unique.  This is useful
     * before creating or updating a record.
     * @memberOf GenericDao
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
      return this._isUnique(where, params, onDupe);
    }

    /**
     * Create a resource if a condition resolves successfully.  Note
     * that prior to invoking the condition the resource is validated
     * using an InsertValidator.
     * @memberOf GenericDao
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
      return this._createIf(resource, condition);
    }

    /**
     * Generic create method that validates a model using an InsertValidator
     * and then inserts the model.
     * @memberOf GenericDao
     * @param resource A model to create.
     */
    create(resource) {
      return this._create(resource);
    }

    /**
     * Update a resource if a condition resolves successfully.  Note
     * that prior to invoking the condition the resource is validated
     * using an UpdateValidator.
     * @memberOf GenericDao
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
      return this._updateIf(resource, condition);
    }

    /**
     * Generic update method that validates a model using an UpdateValidator
     * and then updates it by ID.
     * @memberOf GenericDao
     * @param resource A model to update by ID.
     */
    update(resource) {
      return this._update(resource);
    }

    /**
     * Generic delete method that validates a model using a DeleteValidator
     * and then deletes it by ID.
     * @memberOf GenericDao
     * @param resource A model to delete by ID.
     */
    delete(resource) {
      return this._delete(resource);
    }

    /**
     * Replace (remove and recreate) all the resources associated with a parent
     * table.
     * @memberOf GenericDao
     * @param {string} parentTableName The name of the parent table.
     * @param {any} parentID The identifier of the parent resource.
     * @param {resources} An array of resources, which will be created.
     */
    replace(parentTableName, parentID, resources) {
      return this._replace(parentTableName, parentID, resources);
    }
  }

  return GenericDao;
}

