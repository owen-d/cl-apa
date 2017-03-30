'use strict';

const Bb = require('bluebird');
const utils = require('./lib/');
const url = require('url');
const _ = require('lodash');
const fs = require('fs');
const moment = require('moment-timezone');

utils.fetchApartments({
  notAfterUnixDate: moment().subtract(1, 'hours').unix()
})
  .then(matches => {
    utils.fetchIndividualListing(_.shuffle(matches)[0])
      .then(utils.transformPage)
      .then(x => {
        let comparator = elem => elem.attributes && elem.attributes.id && elem.attributes.id.indexOf('postingbody') !== -1;
        let wanted = findMatchingElems(comparator, x);
        let wantedText = findMatchingElems(x => x.type = 'Text', wanted)
            .filter(x => x.content)
            .map(x => x.content)
            .join('');
        let imageElement = findMatchingElems(elem => {
          return elem.attributes && elem.attributes.id && elem.attributes.id.indexOf('thumbs') !== -1;
        }, x)[0];
        console.log(imageElement);
      });
  });


function findMatchingElems(comparator, elem) {
  //handle elem if it is an array of elems
  if (_.isArray(elem)) {
    return _.flatten(_.map(elem, e => processElem(comparator, e)));
  } else {
    return processElem(comparator, elem);
  }

  function processElem(comparator, elem) {
    let matched = [];
    if (comparator(elem)) matched.push(elem);
    if (elem.children) {
      let childrenMatches = _.map(elem.children, child => {
        return findMatchingElems(comparator, child);
      });
      matched = matched.concat(...childrenMatches);
    }
    return matched;
  }
}
