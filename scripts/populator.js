const neighbourhoods = require("./neighbourhoods.json");

const mongoose = require("mongoose");
const promisify = require("promisify");
const bluebird = require("bluebird")

mongoose.Promise = bluebird;

mongoose.connect("mongodb://localhost/homey", {useMongoClient: true});
mongoose.connection.on('error', console.error.bind(console, 'connection error:'));

mongoose.connection.once('open', function(){

  require("../models")();

  let Hood = mongoose.model("Hood");


  let promises = neighbourhoods.features.map(function(neighbourhood){
    let hood = new Hood();
    let name = neighbourhood.attributes.AREA_NAME;
    let parts = name.match(/^(.+)\s\(([0-9]+)\)$/);

    hood.nid = parts[2];
    hood.title = parts[1];
    hood.geometry = neighbourhood.geometry;

    return promisify.m(hood, 'save');
  })

  Promise.all(promises)
    .then(function(results){
      process.exit();
    })
    .catch(function(err){
      console.error(err);
    });
});
