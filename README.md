# FlagTrail

FlagTrail is a Discord bot to flag abusive contents from all subscribed accounts all at once. It can also be used to counter retaliatory flags from the abusers.

The bot periodically updates registered accounts' [voting power, vote value,  vests, and authorization status](https://github.com/CodeBull/FlagTrail/blob/master/modules.js#L73) from the Blockchain. It uses these variables and required rshares value to make an available [voters list](https://github.com/CodeBull/FlagTrail/blob/master/modules.js#L96) for specific content.

Along with flagging abuse it also comments from every subscribed accounts under @steemflagrewards approval comment so that all the participants can be rewarded by the @steemflagrewards.

## Available Commands

### Registration

Command: `?register username vote_weight voting_mana_limit abuser_sp_limit`

Example: `?register noblebot 100 90 3000`

With the above command, @noblebot can subscribe to the Trail. The bot will respond with a posting authorization SteemConnect link for the trail account.

The trail would use maximum of 100% voting weight as long as @noblebot's voting mana is above 90% and downvote if an abuser doesn't have more than 3000 SP.

### Downvote

Command: `?downvote content_url`

Example: `?downvote https://steemit.com/utopian-io/@reazuliqbal/automatically-follow-on-flag-sfr-approved-flags`

Only [admin(s)](https://github.com/CodeBull/FlagTrail/blob/master/config.js#L11) can use downvote command. The trail would only downvote if the content has [positive](https://github.com/CodeBull/FlagTrail/blob/master/app.js#L148) rshares and a @steemflagrewards approval [comment](https://github.com/CodeBull/FlagTrail/blob/master/app.js#L151) is present. 

When all the conditions are met, the bot would look for [available](https://github.com/CodeBull/FlagTrail/blob/master/app.js#L155) voters based on criteria set by the subscribers. After that all [downvote](https://github.com/CodeBull/FlagTrail/blob/master/app.js#L158) and follow-on [comments](https://github.com/CodeBull/FlagTrail/blob/master/modules.js#L202) will be sent all at once.

## Upvote

Command: `?upvote content_url`

Example: `?upvote https://steemit.com/utopian-io/@reazuliqbal/automatically-follow-on-flag-sfr-approved-flags`

Like downvote, this is also a restricted command for the admins. The trail would only process upvote if the content has negative rshares and bring it to zero rshares. This is used to counteract retaliatory flags from the abusers.

## Delete

Command: `?delete username`

Example: `?delete noblebot`

Any [registered user or admin](https://github.com/CodeBull/FlagTrail/blob/master/app.js#L108) can use this command to remove a subscribed user from the trail.

There is also `?help`  - a command for displaying all the commands with their required arguments.


## Technologies

It uses MongoDB for storing users data, dSteem to communicate with the Steem Blockchain, and Discord.js for Discord API.

## TODO

- Individual and overall statistics commands
- Pause command for users
- Minimum SP requirement for subscribers

## Installation

 - Create a [Discord bot](https://discordapp.com/developers/applications/me) and grab its token.
 - Rename `example.env` to `.env` and make required changes to the `.env` file
 - Change command prefix or Admin roles in `config.js` if needed.
 - Open up terminal and type `npm install` to install all the dependencies.
 - Run `npm start` to start the bot.

## Contributing

When contributing to this repository, please first discuss the change you wish to make via issue or any other method with the (owner) of this repository. But you are free to make your own copy and use it.
