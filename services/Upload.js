'use strict';

/**
 * Upload.js service
 *
 * @description: A set of functions similar to controller's actions to avoid code duplication.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const util = require('util');
const _ = require('lodash');
const {
  nameToSlug,
  contentTypes: contentTypesUtils,
  sanitizeEntity,
  webhook: webhookUtils,
} = require('strapi-utils');

const { MEDIA_UPDATE, MEDIA_CREATE, MEDIA_DELETE } = webhookUtils.webhookEvents;

const { bytesToKbytes } = require('../utils/file');
const isImage = require('is-image');

const { UPDATED_BY_ATTRIBUTE, CREATED_BY_ATTRIBUTE } = contentTypesUtils.constants;

const randomSuffix = () => crypto.randomBytes(5).toString('hex');

const generateFileName = name => {
  const baseName = nameToSlug(name, { separator: '_', lowercase: false });

  return `${baseName}_${randomSuffix()}`;
};

const sendMediaMetrics = data => {
  if (_.has(data, 'caption') && !_.isEmpty(data.caption)) {
    strapi.telemetry.send('didSaveMediaWithCaption');
  }

  if (_.has(data, 'alternativeText') && !_.isEmpty(data.alternativeText)) {
    strapi.telemetry.send('didSaveMediaWithAlternativeText');
  }
};

const combineFilters = params => {
  // FIXME: until we support boolean operators for querying we need to make mime_ncontains use AND instead of OR
  if (_.has(params, 'mime_ncontains') && Array.isArray(params.mime_ncontains)) {
    params._where = params.mime_ncontains.map(val => ({ mime_ncontains: val }));
    delete params.mime_ncontains;
  }
};

module.exports = {
  formatFileInfo(fileInfo = {}, metas = {}) {
    const ext = path.extname(fileInfo.filename);
    // const basename = path.basename(fileInfo.name || fileInfo.filename, ext);

    const usedName = fileInfo.name || fileInfo.filename;

    const entity = {
      name: usedName,
      alternativeText: fileInfo.alternativeText,
      caption: fileInfo.caption,
      hash: fileInfo.hash,
      ext,
      mime: fileInfo.type,
      size: bytesToKbytes(fileInfo.size),
      Bucket: fileInfo.Bucket,
      Key: fileInfo.Key,
    };

    const { refId, ref, source, field } = metas;

    if (refId && ref && field) {
      entity.related = [
        {
          refId,
          ref,
          source,
          field,
        },
      ];
    }

    if (metas.path) {
      entity.path = metas.path;
    }

    return entity;
  },

  async enhanceFile(fileInfo = {}, metas = {}) {
    //  Q.s.
    // let readBuffer;
    // try {
    //   readBuffer = await util.promisify(fs.readFile)(file.path);
    // } catch (e) {
    //   if (e.code === 'ERR_FS_FILE_TOO_LARGE') {
    //     throw strapi.errors.entityTooLarge('FileTooBig', {
    //       errors: [
    //         {
    //           id: 'Upload.status.sizeLimit',
    //           message: `${file.name} file is bigger than the limit size!`,
    //           values: { file: file.name },
    //         },
    //       ],
    //     });
    //   }
    //   throw e;
    // }

    // const { optimize } = strapi.plugins.upload.services['image-manipulation'];

    // const { buffer, info } = await optimize(readBuffer);

    //Q.s. width, height
    const info = {};

    const formattedFile = this.formatFileInfo(
      fileInfo,
      metas
    );

    return _.assign(formattedFile, info
      // , {buffer,}
    );
  },

  async upload({ data }, { user } = {}) {
    const { fileInfo, ...metas } = data;

    // const fileArray = Array.isArray(files) ? files : [files];
    const fileInfoArray = Array.isArray(fileInfo) ? fileInfo : [fileInfo];


    const doUpload = async (fileInfo) => {
      //Q.s. keep it as enhanceFile for now. But is not doing any enhance tasks anymore
      const fileData = this.formatFileInfo(
        fileInfo,
        metas
      );

      return this.uploadFileAndPersist(fileData, { user });
    };

    return await Promise.all(
      fileInfoArray.map((fileInfo) => doUpload(fileInfo || {}))
    );
  },

  async uploadFileAndPersist(fileData, { user } = {}) {
    // const config = strapi.plugins.upload.config;

    // const {
    //   // getDimensions,
    //   // generateThumbnail,
    //   // generateResponsiveFormats,
    // } = strapi.plugins.upload.services['image-manipulation'];

    // await strapi.plugins.upload.provider.upload(fileData);

    // const thumbnailFile = await generateThumbnail(fileData);
    // if (thumbnailFile) {
    //   await strapi.plugins.upload.provider.upload(thumbnailFile);
    //   delete thumbnailFile.buffer;
    //   _.set(fileData, 'formats.thumbnail', thumbnailFile);
    // }

    // const formats = await generateResponsiveFormats(fileData);
    // if (Array.isArray(formats) && formats.length > 0) {
    //   for (const format of formats) {
    //     if (!format) continue;

    //     const { key, file } = format;

    //     await strapi.plugins.upload.provider.upload(file);
    //     delete file.buffer;

    //     _.set(fileData, ['formats', key], file);
    //   }
    // }

    // const { width, height } = await getDimensions(fileData.buffer);

    // delete fileData.buffer;

    // _.assign(fileData, {
    //   provider: config.provider,
    //   width,
    //   height,
    // });

    if (isImage(fileData.name)){
      if(strapi.plugins.upload.config.AWS_REGION){
        fileData.url = `https://${fileData.Bucket}.s3-${strapi.plugins.upload.config.AWS_REGION}.amazonaws.com/${fileData.Key}`;
      }else{
        fileData.url = `https://${fileData.Bucket}.s3.amazonaws.com/${fileData.Key}`;
      }
    }else{
      fileData.url = `S3://${fileData.Bucket}/${fileData.Key}`;
    }
    
    fileData.provider = 'S3';

    return this.add(fileData, { user });
  },

  async updateFileInfo(id, { name, alternativeText, caption }, { user } = {}) {
    const dbFile = await this.fetch({ id });

    if (!dbFile) {
      throw strapi.errors.notFound('file not found');
    }

    const newInfos = {
      name: _.isNil(name) ? dbFile.name : name,
      alternativeText: _.isNil(alternativeText) ? dbFile.alternativeText : alternativeText,
      caption: _.isNil(caption) ? dbFile.caption : caption,
    };

    return this.update({ id }, newInfos, { user });
  },

  //FIXME: reimplment this for replace function
  // do nuthing for now. Need fix the UI for replacing the file
  // at UI side at first.
  async replace(id, { data, file }, { user } = {}) {
    // const config = strapi.plugins.upload.config;

    // const {
    //   getDimensions,
    //   generateThumbnail,
    //   generateResponsiveFormats,
    // } = strapi.plugins.upload.services['image-manipulation'];

    // const dbFile = await this.fetch({ id });

    // if (!dbFile) {
    //   throw strapi.errors.notFound('file not found');
    // }

    // const { fileInfo } = data;
    // const fileData = await this.enhanceFile(file, fileInfo);

    // // keep a constant hash
    // _.assign(fileData, {
    //   hash: dbFile.hash,
    //   ext: dbFile.ext,
    // });

    // // execute delete function of the provider
    // // if (dbFile.provider === config.provider) {
    // //   await strapi.plugins.upload.provider.delete(dbFile);

    // //   if (dbFile.formats) {
    // //     await Promise.all(
    // //       Object.keys(dbFile.formats).map(key => {
    // //         return strapi.plugins.upload.provider.delete(dbFile.formats[key]);
    // //       })
    // //     );
    // //   }
    // // }

    // // await strapi.plugins.upload.provider.upload(fileData);

    // // clear old formats
    // _.set(fileData, 'formats', {});

    // // const thumbnailFile = await generateThumbnail(fileData);
    // // if (thumbnailFile) {
    // //   await strapi.plugins.upload.provider.upload(thumbnailFile);
    // //   delete thumbnailFile.buffer;
    // //   _.set(fileData, 'formats.thumbnail', thumbnailFile);
    // // }

    // const formats = await generateResponsiveFormats(fileData);
    // if (Array.isArray(formats) && formats.length > 0) {
    //   for (const format of formats) {
    //     if (!format) continue;

    //     const { key, file } = format;

    //     // await strapi.plugins.upload.provider.upload(file);
    //     // delete file.buffer;

    //     _.set(fileData, ['formats', key], file);
    //   }
    // }

    // const { width, height } = await getDimensions(fileData.buffer);
    // delete fileData.buffer;

    // _.assign(fileData, {
    //   provider: config.provider,
    //   width,
    //   height,
    // });

    // return this.update({ id }, fileData, { user });
  },

  async update(params, values, { user } = {}) {
    const fileValues = { ...values };
    if (user) {
      fileValues[UPDATED_BY_ATTRIBUTE] = user.id;
    }
    sendMediaMetrics(fileValues);

    const res = await strapi.query('file', 'upload').update(params, fileValues);
    const modelDef = strapi.getModel('file', 'upload');
    strapi.eventHub.emit(MEDIA_UPDATE, { media: sanitizeEntity(res, { model: modelDef }) });
    return res;
  },

  async add(values, { user } = {}) {
    const fileValues = { ...values };
    if (user) {
      fileValues[UPDATED_BY_ATTRIBUTE] = user.id;
      fileValues[CREATED_BY_ATTRIBUTE] = user.id;
    }
    sendMediaMetrics(fileValues);

    const res = await strapi.query('file', 'upload').create(fileValues);
    const modelDef = strapi.getModel('file', 'upload');
    strapi.eventHub.emit(MEDIA_CREATE, { media: sanitizeEntity(res, { model: modelDef }) });
    return res;
  },

  fetch(params) {
    return strapi.query('file', 'upload').findOne(params);
  },

  fetchAll(params) {
    combineFilters(params);
    return strapi.query('file', 'upload').find(params);
  },

  search(params) {
    return strapi.query('file', 'upload').search(params);
  },

  countSearch(params) {
    return strapi.query('file', 'upload').countSearch(params);
  },

  count(params) {
    combineFilters(params);
    return strapi.query('file', 'upload').count(params);
  },

  async remove(file) {
    const config = strapi.plugins.upload.config;

    // execute delete function of the provider
    //FIXME: how to delete from s3?
    // if (file.provider === config.provider) {
    //   await strapi.plugins.upload.provider.delete(file);

    //   if (file.formats) {
    //     await Promise.all(
    //       Object.keys(file.formats).map(key => {
    //         return strapi.plugins.upload.provider.delete(file.formats[key]);
    //       })
    //     );
    //   }
    // }

    const media = await strapi.query('file', 'upload').findOne({
      id: file.id,
    });

    const modelDef = strapi.getModel('file', 'upload');
    strapi.eventHub.emit(MEDIA_DELETE, { media: sanitizeEntity(media, { model: modelDef }) });

    return strapi.query('file', 'upload').delete({ id: file.id });
  },

  async uploadToEntity(params, files, source) {
    const { id, model, field } = params;

    const arr = Array.isArray(files) ? files : [files];
    const enhancedFiles = await Promise.all(
      arr.map(file => {
        return this.enhanceFile(
          file,
          {},
          {
            refId: id,
            ref: model,
            source,
            field,
          }
        );
      })
    );

    await Promise.all(enhancedFiles.map(file => this.uploadFileAndPersist(file)));
  },

  getSettings() {
    return strapi
      .store({
        type: 'plugin',
        name: 'upload',
        key: 'settings',
      })
      .get();
  },

  setSettings(value) {
    if (value.responsiveDimensions === true) {
      strapi.telemetry.send('didEnableResponsiveDimensions');
    } else {
      strapi.telemetry.send('didDisableResponsiveDimensions');
    }

    return strapi
      .store({
        type: 'plugin',
        name: 'upload',
        key: 'settings',
      })
      .set({ value });
  },
};
