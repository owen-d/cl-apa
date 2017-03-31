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
  unixChannel: 'mt-pleasant-apts-unix',
  latLngFilter: {
    max: 0.5,
    unit: 'miles',
    from: {
      lat: 38.931417,
      lng: -77.040392
    }
  }
};

run(config);

function run(config) {
  let now = moment().unix();

  return getLastChecked(config)
    .then(notAfterUnixDate => fetch({notAfterUnixDate, latLngFilter: config.latLngFilter}))
    // post to slack and update last-looked timestamp
    .then(parsed => _.map(parsed, utils.formatSlackMessage))
    .then(formatted => {
      return _.reduce(formatted, (accum, cur) => {
        let postParams = _.defaults({
          token: config.slackToken,
          channel: config.channel,
          // for some reason needs empty text param when attachments are specified.
          text: ''
        }, cur);
        return accum
          .then(() => utils.postToSlack(postParams))
          .delay(config.waitInterval);
      }, Bb.resolve());
    })
    // update unix timestamp channel
    .then(() => setUnix(now, config));
}

function fetch({notAfterUnixDate, latLngFilter}) {
  return utils.fetchApartments({notAfterUnixDate, latLngFilter})
    .then(matches => Bb.map(matches, match => {
      return utils.fetchIndividualListing(match)
        .then(utils.transformPage)
        .then(utils.parsePage)
        .then(parsed => ({parsed, link: match}));
    }))
    .then(jsonPages => {
      console.log('%d total pages found', jsonPages.length);
      return _(jsonPages)
        .filter(({parsed, link}) => {
          return _.reduce(parsed.times, (accum, cur) => {
            let passed = cur > notAfterUnixDate;
            return passed;
          }, false);
        })
        .value();
    })
    .tap(x => console.log('%d pages within time range', x.length));
}

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

function setUnix(now, config) {
  return utils.postToSlack({
    token: config.slackToken,
    channel: config.unixChannel,
    text: now + ''
  });
}
