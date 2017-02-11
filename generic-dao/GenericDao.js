'use strict';

require('insulin').factory('ndm_GenericDao', GenericDaoProducer);

function GenericDaoProducer(deferred, NotFoundError, DuplicateError, InsertValidator,
  UpdateValidator, DeleteValidator, ndm_Column, ndm_assert) {
  /**
   * Generic data-access object for simple CRUD operations.
   */
  class GenericDao {
    /**
     * Initialize the DAO.  Note that the db is expected to be connected
     * before any of this class's methods are used.
     * @param {DataContext} dataContext - A DataContext instance that is used
     * to run queries.
     * @param {string} tableName - The name of the table that this DAO operates on.
     */
    constructor(dataContext, tableName) {
      this.dc    = dataContext;
      this.table = this.dc.database.getTableByName(tableName);
    }

    // <<private>>

    /**
     * Private implementation details for retrieve.
     * @private
     * @see retrieve
     */
    _retrieve(where, params={}) {
      const tblMapping = this.table.mapTo;
      const query      = this.dc.from(this.table.name);

      if (where)
        query.where(where, params);

      return query
        .select()
        .execute()
        .then(res => res[tblMapping]);
    }

    /**
     * Private implementation details for retrieveSingle.
     * @private
     * @see retrieveSingle
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
     * @private
     * @see retrieveByID
     */
    _retrieveByID(id) {
      const pkName     = this.table.primaryKey[0].name;
      const fqcn       = `${this.table.mapTo}.${pkName}`;
      const where      = {$eq: {[fqcn]: `:${pkName}`}};
      const params     = {[pkName]: id};
      const onNotFound = () => new NotFoundError(`Invalid ${pkName}.`);

      return this._retrieveSingle(where, params, onNotFound);
    }

    /**
     * Private implementation details for isUnique.
     * @private
     * @see isUnique
     */
    _isUnique(where, params, onDupe) {
      return this
        ._retrieve(where, params)
        .then(dupe => {
          if (dupe.length === 0)
            return deferred.resolve(true);

          // This is the id of the duplicate record.
          const pkMapping = this.table.primaryKey[0].mapTo;
          const id        = dupe[0][pkMapping];
          const err       = new DuplicateError('Duplicate resource.', null, id);

          if (onDupe)
            return deferred.reject(onDupe(err));
          return deferred.reject(err);
        });
    }

    /**
     * Private implementation details for createIf.
     * @private
     * @see createIf
     */
    _createIf(resource, condition) {
      const tblMapping = this.table.mapTo;

      return new InsertValidator(resource, tblMapping, this.dc.database)
        .validate()
        .then(() => condition(resource))
        .then(() => this.dc.insert({[tblMapping]: resource}).execute())
        .then(() => resource);
    }

    /**
     * Private implementation details for create().
     * @private
     * @param resource See create().
     */
    _create(resource) {
      // Same as createIf with a no-op condition.
      return this._createIf(resource, () => deferred.resolve());
    }

    /**
     * Private implementation details for updateIf.
     * @private
     * @see updateIf
     */
    _updateIf(resource, condition) {
      const tblMapping = this.table.mapTo;

      return new UpdateValidator(resource, tblMapping, this.dc.database)
        .validate()
        .then(() => condition(resource))
        .then(() => this.dc.update({[tblMapping]: resource}).execute())
        .then(function(updRes) {
          return updRes.affectedRows === 1 ? resource : deferred.reject(
            new NotFoundError('Resource not found.'));
        });
    }

    /**
     * Private implementation details for update().
     * @private
     * @param resource See update().
     */
    _update(resource) {
      // Same as updateIf with a no-op condition.
      return this._updateIf(resource, () => deferred.resolve());
    }

    /**
     * Private implementation details for delete().
     * @private
     * @see delete
     */
    _delete(resource) {
      const tblMapping = this.table.mapTo;

      return new DeleteValidator(resource, tblMapping, this.dc.database)
        .validate()
        .then(() => this.dc.delete({[tblMapping]: resource}).execute())
        .then(function(delRes) {
          return delRes.affectedRows === 1 ? resource : deferred.reject(
            new NotFoundError('Resource not found.'));
        });
    }

    /**
     * Private implementation details for replace().
     * @private
     * @see replace
     */
    _replace(pTblName, pID, resources) {
      const pTbl        = this.dc.database.getTableByName(pTblName);
      const pTblMapping = pTbl.mapTo;
      const pPKMapping  = pTbl.primaryKey[0].mapTo;
      const parent      = {[pPKMapping]: pID};

      const tblName     = this.table.name;
      const tblMapping  = this.table.mapTo;
      const pkMapping   = this.table.primaryKey[0].mapTo;

      const fks         = this.dc.database.relStore.getRelationships(tblName, pTblName, true);

      let fkName, fkMapping, fqFKName;

      ndm_assert(fks.length === 1,
        'Replace can only be performed if there is exactly one relationship ' +
        'between the parent and child tables.');

      fkName    = fks[0].column;
      fkMapping = this.table.getColumnByName(fkName).mapTo;
      fqFKName  = ndm_Column.createFQColName(tblName, fkName);

      // 1) Validate the parentID.
      // 2) Set/overwrite the parentID on each resource, and remove any resouce
      //    identifiers.
      // 3) Validate each resource.
      // 4) Delete the old resources.
      // 5) Insert the new resources.
      return new DeleteValidator(parent, pTblMapping, this.dc.database)
        .validate()
        .then(() => {
          resources.forEach(r => {
            r[fkMapping] = pID;
            delete r[pkMapping];
          });

          return deferred.map(resources, resource => 
            new InsertValidator(resource, tblMapping, this.dc.database).validate());
        })
        .then(() => {
          return this.dc
            .from(this.table.name)
            .where({'$eq': {[fqFKName]: `:${pPKMapping}`}}, parent)
            .delete()
            .execute();
        })
        .then(() => {
          return this.dc
            .insert({[tblMapping]: resources})
            .execute();
        })
        .then(resources => resources[tblMapping]);
    }

    // <<public>>

    /**
     * @callback GenericDao~errorCallback
     * @param {Error} err - An Error instance.
     * @returns {Error} A promise that produces a customized Error
     * instance.
     */

    /**
     * @callback GenericDao~conditionCallback
     * @param {Object} resource - The resource object.
     * @returns {Promise<bool>} A promise that is resolved if the condition is
     * met, or otherwise rejected.
     */

    /**
     * Retrieve an array of resources.
     * @param {Object} where - An optional where condition.
     * @param {Object} params - Query parameters for the where condition.
     * @returns {Promise<Object[]>} A promise that is resolved with the results
     * as an array.
     */
    retrieve(where, params) {
      return this._retrieve(where, params);
    }

    /**
     * Retrieve a single resource as an object.
     * @param {Object} where - An optional where condition.
     * @param {Object} params - Query parameters for the where condition.
     * @param {GenericDao~errorCallback} onNotFound - An optional function that
     * produces an Error when a resource is not found.
     * @returns {Promise<Object>} A promise that is resolved with the first
     * matching resource.  If there are no matches found, then the promise is
     * rejected with a NotFoundError instance.
     */
    retrieveSingle(where, params, onNotFound) {
      return this._retrieveSingle(where, params, onNotFound);
    }

    /**
     * Retrieve a single resource by ID.  Specialized version of retrieveSingle.
     * @param {any} id - The unique identifier of the resource.
     */
    retrieveByID(id) {
      return this._retrieveByID(id);
    }

    /**
     * Helper function to check that something is unique.  This is useful
     * before creating or updating a record.
     * @param {Object} where - An optional where condition.
     * @param {Object} params - Query parameters for the where condition.
     * @param {GenericDao~errorCallback} onDupe - An option function that is
     * called when a duplicate is found.  If the resource is not found and this
     * function is defined, the resource is rejected with the result of this
     * function.
     * @returns {Promise<bool>} A promise that is resolved if the resource is
     * unique (that is, if no records are found).  If the resource is not
     * unique then the promise is rejected with a DuplicateError instance.
     */
    isUnique(where, params, onDupe) {
      return this._isUnique(where, params, onDupe);
    }

    /**
     * Create a resource if a condition resolves successfully.  Note
     * that prior to invoking the condition the resource is validated
     * using an InsertValidator.
     * @param {Object} resource - A model to create.
     * @param {GenericDao~conditionCallback} condition - A function that
     * returns a promise.  If the promise is resolved then the model is
     * created.  resource is passed to condition.
     * @returns {Promise<Object>} A promise that is:
     * 1) Resolved with the model if the model is valid and the
     *    condition is resolved.  The model will be updated with
     *    the new ID if possible.
     * 2) Rejected with a ValidationErrorList if the model is invalid.
     * 3) Rejected with condition's promise if condition is rejected.
     */
    createIf(resource, condition) {
      return this._createIf(resource, condition);
    }

    /**
     * Generic create method that validates a model using an InsertValidator
     * and then inserts the model.
     * @param {Object} resource - A model to create.
     * @returns {Promise<Object>} Same as {@link createIf}.
     */
    create(resource) {
      return this._create(resource);
    }

    /**
     * Update a resource if a condition resolves successfully.  Note
     * that prior to invoking the condition the resource is validated
     * using an UpdateValidator.
     * @param {Object} resource - A model to update by ID.
     * @param {GenericDao~conditionCallback} condition - A function that
     * returns a promise.  If the promise is resolved then the model is
     * created.  resource is passed to condition.
     * @returns {Promise<Object>} A promise that is:
     * 1) Resolved with the model if the model is valid and the
     *    condition is resolved.
     * 2) Rejected with a ValidationErrorList if the model is invalid.
     * 3) Rejected with condition's promise if condition is rejected.
     */
    updateIf(resource, condition) {
      return this._updateIf(resource, condition);
    }

    /**
     * Generic update method that validates a model using an UpdateValidator
     * and then updates it by ID.
     * @param {Object} resource - A model to update by ID.
     * @returns {Promise<Object>} Same as {@link updateIf}.
     */
    update(resource) {
      return this._update(resource);
    }

    /**
     * Generic delete method that validates a model using a DeleteValidator
     * and then deletes it by ID.
     * @param {Object} resource - A model to delete by ID.
     * @returns {Promise<Object>} A promise that is:
     * 1) Resolved with the model if the model is valid and deleted.
     * 2) Rejected with a ValidationErrorList if the model is invalid.
     * 3) Rejected with a NotFoundError instance if no records are affected
     *    by the delete attempt.
     */
    delete(resource) {
      return this._delete(resource);
    }

    /**
     * Replace (remove and recreate) all the resources associated with a parent
     * table.
     * @param {string} parentTableName - The name of the parent table.
     * @param {any} parentID - The identifier of the parent resource.
     * @param {Object[]} resources - An array of resources which will be
     * created.
     * @returns {Promise<Object[]>} The array of resources, each updated with
     * their new identifier and parentID.  The parent and the resources are
     * validated, so the returned promise shall be rejected if a validation
     * error occurs.
     */
    replace(parentTableName, parentID, resources) {
      return this._replace(parentTableName, parentID, resources);
    }
  }

  return GenericDao;
}

