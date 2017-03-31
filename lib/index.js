'use strict';

const Bb = require('bluebird');
const _ = require('lodash');
const r = Bb.promisifyAll(require('request'));
const url = require('url');
const himalaya = require('himalaya');
const moment = require('moment-timezone');
const slack = require('slack');
Bb.promisifyAll(slack.channels);
Bb.promisifyAll(slack.chat);
const geolib = require('geolib');


module.exports = {
  fetchApartments,
  fetchIndividualListing,
  transformPage,
  parsePage,
  formatSlackMessage,
  postToSlack,
  getLastUnix,
  findChannelId,
  findMatchingElems
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
  notAfterUnixDate = null,
  latLngFilter = null
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

      // optional fine-grained distance filtering
      if (latLngFilter) {
        let fromPt = {
          latitude: latLngFilter.from.lat,
          longitude: latLngFilter.from.lng
        };
        matches = _.filter(matches, match => {
          let matchAsPt = {
            latitude: match.Latitude,
            longitude: match.Longitude
          };

          return getDistanceInMiles(fromPt, matchAsPt) < latLngFilter.max;
          return true;
        });
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

function parsePage(json) {
  // find text
  let hasPostingBody = elem => elem.attributes && elem.attributes.id && elem.attributes.id.indexOf('postingbody') !== -1;
  let postingBody = findMatchingElems(hasPostingBody, json);
  let text = findMatchingElems(x => x.type === 'Text', postingBody)
      .filter(x => x.content)
      .map(x => x.content)
      .join('');
  let ignoreStr = `        
            QR Code Link to This Post
            
        
`;
  text = text.replace(ignoreStr, '');

  // find images
  let imageElement = findMatchingElems(elem => {
    return elem.attributes && elem.attributes.id && elem.attributes.id.indexOf('thumbs') !== -1;
  }, json)[0];
  let images = [];
  if (imageElement) {
    images = _.map(imageElement.children, child => child.attributes.href);
  }

  //find date
  let times = findMatchingElems(e => {
    let classes = _.get(e, ['attributes', 'className'], []);
    let found = classes.indexOf('timeago') !== -1;
    return found;
  }, json)
      .map(e => moment(e.attributes.datetime).unix());

  //find address
  let mapAddresses = findMatchingElems(e => {
    let classes = _.get(e, ['attributes', 'className'], []);
    let found = classes.indexOf('mapaddress') !== -1;
    let onlyChild = e.children && e.children.length ===1 && e.children[0].hasOwnProperty('content');
    return found && onlyChild;
  }, json)
      .map(e => _.get(e, ['children', '0', 'content']));
  mapAddresses = _.compact(mapAddresses);

  //find price
  let price = _(findMatchingElems(e => {
    let classes = _.get(e, ['attributes', 'className']) || [];
    let found = classes.indexOf('price') !== -1;
    return found;
  }, json))
      .map(x => _.get(x, ['children', '0', 'content']))
      .compact()
      .value()[0];

  return {
    text,
    images,
    times,
    mapAddresses,
    price
  };

}

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

function formatSlackMessage({parsed: {text, images, times, mapAddresses, price}, link}, {maxImages=2} = {}) {
  let template = {
    fallback: 'new apt!'
  };


  let textAttachment = _.defaults({
    title: `New listing! ${price ? '- ' + price : ''}`,
    pretext: mapAddresses[0],
    title_link: link,
    text: text,
    ts: times[0]
  }, template);

  let imageAttachments = _(images)
      .take(maxImages)
      .map((image, idx) => ({
        fallback: 'image_placholder',
        title: `image-${idx+1}`,
        title_link: image,
        image_url: image
      }))
      .value();

  return {
    attachments: [textAttachment].concat(imageAttachments)
  };
}

// function postToSlack({channel, token}, msg) {
//   return slack.chat.postMessageAsync({token, channel, attachments: msg.attachments, text: ''});
// }
function postToSlack(params) {
  return slack.chat.postMessageAsync(params);
}

function getLastUnix({channel, token}) {
  return slack.channels.historyAsync({channel, token})
    .catch(e => {
      debugger;
    })
    .then(({messages}) => {
      return _.reduce(messages, (accum, cur) => {
        //already have a more recent match
        if (accum) return accum;
        try {
          let lastCalled = moment.unix(cur.text);
          return lastCalled._isValid ? lastCalled.unix() : accum;
        } catch (e) {
          return accum;
        }
      }, null);
    });
}
// function setNextUnix(time) {}

function findChannelId({name, token}) {
  return slack.channels.listAsync({token})
    .then(({channels}) => {
      let matched = _.filter(channels, c => c.name === name)[0];
      return matched ? matched.id : null;
    });
}

function getDistanceInMiles(a, b) {
  const METERS_PER_MILE = 1609.34;
  return geolib.getDistance(a, b) / METERS_PER_MILE;
}
