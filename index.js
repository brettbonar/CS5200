"use strict";

const config = require("config");
const dgram = require("dgram");
const inquirer = require("inquirer");
const _ = require("lodash");
const q = require("q");
const Rx = require("rx-lite");

const INT = "int";
const STRING = "string";
const MESSAGE_TYPES = {
  startGame: 1,
  gameDef: 2
};

var commands = {};
var handlers = {};

var parsers = {
  startGame: { // Start Game
    aNum: STRING,
    lastName: STRING,
    firstName: STRING,
    alias: STRING
  },
  gameDef: { // GameDef
    id: INT,
    hint: STRING,
    definition: STRING
  }
};
var responses = {};

var settings = config.get("server");
var client = dgram.createSocket("udp4");
//client.bind(settings.port, settings.host);
client.on("message", handleMessage);

function parseMessage(message, messageType) {
  var parser = parsers[messageType];
  var offset = 0;
  var result = {};
  _.forEach(parser, function (type, key) {
    if (type === INT) {
      result[key] = message.readInt16BE(offset);
      offset += 2;
    } else if (type === STRING) {
      var len = message.readInt16BE(offset);
      offset += 2;
      result[key] = message.toString("utf8", offset, offset + len);
      offset += len;
    } // else error
  });

  return result;
}

function handleMessage(message, remote) {
  if (remote.port === settings.port && remote.address === settings.host) {
    var type = message.readInt16BE(0);
    var messageType = _.findKey(MESSAGE_TYPES, function (val) {
      return val === type;
    });
    message = parseMessage(message.slice(2), messageType);
    if (handlers[messageType]) {
      handlers[messageType](message);
    } else {
      //console.log("Error: No handler for message of type: \"" + messageType + "\"");
    }
  }
}

function sendMessage(type, message) {
  var encodings = [];

  // Add message type first
  var typeEnc = Buffer.alloc(2);
  typeEnc.writeInt16BE(MESSAGE_TYPES[type]);
  encodings.push(typeEnc);

  var parser = parsers[type];
  _.forEach(parser, function (type, key) {
    var encoding;
    var value = message[key];
    if (type === STRING) {
      encoding = Buffer.alloc(2 + value.length);
      encoding.writeInt16BE(value.length);
      encoding.write(value, 2);
    } else if (type === INT) {
      encoding = Buffer.alloc(2);
      encoding.writeInt16BE(value);
    } // else error
    encodings.push(encoding);
  });

  var length = _.sumBy(encodings, "length");
  var message = Buffer.concat(encodings, length);
  client.send(message, 0, message.length, settings.port, settings.host, function (err, bytes) {
    if (err) {
      //console.log("error: " + err);
    }
  });
}

commands.setConfig = function () {
  var questions = [
    {
      name: "host",
      message: "Host Address:"
    },
    {
      name: "port",
      message: "Port:"
    }
  ];

  return inquirer.prompt(questions).then(function (answers) {
    settings = answers;
    client.bind(settings.port, settings.host);
    // TODO: figure out how to set config
    //config.set("server", settings);
  });
};

commands.startGame = function () {
  sendMessage("startGame", {
    aNum: "A02195862",
    lastName: "Bonar",
    firstName: "Brett",
    alias: "BrettB"
  });
  return q.resolve("Done");
};

handlers.gameDef = function (message) {
  var questions = [
    {
      name: "command",
      type: "list",
      message: "Definition: " + message.definition + "\n" + "Hint: " + message.hint,
      choices: [
        {
          name: "Get Hint",
          value: "getHint"
        }, {
          name: "Guess",
          value: "guess"
        }, {
          name: "Quit",
          value: "quit"
        }
      ]
    }
  ];
  
  return inquirer.prompt(questions);//.then((command) => handleCommand(command.command));
};

function handleCommand(command) {
  if (commands[command]) {
    commands[command]().then(getCommand);
  }
}

var prompts = new Rx.Subject();
inquirer.prompt(prompts);
prompts.onNext({
  name: "command",
  type: "list",
  message: "Choose a command:",
  choices: [
    {
      name: "Set Config",
      value: "setConfig"
    }, {
      name: "Start Game",
      value: "startGame"
    }
  ]
});
