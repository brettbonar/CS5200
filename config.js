"use strict";

const nconf = require("nconf");
nconf.file("config.json");

module.exports = nconf;
