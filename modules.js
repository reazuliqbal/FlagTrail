const async = require('async');
const {
  Asset, getVests, getVestingSharePrice, PrivateKey,
} = require('dsteem');
const config = require('./config');
const User = require('./models/User');

const STEEM_100_PERCENT = 10000;
const STEEM_VOTE_REGENERATION_SECONDS = 432000;
const STEEM_VOTE_DUST_THRESHOLD = 50000000;

let rewardFund;
let medianHistoryPrice;
let globalProperties;

// Updates steem's global properties, reward fund, and median history price
// for other functions to use every 3 minutes
const updateSteemVariables = async (client) => {
  rewardFund = await client.database.call('get_reward_fund', ['post']);
  medianHistoryPrice = await client.database.getCurrentMedianHistoryPrice();
  globalProperties = await client.database.getDynamicGlobalProperties();

  // Updating every 3 minutes
  setTimeout(() => { updateSteemVariables(client); }, 180 * 1000);
};

// Returns SBD amount for per unit of rshares
const getSbdPerRshares = () => {
  const rewardBalance = (Asset.from(rewardFund.reward_balance)).amount;
  const recentClaims = parseFloat(rewardFund.recent_claims);
  const fundPerShare = rewardBalance / (recentClaims);
  const SBDPrice = medianHistoryPrice.convert({ amount: 1, symbol: 'STEEM' });

  return (fundPerShare * SBDPrice.amount);
};

// Returns an accounts vote value in rshares and SBD given then voting mana
// and voting weight
const getVoteValue = (account, votingMana, weight = STEEM_100_PERCENT) => {
  const vests = getVests(account);
  const votePowerReserveRate = globalProperties.vote_power_reserve_rate;
  const maxVoteDenom = votePowerReserveRate * STEEM_VOTE_REGENERATION_SECONDS;
  let usedPower = parseInt(
    (votingMana * Math.abs(weight)) / STEEM_100_PERCENT * (60 * 60 * 24), 10,
  );
  usedPower = parseInt((usedPower + maxVoteDenom - 1) / maxVoteDenom, 10);
  const rshares = parseInt(vests * 1e6 * usedPower / STEEM_100_PERCENT, 10);

  const sbd = rshares * getSbdPerRshares();

  return { rshares, sbd };
};

// Returns vote percentage based on account SP and voting mana
const rsharesToVotePct = (rshares, vests, votingMana = STEEM_100_PERCENT) => {
  const votePowerReserveRate = globalProperties.vote_power_reserve_rate;
  const maxVoteDenom = votePowerReserveRate * STEEM_VOTE_REGENERATION_SECONDS;

  let usedPower = parseInt(Math.ceil(
    Math.abs(rshares - STEEM_VOTE_DUST_THRESHOLD) * STEEM_100_PERCENT / (vests * 1e6),
  ), 10);
  usedPower *= maxVoteDenom;

  const votePct = usedPower * STEEM_100_PERCENT / (60 * 60 * 24) / votingMana;

  return parseInt(votePct, 10);
};

// Converts STEEM POWER to VESTS
const convertSPToVests = sp => (getVestingSharePrice(globalProperties)).convert({ amount: sp, symbol: 'STEEM' });

// Converts STEEM POWER to VESTS
const convertVestsToSP = vests => (getVestingSharePrice(globalProperties)).convert({ amount: vests, symbol: 'VESTS' });

// Updates registared users mana, vote value, vests, authotity status every 5 minutes
const updateVPMana = async (client) => {
  const users = await User.find({});
  const accounts = await client.database.getAccounts(users.map(u => u.name));

  async.eachOf(accounts, async (account, index) => {
    const { percentage } = client.rc.calculateVPMana(account);
    const authorized = account.posting.account_auths.some(a => a.includes(config.TRAIL_ACCOUNT));
    const voteValue = getVoteValue(account, percentage, users[index].max_weight);
    const vests = getVests(account);

    await User.updateSteemData(account.name, {
      voting_mana: percentage,
      vote_value: voteValue.rshares,
      vests,
      authorized,
    });
  });

  // Updating every 5 minutes
  setTimeout(() => { updateVPMana(client); }, 300 * 1000);
};

// Getting voter list from database based on rshares to be filled
const getVoters = async (client, targetRshares, author, permlink, vests = 0, type = 'downvote') => {
  // Finding who arleady voted and list the usernames in a array
  const alreadyVoted = (await client.database.call('get_active_votes', [author, permlink]))
    .map(v => v.voter);

  // In case of downvote, low vote value voters are selected first
  // In case of upvote hight vote value voters are selected first
  const qualifiedVoters = await User.find({
    authorized: true,
    banned: false,
    paused: false,
    name: { $nin: alreadyVoted },
    max_vests: { $gte: vests },
    $expr: { $gte: ['$voting_mana', '$mana_limit'] },
  })
    .sort({ vote_value: (type === 'upvote') ? -1 : 1 })
    .select('-_id name vote_value max_weight vests voting_mana comment');

  // Processing the raw list and determining how much the vote weight should be
  // for each voters as long as the target rshares are not filled
  const voters = qualifiedVoters.reduce((acc, cur) => {
    if (acc.total < targetRshares) {
      const remaining = targetRshares - acc.total;
      let weight = cur.max_weight;

      if (remaining > 0 && remaining < cur.vote_value) {
        acc.total += remaining;
        weight = rsharesToVotePct(remaining, cur.vests, cur.voting_mana);
      } else {
        acc.total += cur.vote_value;
      }

      acc.voters.push({
        name: cur.name,
        weight,
        comment: cur.comment,
      });
    }
    return acc;
  }, { total: 0, voters: [] });

  return voters;
};

