'use strict';

const Bb = require('bluebird');
const utils = require('./lib/');
const url = require('url');
const _ = require('lodash');
const fs = require('fs');
const moment = require('moment-timezone');

utils.fetchApartments({
  notAfterUnixDate: moment().subtract(1, 'hour').unix()
})
  .then(matches => {
    return Bb.map(matches, match => {
      return utils.fetchIndividualListing(match)
        .then(utils.transformPage)
        .then(utils.parsePage)
        .then(parsed => ({
          url: match,
          listing: parsed
        }));
    });
  });


