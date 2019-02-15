const Discord = require('discord.js');
const mongoose = require('mongoose');
const { Client } = require('dsteem');
const { stripIndents } = require('common-tags');
const config = require('./config');
const User = require('./models/User');
const {
  convertSPToVests,
  findSFRComment,
  getContent,
  getSbdPerRshares,
  getVoters,
  isURL,
  processVotes,
  updateSteemVariables,
  updateVPMana,
} = require('./modules');

const client = new Client('https://api.steemit.com');


// MongoDB connection
mongoose.Promise = global.Promise;
mongoose.connect(config.MONGODB, {
  useNewUrlParser: true,
  useCreateIndex: true,
  useFindAndModify: false,
});

(async () => {
  await updateSteemVariables(client);
  await updateVPMana(client);

  const bot = new Discord.Client();

  bot.on('ready', () => console.log('Discord bot has started'));

  bot.on('error', error => console.log(error.message));

  bot.on('message', async (message) => {
    if (message.author.bot || !message.content.startsWith(config.PREFIX)) {
      return;
    }

    const afterPrefix = message.content.split(config.PREFIX).pop();
    const splitMessage = afterPrefix.split(' ');
    const command = splitMessage[0];

    switch (command) {
      // Register Command
      case 'register': {
        let [username, weight, limit, maxSp] = splitMessage.slice(1);

        weight = parseInt(weight, 10);
        limit = parseInt(limit, 10);
        maxSp = parseInt(maxSp, 10);

        if (!username) {
          message.reply('**ERROR:** Username is required.');
        } else if (!Number.isInteger(weight) || weight <= 0 || weight > 100) {
          message.reply('**ERROR:** Vote weight should be a number greater than zero and lower than or equal to 100.');
        } else if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
          message.reply('**ERROR:** Voting mana limit should be a number greater than zero and lower than or equal to 100.');
        } else if (!Number.isInteger(maxSp) || maxSp <= 0) {
          message.reply('**ERROR:** Abuser SP limit should be a number greater than zero.');
        } else {
          username = username.toLowerCase();

          const ifExists = await User.findOne({ name: username });

          if (ifExists) {
            message.reply(`**ERROR:** Username \`${username}\` already registered.`);
          } else {
            const maxVests = convertSPToVests(maxSp);

            await User.create({
              name: username,
              max_weight: (weight * 100),
              mana_limit: (limit * 100),
              max_vests: maxVests.amount,
              discordId: message.author.id,
            })
              .then(() => {
                message.reply(`Your registration has been successful. Please authorize us to use your posting authority if you have not done yet.\nhttps://steemconnect.com/authorize/@${config.TRAIL_ACCOUNT}`);
              })
              .catch(() => {
                message.reply('**ERROR:** Sorry, there was an error. Please try again later.');
              });
          }
        }

        break;
      }

      // Delete Command
      case 'delete': {
        let [username] = splitMessage.slice(1);

        if (!username) {
          message.reply('**ERROR:** Username is required.');
        } else {
          username = username.toLowerCase();

          const user = await User.findOne({ name: username });

          if (user) {
            // Allowing admin and registered user to remove his account
            if (message.member.roles.some(r => config.ADMIN_ROLES.includes(r.name))
              || user.discordId === message.author.id) {
              User.deleteOne({ name: username })
                .then(() => {
                  message.reply(`User \`@${username}\` has been deleted. Please unauthorize us using SteemConnect https://steemconnect.com/revoke/@${config.TRAIL_ACCOUNT}.`);
                })
                .catch(() => {
                  message.reply(`**ERROR:** We cannot delete user \`@${username}\`.`);
                });
            }
          } else {
            message.reply('**ERROR:** Username not found.');
          }
        }

        break;
      }

      // Downvote Command
      case 'downvote': {
        const [url] = splitMessage.slice(1);

        if (!isURL(url)) {
          message.reply('**ERROR:** URL is not valid.');
        } else {
          // Checking if the message author has the privilege
          if (!message.member.roles.some(r => config.ADMIN_ROLES.includes(r.name))) {
            return;
          }

          message.reply(`**Confirmation**: Are you sure you want to downvote <${url}> with the trail? Type **\`Yes\`** to proceed.`);

          const filter = m => (m.author.id === message.author.id && m.cleanContent.toLowerCase() === 'yes');

          message.channel.awaitMessages(filter, { maxMatches: 1, time: 30000, errors: ['time'] })
            .then(async () => {
              const {
                author, permlink, rshares, vests, category,
              } = await getContent(client, url);

              if (rshares > 0) {
                const [sfrComment] = await findSFRComment(client, author, permlink, category);

                if (sfrComment && sfrComment.category !== undefined) {
                  // Getting voters list and their combined rshares
                  const {
                    voters, total,
                  } = await getVoters(client, rshares, author, permlink, vests);

                  if (voters.length > 0) {
                    await processVotes(client, author, permlink, voters, 'downvote', sfrComment)
                      .then(async (e) => {
                        await message.channel.send(e);
                        // Sending stat message
                        message.channel.send(`Total rewards removed: ${parseFloat(total * getSbdPerRshares()).toFixed(3)}`);
                      })
                      .catch((e) => {
                        message.channel.send(e);
                      });
                  } else {
                    message.reply('**ALERT:** No downvoters available at this moment for this content.');
                  }
                } else if (sfrComment && sfrComment.category === undefined) {
                  message.reply('**ERROR:** SteemFlagRewards approval category is not present in the comment.');
                } else {
                  message.reply('**ERROR:** Cannot downvote. SteemFlagRewards approval comment is not present in the content.');
                }
              } else {
                message.reply('**ERROR:** Cannot downvote it, the content already has negative rshares.');
              }
            })
            .catch(() => {
              message.reply('**TIMEOUT**: You have not responded!');
            });
        }

        break;
      }

      // Upvote Command
      case 'upvote': {
        const [url] = splitMessage.slice(1);

        if (!isURL(url)) {
          message.reply('URL is not valid.');
        } else {
          // Checking if the message author has the privilege
          if (!message.member.roles.some(r => config.ADMIN_ROLES.includes(r.name))) {
            return;
          }

          message.reply(`**Confirmation**: Are you sure you want to upvote <${url}> with the trail? Type **\`Yes\`** to proceed.`);

          const filter = m => (m.author.id === message.author.id && m.cleanContent.toLowerCase() === 'yes');

          message.channel.awaitMessages(filter, { maxMatches: 1, time: 30000, errors: ['time'] })
            .then(async () => {
              const {
                author, permlink, rshares,
              } = await getContent(client, url);

              if (rshares < 0) {
                // Getting voters list and their combined rshares
                const {
                  voters, total,
                } = await getVoters(client, Math.abs(rshares), author, permlink, 0, 'upvote');

                if (voters.length > 0) {
                  await processVotes(client, author, permlink, voters)
                    .then(async (e) => {
                      await message.channel.send(e);
                      // Sending stat message
                      message.channel.send(`Total rewards added: ${parseFloat(total * getSbdPerRshares()).toFixed(3)}`);
                    })
                    .catch((e) => {
                      message.channel.send(e);
                    });
                } else {
                  message.reply('**ALERT:** No voters available at this moment for this content.');
                }
              } else {
                message.reply('**ERROR:** Cannot upvote it, the content has positive rshares.');
              }
            })
            .catch(() => {
              message.reply('**TIMEOUT**: You have not responded!');
            });
        }

        break;
      }

      // Pause Command
      case 'set': {
        let [username, prop, boolean] = splitMessage.slice(1);

        if (!username) {
          message.reply('**ERROR:** Username is required.');
        } else if (!['pause', 'comment'].includes(prop)) {
          message.reply('**ERROR:** Unrecognized settings property.');
        } else {
          username = username.toLowerCase();
          prop = prop.toLowerCase();
          // Converting string to boolean, if sting is true output is true else it is false
          boolean = boolean.toLowerCase() === 'true';

          const user = await User.findOne({ name: username });

          if (user) {
            // Allowing admin and the registered user to update the account
            if (message.member.roles.some(r => config.ADMIN_ROLES.includes(r.name))
              || user.discordId === message.author.id) {
              if (prop === 'pause') {
                user.paused = boolean;
              } else if (prop === 'comment') {
                user.comment = boolean;
              }

              await user.save()
                .then(() => message.channel.send(`Username \`${username}\` has been updated.`))
                .catch(() => message.channel.send(`**ERROR**: There was a problem in updating user \`${username}\`.`));
            } else {
              message.reply(`**ERROR:** You do not have permission to update user \`${username}\`.`);
            }
          } else {
            message.reply(`**ERROR:** Username \`${username}\` is not registered.`);
          }
        }

        break;
      }

      case 'help': {
        const help = stripIndents`
        **Available Commands:**

        **\`${config.PREFIX}register username weight mana_limit max_sp\`**
          *username - Steem username.*
          *weight - Maximum upvote or downvote weight, can be 100 or lower.*
          *mana_limit - Voting mana limit, can be 100 or lower.*
          *max_sp - Maximum SP of abuser you want to engage with.*

        **\`${config.PREFIX}downvote url\`**
          *url - URL of the content the trail would downvote.*

        **\`${config.PREFIX}upvote url\`**
          *url - URL of the content the trail would upvote.*

        **\`${config.PREFIX}delete username\`**
          *username - Registered Steem username.*

        **\`${config.PREFIX}set prop boolean\`**
          *prop - It can be pause or comment.*
          *boolean - Set true to pause/comment or false to resume/no comment.*
        `;

        message.channel.send(help);

        break;
      }

      default:
    }
  });

  bot.login(config.BOT_TOKEN);
})();

process.on('uncaughtException', (err) => {
  console.log(err);
});

process.on('SIGINT', () => {
  mongoose.connection.close(() => {
    process.exit(0);
  });
});
