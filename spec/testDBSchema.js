'use strict';

require('insulin').factory('ndm_testDBSchema', ['ndm_booleanConverter'],
  ndm_testDBSchemaProducer);

function ndm_testDBSchemaProducer(booleanConverter) {
  return {
    name: 'testDB',
    tables: [
      {
        name: 'users',
        columns: [
          {
            name: 'userID',
            mapTo: 'ID',
            isPrimary: true,
            dataType: 'int',
            isNullable: false
          },
          {
            name: 'firstName',
            mapTo: 'first',
            dataType: 'varchar',
            isNullable: false
          },
          {
            name: 'lastName',
            mapTo: 'last',
            dataType: 'varchar',
            isNullable: false
          }
        ]
      },
      {
        name: 'phone_numbers',
        mapTo: 'phoneNumbers',
        columns: [
          {
            name: 'phoneNumberID',
            mapTo: 'ID',
            isPrimary: true,
            dataType: 'int',
            isNullable: false
          },
          {
            name: 'userID',
            mapTo: 'uID',
            dataType: 'int',
            isNullable: false
          },
          {
            name: 'phoneNumber',
            dataType: 'varchar',
            isNullable: false
          },
          {
            name: 'type',
            dataType: 'varchar',
            isNullable: true
          }
        ],
        foreignKeys: [
          {
            column: 'userID',
            name:   'fk_userID_users_userID',
            references: {
              table: 'users',
              column: 'userID'
            }
          }
        ]
      },
      {
        name: 'products',
        columns: [
          {
            name: 'productID',
            isPrimary: true
          },
          {
            name: 'description'
          },
          {
            name: 'isActive',
            converter: booleanConverter
          },
          {
            name: 'primaryPhotoID'
          }
        ],
        foreignKeys: [
          {
            column: 'primaryPhotoID',
            name: 'fk_primaryPhotoID_photos_photoID',
            references: {
              table: 'photos',
              column: 'photoID'
            }
          }
        ]
      },
      {
        name: 'photos',
        columns: [
          {
            name: 'photoID',
            isPrimary: true
          },
          {
            name: 'photoURL'
          },
          {
            name: 'largeThumbnailID'
          },
          {
            name: 'smallThumbnailID'
          },
          {
            name: 'prodID' // Note the name.  Circular reference.
          }
        ],
        foreignKeys: [
          {
            column: 'largeThumbnailID',
            name: 'fk_largeThumbnailID_photos_photoID',
            references: {
              table: 'photos',
              column: 'photoID'
            }
          },
          {
            column: 'smallThumbnailID',
            name: 'fk_smallThumbnailID_photos_photoID',
            references: {
              table: 'photos',
              column: 'photoID'
            }
          },
          {
            column: 'prodID',
            name: 'fk_prodID_products_productID',
            references: {
              table: 'products',
              column: 'productID'
            }
          }
        ]
      }
    ]
  };
}