// Getting content related information such as author's vests, rshares, and category
const getContent = async (client, url) => {
  try {
    const [permlink, authorWithAt] = url.split('/').reverse();
    const author = authorWithAt.slice(1);

    const [authorAccount] = await client.database.getAccounts([author]);
    const authorVests = getVests(authorAccount);

    const content = await client.database.call('get_content', [author, permlink]);

    const data = {
      author,
      permlink,
      vests: authorVests,
      category: content.category,
      rshares: parseInt(content.net_rshares, 10),
    };

    return data;
  } catch (e) {
    console.log(e);
  }

  return 0;
};

// Finding SFR comment's author and permlink
const findSFRComment = async (client, author, permlink, category) => {
  try {
    const comments = await client.database.call('get_state', [`${category}/@${author}/${permlink}`]);
    const allReplies = Object.values(comments.content);
    const mainContent = allReplies.find(r => (r.author === author && r.permlink === permlink));
    // SFR comment is always 3rd level comment from the original content
    const sfrComment = allReplies.filter(r => r.depth === (mainContent.depth + 2) && r.author === 'steemflagrewards')
      .map((r) => {
        const cats = config.CATEGORIES.filter(c => new RegExp(c, 'i').test(r.body));
        return { author: r.author, permlink: r.permlink, category: cats[0] };
      });

    return sfrComment;
  } catch (e) {
    return false;
  }
};

// Processing and broadcasting downvote/upvotes for the voter list
const processVotes = async (client, author, permlink, voters, type = 'upvote', sfrComment = {}) => new Promise(async (resolve, reject) => {
  const alreadyVoted = await client.database.call('get_active_votes', [author, permlink]);
  const qualifiedVoters = voters.filter(voter => !alreadyVoted.some(v => v.voter === voter.name));

  if (qualifiedVoters.length > 0) {
    const ops = [];

    qualifiedVoters.forEach((voter) => {
      ops.push(['vote', {
        voter: voter.name,
        author,
        permlink,
        weight: (type === 'downvote') ? voter.weight * -1 : voter.weight,
      }]);
    });

    // Generating comment operations for downvotes
    if (type === 'downvote' && sfrComment) {
      qualifiedVoters.forEach((voter) => {
        const commentPermlink = `re-${author.replace(/\./g, '')}-${permlink.replace(/(-\d{8}t\d{9}z)/g, '')}-${new Date().toISOString().replace(/[^a-zA-Z0-9]+/g, '').toLowerCase()}`;

        // If voter wants to comment
        if (voter.comment) {
          ops.push(['comment', {
            parent_author: sfrComment.author,
            parent_permlink: sfrComment.permlink,
            author: voter.name,
            permlink: commentPermlink,
            title: '',
            body: `Follow on flag for ${sfrComment.category} @steemflagrewards.`,
            json_metadata: JSON.stringify({ app: 'flagtrail/1.0' }),
          }]);
        }
      });
    }

    client.broadcast.sendOperations(ops, PrivateKey.from(config.TRAIL_WIF))
      .then((r) => {
        resolve(`${(type === 'downvote') ? 'Downvote' : 'Upvote'} request has been processed. You can check out the transaction here <https://steemd.com/tx/${r.id}>.`);
      })
      .catch((e) => {
        reject(e.message);
      });
  } else {
    resolve('No voters available at this moment for this content.');
  }
});

const getStats = async () => {
  const [stats] = await User.aggregate([
    {
      $group: {
        _id: {},
        vests: { $sum: '$vests' },
        voteValue: { $sum: '$vote_value' },
        count: { $sum: 1 },
      },
    },
  ]);

  return {
    voteValue: stats.voteValue * getSbdPerRshares(),
    totalSP: convertVestsToSP(stats.vests),
    users: stats.count,
  };
};

// Returns true if supplied text is a URL
const isURL = (url) => {
  const urlRegExp = new RegExp(/((([A-Za-z]{3,9}:(?:\/\/)?)(?:[-;:&=+$,\w]+@)?[A-Za-z0-9.-]+|(?:www\.|[-;:&=+$,\w]+@)[A-Za-z0-9.-]+)((?:\/[+~%/.\w\-_]*)?\??(?:[-+=&;%@.\w_]*)#?(?:[.!/\\w]*))?)/g);

  return urlRegExp.test(url);
};

module.exports = {
  convertSPToVests,
  convertVestsToSP,
  findSFRComment,
  getContent,
  getSbdPerRshares,
  getStats,
  getVoters,
  getVoteValue,
  isURL,
  processVotes,
  rsharesToVotePct,
  updateSteemVariables,
  updateVPMana,
};
