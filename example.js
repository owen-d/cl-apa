'use strict';

const Bb = require('bluebird');
const utils = require('./lib/');
const url = require('url');
const _ = require('lodash');
const fs = require('fs');
const moment = require('moment-timezone');

const config = {
  slackToken: process.env.SLACK_TOKEN,
  waitInterval: 2000,
  notAfterUnixDate: ['30', 'minutes'],
  channel: 'mt-pleasant-apts',
  unixChannel: 'mt-pleasant-apts-unix'
};


getLastChecked(config)
  .then(notAfterUnixDate => fetchNotAfter(notAfterUnixDate, config))
  // format for slack
  .then(pages => _.map(pages, utils.parsePage));
// post to slack and update last-looked timestamp




function fetchNotAfter(notAfterUnixDate, config) {
  return utils.fetchApartments({notAfterUnixDate})
    .then(matches => Bb.map(matches, match => {
      return utils.fetchIndividualListing(match)
        .then(utils.transformPage)
        .then(utils.parsePage);
    }))
    .then(jsonPages => {
      console.log('%d pages', jsonPages.length);
      return _(jsonPages)
        .filter(({times}) => {
          return _.reduce(times, (accum, cur) => {
            let passed = cur > notAfterUnixDate;
            return passed;
          }, false);
        })
        .value();
    });
}

//   .then(matches => {
//     console.log('found %d matches', matches.length);
//     return Bb.map(matches, match => {
//       return utils.fetchIndividualListing(match)
//         .then(utils.transformPage)
//         .then(utils.parsePage)
//         .then(parsed => ({
//           url: match,
//           listing: parsed,
//           link: match
//         }))
//         .then(utils.formatSlackMessage);
//     });
//   })
//   .then(formatted => {
//     debugger;
//     let now = moment().unix();
//     return _.reduce(formatted, (accum, cur) => {
//       return accum
//         .then(() => utils.postToSlack({
//           token: config.slackToken,
//           channel: config.channel,
//           attachments: cur.attachments,
//           // for some reason needs empty text param when attachments are specified.
//           text: ''
//         }))
//         .delay(config.waitInterval);
//     }, Bb.resolve())
//       .then(() => {
//         return utils.postToSlack({
//           token: config.slackToken,
//           channel: config.unixChannel,
//           text: now + ''
//         });
//       });
//   });

function getLastChecked(config) {
  return utils.findChannelId({name: config.unixChannel, token: config.slackToken})
    .then(id => {
      if (!id) {
        throw new Error('no matching channel');
      }
      return utils.getLastUnix({channel: id, token: config.slackToken});
    })
    .then(wasFound => {
      if (wasFound) {
        return wasFound;
      } else {
        return moment().subtract(...config.notAfterUnixDate).unix();
      }
    });
}
