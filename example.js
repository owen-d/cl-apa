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
        let body = x[2].children[3];
        let wanted = body.children
            .filter(x => x.children && x.tagName !== 'script')[0]
            .children
            .filter(x => x.children);
        console.log(wanted);
        debugger;
      });
  });
