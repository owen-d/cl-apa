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



utils.findChannelId({name: config.unixChannel, token: config.slackToken})
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
  })
  .then(notAfterUnixDate => {
    return utils.fetchApartments({notAfterUnixDate});
  })
  .then(matches => {
    return Bb.map(matches.slice(0,2), match => {
      return utils.fetchIndividualListing(match)
        .then(utils.transformPage)
        .then(utils.parsePage)
        .then(parsed => ({
          url: match,
          listing: parsed,
          link: match
        }))
        .then(utils.formatSlackMessage);
    });
  })
  .then(formatted => {
    let now = moment().unix();
    return _.reduce(formatted, (accum, cur) => {
      return accum
        .then(() => utils.postToSlack({
          token: config.slackToken,
          channel: config.channel,
          attachments: cur.attachments,
          // for some reason needs empty text param when attachments are specified.
          text: ''
        }))
        .delay(config.waitInterval);
    }, Bb.resolve())
      .then(() => {
        return utils.postToSlack({
          token: config.slackToken,
          channel: config.unixChannel,
          text: now + ''
        });
      });
  });
