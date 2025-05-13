const mongoose = require('mongoose');

const designationCategoryMapSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: [true, "this designation already exist"] }
  });
  module.exports = mongoose.model('Designations', designationCategoryMapSchema);
  