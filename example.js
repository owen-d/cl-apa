'use strict';

const Bb = require('bluebird');
const utils = require('./lib/');
const url = require('url');
const _ = require('lodash');

utils.fetchApartments()
  .then(matches => {
    console.log('hit', matches.length);
    utils.fetchIndividualListing(matches[88])
      .then(utils.transformPage)
      .then(x => {
        console.log(x)
      });
  });
