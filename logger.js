"use strict";
const log4js = require("log4js");
log4js.configure({
  appenders: {
    everything: { type: "file", filename: "log.log" },
  },
  categories: {
    default: { appenders: ["everything"], level: "debug" }
  }
});

module.exports = log4js;
