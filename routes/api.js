var express = require('express');
var router = express.Router();
var mongoose = require("mongoose");
var Hood = mongoose.model('Hood');

var _ = require ("underscore");
var request = require("request");
var geoLib = require("geolib");
var promisify = require("../helpers/promisify");

/* GET users listing. */
router.get('/', function(req, res, next) {
  res.send('Connected');
});

router.post('/registerUser', function(req, res) {
  var address = req.body.officeLocation;

  var options = {
      uri : "http://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/find?text="+ address +"&f=json",
      method : 'GET',
  };

  promisify.f(request, options)
    .then(function(response,body){
     if (response.statusCode == 200) {
        var obj = JSON.parse(response.body);
        var lat = obj.locations[0].feature.geometry.y;
        var lon = obj.locations[0].feature.geometry.x;

        return computeTopNeighbourhood(lat, lon, req, res);

     } else {
      return null;
     }
  })
  .then(function(hoods){
    res.render("results", { results: JSON.stringify(hoods) });
  })
  .catch(function(err) {
    console.error(err);
    res.send('Error');
  });
});

function getFactors(body) {
  var f = {};

  switch (body.transportation) {
    case "car":
      f.walkscore = 0.50;
      break;
    case "transit":
      f.walkscore = 1.20;
      break;
    case "walk":
      f.walkscore = 1.50;
      break;
    case "bike":
      f.walkscore = 1.00;
    default:
      f.walkscore = 0.80;
  }

  f.crime = 1.00 + (parseInt(body.children)*0.10);
  f.pollutants = 0.85;
  f.density = (-1 * ((parseInt(body.adults) + parseInt(body.children)) - 2.5)) + (1 - 0.05*(Math.abs(27-body.age)));
  f.green_spaces = 0.85 + (0.15 * parseInt(body.children));

  // capping
  f = _.mapObject(f, (val) => {
    if (val < -1.5) {
      return -1.5;
    } else if (val > 1.5) {
      return 1.5;
    } else {
      return val;
    }
  });

  return f;
}

function computeTopNeighbourhood(workLat, workLon, req, res){
  return promisify.m(Hood, 'find').then(function(result){
    var hoods = [];
    console.log(result)
    var keys = _.pluck(result[0].scores, "category");
    var values = keys.map((category) => {
      return _.max(result.map((hood) => {
        return _.find(hood.scores, (score) => { return score.category === category }).value;
      }));
    });

    let maxMap = _.object(keys, values);

    for (let i = 0; i < result.length; i++){
      let hoodLat = result[i].centroid.x;
      let hoodLon = result[i].centroid.y;
      let hoodName = result[i].title;

      hoods[i] = {title: hoodName,
                  geometry: result[i].geometry,
                  nid: result[i].nid,
                  scores: result[i].scores,
                  centroid: result[i].centroid,
                  dist: geoLib.getDistance({latitude: workLat, longitude: workLon},{latitude: hoodLat, longitude: hoodLon})
                };
    };
    hoods.sort(function(a,b) {
      return a.dist - b.dist
    });

    let factors = getFactors(req.body);

    hoods = hoods.map((hood) => {
      hood.score = hood.scores.reduce((prev, curr) => {
        let value = curr.value / maxMap[curr.category];
        if (factors[curr.category] < 0) {
          value = (maxMap[curr.category] - curr.value) / maxMap[curr.category];
        }
        return prev + (value * Math.abs(factors[curr.category]));
      }, 0);
      return hood;
    });

    // Make this only run for 5 hoods
    let promises = hoods.slice(0,20).map(function(hood){
      return Promise.all([Promise.resolve(hood), ""]);
    });

    return Promise.all(promises)
  })
  .then(function(value) {
    let hoods = value.map(function(obj){
      let hood = obj[0];
      hood['timeToWork'] = hood['dist'];
      return hood;
    })
    .sort(function(a,b){return a.timeToWork - b.timeToWork }).slice(0,15);

    return Promise.resolve({
      hoods: hoods,
      workLat: workLat,
      workLon: workLon
    });
  })
  .catch(function(reason) {
    console.error(reason);
  });
};

module.exports = router;
