const mongoose = require("mongoose");
const promisify = require("promisify");
const fs = require("fs");
const path = require("path");
const parse = require("csv-parse");
const bluebird = require("bluebird")

mongoose.Promise = bluebird;
mongoose.connect("mongodb://localhost/homey", {useMongoClient: true});
mongoose.connection.on('error', console.error.bind(console, 'connection error:'));

mongoose.connection.once('open', function(){

  require("../models")();
  let Hood = mongoose.model("Hood");

  function get_neighbourhood_if_exists(nid){
    return promisify.m(Hood, 'find', {nid: nid})
      .then(function(results){
        if (results.length === 0) {
          throw "Ayy lmao neighbourhood doesn't exist";
        }
        return Promise.resolve(results[0]);
      })
  };

  promisify.m(fs, 'readFile', path.join(__dirname, "./environment.csv"))
    .then((rawCsv) => {
      return promisify.f(parse, rawCsv)
    })
    .then((csv) => {
      return Promise.all(csv.map((csvHood) => {
        let nid = csvHood[1];
        let green_spaces = csvHood[3];
        return get_neighbourhood_if_exists(nid)
          .then((hood) => {
            hood.scores.push({category: "green_spaces", value: green_spaces, delta: csvHood[4]});
            hood.scores.push({category: "pollutants", value: csvHood[2]});
            return promisify.m(hood, 'save');
          });
      }));
    })
    .then(() => {
      process.exit();
    })
    .catch((err) => {
      console.error(err);
    });
});
