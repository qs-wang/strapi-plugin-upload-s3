'use strict';

/**
 * Upload.js controller
 *
 */

const _ = require('lodash');
const { sanitizeEntity } = require('strapi-utils');
const apiUploadController = require('./upload/api');
const adminUploadController = require('./upload/admin');

const resolveController = ctx => {
  const {
    state: { isAuthenticatedAdmin },
  } = ctx;

  return isAuthenticatedAdmin ? adminUploadController : apiUploadController;
};

const resolveControllerMethod = method => ctx => {
  const controller = resolveController(ctx);
  const callbackFn = controller[method];

  if (!_.isFunction(callbackFn)) {
    return ctx.notFound();
  }

  return callbackFn(ctx);
};

//Q.s. add aws-sdk dependency
const AWS = require('aws-sdk');

const isImage = require('is-image');

const createS3 = () => new AWS.S3({
  signatureVersion: 'v4',
  region: 'ap-southeast-2',
});

module.exports = {
  find: resolveControllerMethod('find'),
  findOne: resolveControllerMethod('findOne'),
  count: resolveControllerMethod('count'),
  destroy: resolveControllerMethod('destroy'),
  updateSettings: resolveControllerMethod('updateSettings'),
  getSettings: resolveControllerMethod('getSettings'),

  //Q.S.
  // sample url for getting upload signed ulr
  // const url = `${API_SERVER_ROOT}/files/uploadURL/uploadURL?name=${fileName}&type=${fileType}`
  async uploadURL(ctx, _, S3 = createS3) {
    const { name, type } = ctx.query

    if (!name || !type) {
      throw strapi.errors.badRequest(null, {
        errors: [{ id: 'Upload.parameters.empty', message: 'name, or(and) type parameters are empty' }],
      });
    }


    const Bucket = strapi.plugins.upload.config.AWS_BUCKET
    const Key =
      `${isImage(name) ? strapi.plugins.upload.config.AWS_BUCKET_IMAGES_KEY :
        strapi.plugins.upload.config.AWS_BUCKET_FILES_KEY}/${decodeURIComponent(name)}`

    const params = {
      Bucket,
      Key,
      ACL: isImage(name) ? 'public-read' : null,
      ContentType: type
    }

    const url = await S3().getSignedUrlPromise('putObject', params);
    ctx.body = { url, Bucket, Key };
  },

  async upload(ctx) {
    const isUploadDisabled = _.get(strapi.plugins, 'upload.config.enabled', true) === false;

    if (isUploadDisabled) {
      throw strapi.errors.badRequest(null, {
        errors: [{ id: 'Upload.status.disabled', message: 'File upload is disabled' }],
      });
    }

    const {
      query: { id },
      request: { body: { fileInfo = {} } },
    } = ctx;

    const controller = resolveController(ctx);

    if (id) {
      return controller.updateFileInfo(ctx);
    }

    if (_.isEmpty(fileInfo) || fileInfo.size === 0) {
      throw strapi.errors.badRequest(null, {
        errors: [{ id: 'Upload.status.empty', message: 'FileInfos are empty' }],
      });
    }

    await (id ? controller.replaceFile : controller.uploadFiles)(ctx);
  },

  async search(ctx) {
    const { id } = ctx.params;
    const model = strapi.getModel('file', 'upload');
    const entries = await strapi.query('file', 'upload').custom(searchQueries)({
      id,
    });

    ctx.body = sanitizeEntity(entries, { model });
  },
};

const searchQueries = {
  bookshelf({ model }) {
    return ({ id }) => {
      return model
        .query(qb => {
          qb.whereRaw('LOWER(hash) LIKE ?', [`%${id}%`]).orWhereRaw('LOWER(name) LIKE ?', [
            `%${id}%`,
          ]);
        })
        .fetchAll()
        .then(results => results.toJSON());
    };
  },
  mongoose({ model }) {
    return ({ id }) => {
      const re = new RegExp(id, 'i');

      return model
        .find({
          $or: [{ hash: re }, { name: re }],
        })
        .lean();
    };
  },
};
