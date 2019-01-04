const dotenv = require('dotenv');

dotenv.config();

module.exports = {
  MONGODB: process.env.MONGODB,
  TRAIL_ACCOUNT: process.env.TRAIL_ACCOUNT,
  TRAIL_WIF: process.env.TRAIL_WIF,
  BOT_TOKEN: process.env.BOT_TOKEN,
  PREFIX: '?',
  ADMIN_ROLES: ['FlagTrail Admin'],
  CATEGORIES: [
    'bid bot abuse',
    'collusive voting',
    'comment self-vote violation',
    'comment spam',
    'copy/paste',
    'failure to tag nsfw',
    'identity theft',
    'manipulation',
    'phishing',
    'plagiarism',
    'scam',
    'spam',
    'tag abuse',
    'tag misuse',
    'testing for rewards',
    'threat',
    'vote abuse',
    'vote farming',
  ],
};
