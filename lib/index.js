'use strict';

const slack = require('slack');
const Bb = require('bluebird');
const _ = require('lodash');
const r = Bb.promisifyAll(require('request'));
const url = require('url');


module.exports = {
  fetchApartments,
  fetchIndividualListing,
  transformPage
};

// needs to recursively fetch grouped ones & flatten
function fetchApartments(opts) {
  let clOpts = {
    protocol: 'https:',
    host: 'washingtondc.craigslist.org',
    pathname: 'jsonsearch/apa/',
    query: {
      search_distance: 0,
      postal: 20010,
      availabilityMode: 0,
      map: 1
    }
  };

  opts = opts || clOpts;

  let uri = url.format(opts);
  return r.getAsync({
    url: uri,
    json: true
  })
    .then(resp => {
      if (resp.statusCode !== 200) {
        throw new Error(`statuscode: ${resp.statusCode}`);
      }
      let matches = resp.body[0];
      let clusters = _.remove(matches, match => match.NumPosts);
      //other matches are collections of matches, need to get at em.
      return Bb.map(clusters, cluster => {
        let baseOpts = _.pick(clOpts, ['protocol', 'host']);
        let clusterUrl = url.format(_.defaults({
          pathname: cluster.url
        }, baseOpts));
        return fetchApartments(clusterUrl);
      })
        .then(newListings => {
          return matches.concat(newListings);
        });
    })
    .then(_.flattenDeep);
}

// allow arbitrary filters (price, bedrooms, lat/lng, etc)

// finally fetch individual listings, parsing html
function fetchIndividualListing(url) {}

//transform each listing into a json object via some crawler.
function transformPage(html) {}

function Pipeline({
  interval,
  filters = [],

} = {}){}
