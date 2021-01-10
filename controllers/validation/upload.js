'use strict';

const { yup, formatYupErrors } = require('strapi-utils');

const fileInfoSchema = yup.object({
  name: yup.string().nullable(),
  alternativeText: yup.string().nullable(),
  caption: yup.string().nullable(),
  filename: yup.string().nullable(false),
  type: yup.string().nullable(false),
  size: yup.number().nullable(false),
  hash: yup.string().nullable(false),
  Bucket: yup.string().nullable(false),
  Key: yup.string().nullable(false),
});

const uploadSchema = yup.object({
  fileInfo: fileInfoSchema,
});

const multiUploadSchema = yup.object({
  fileInfo: yup.array().of(fileInfoSchema),
});

const validateUploadBody = (data = {}, isMulti = false) => {
  const schema = isMulti ? multiUploadSchema : uploadSchema;

  return schema.validate(data, { abortEarly: false }).catch(err => {
    throw strapi.errors.badRequest('ValidationError', { errors: formatYupErrors(err) });
  });
};

module.exports = validateUploadBody;
