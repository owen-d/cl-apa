'use strict';

const slack = require('slack');
const Bb = require('bluebird');
const _ = require('lodash');
const r = Bb.promisifyAll(require('request'));
const url = require('url');
const himalaya = require('himalaya');
const moment = require('moment-timezone');


module.exports = {
  fetchApartments,
  fetchIndividualListing,
  transformPage
};

// needs to recursively fetch grouped ones & flatten
function fetchApartments({
  hostOpts = {
    protocol: 'https:',
    host: 'washingtondc.craigslist.org',
    pathname: 'jsonsearch/apa/',
    query: {
      search_distance: 0,
      postal: 20010,
      availabilityMode: 0,
      map: 1
    }
  },
  notAfterUnixDate = null
} = {}) {

  let uri = url.format(hostOpts);
  return r.getAsync({
    url: uri,
    json: true
  })
    .then(resp => {
      if (resp.statusCode !== 200) {
        throw new Error(`statuscode: ${resp.statusCode}`);
      }
      let matches = resp.body[0];
      if (notAfterUnixDate) {
        matches = _.filter(matches, match => match.PostedDate > notAfterUnixDate);
      }
      let clusters = _.remove(matches, match => match.NumPosts);
      let listings = _.map(matches, match => match.PostingURL);
      //other matches are collections of matches, need to get at em.

      let clusteredItems = _(clusters).map(cluster => {
        return _.map(cluster.PostingID.split(','), id => `//${hostOpts.host}/doc/apa/${id}.html`);
      })
          .flatten()
          .value();

      return _(listings)
        .concat(clusteredItems)
        .map(url => hostOpts.protocol + url)
        .value();
    });
}

// allow arbitrary filters (price, bedrooms, lat/lng, etc)

// finally fetch individual listings, parsing html
function fetchIndividualListing(url) {
  return r.getAsync(url)
    .then(resp => resp.body);
}

//transform each listing into a json object via some crawler.
function transformPage(html) {
  return himalaya.parse(html);
}

function Pipeline({
  interval,
  filters = [],

} = {}){}
