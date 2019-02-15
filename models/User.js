const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    unique: true,
  },
  discordId: String,
  max_weight: {
    type: Number,
    default: 10000,
  },
  max_vests: Number,
  vests: Number,
  voting_mana: {
    type: Number,
    default: 10000,
  },
  mana_limit: {
    type: Number,
    default: 8500,
  },
  vote_value: {
    type: Number,
    default: 0,
  },
  authorized: {
    type: Boolean,
    default: false,
  },
  paused: {
    type: Boolean,
    default: false,
  },
  comment: {
    type: Boolean,
    default: true,
  },
  banned: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

UserSchema.statics = {
  async updateSteemData(name, data) {
    return this.updateOne({ name }, { $set: data });
  },
};

const User = mongoose.model('user', UserSchema);

module.exports = User;
