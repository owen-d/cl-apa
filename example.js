'use strict';

const Bb = require('bluebird');
const utils = require('./lib/');
const url = require('url');
const _ = require('lodash');
const fs = require('fs');
const moment = require('moment-timezone');

const config = {
  slackUrl: process.env.SLACK_URL,
  waitInterval: 2000,
  notAfterUnixDate: process.env.AFTER_DATE || moment().subtract(45, 'minutes').unix()
};

utils.fetchApartments({
  notAfterUnixDate: config.notAfterUnixDate
})
  .then(matches => {
    console.log('matched %d', matches.length);
    return Bb.map(matches, match => {
      return utils.fetchIndividualListing(match)
        .then(utils.transformPage)
        .then(utils.parsePage)
        .then(parsed => ({
          url: match,
          listing: parsed,
          link: match
        }))
        .then(utils.formatSlackMessage);
    })
      .then(formatted => _.reduce(formatted, (accum, cur) => {
        return accum
          .then(utils.postToSlack(config.slackUrl, cur))
          .delay(config.waitInterval);
      }, Bb.resolve()));
  });

