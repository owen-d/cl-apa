'use strict';

const Bb = require('bluebird');
const utils = require('./lib/');
const url = require('url');
const _ = require('lodash');

utils.fetchApartments()
  .then(matches => {
    console.log(matches[100])
    console.log('hit', matches.length)
  });
