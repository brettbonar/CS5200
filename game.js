"use strict";
const messaging = require("./messaging");

const config = require("config");
const inquirer = require("inquirer");
const log4js = require("log4js");
const logger = log4js.getLogger();
const _ = require("lodash");

var commands = {};
var gameDef = {};
var responses = {};
var settings = config.get("server");

function promptGame() {
  var questions = [
    {
      name: "command",
      type: "list",
      message: "Choose a command: \nDefinition: " + gameDef.definition
        + "\n" + "Hint: " + gameDef.hint + " (" + gameDef.hint.length + " characters)",
      choices: [
        {
          name: "Get Hint",
          value: "getHint"
        }, {
          name: "Guess",
          value: "startGuess"
        }, {
          name: "New Game",
          value: "startGame", 
        }, {
          name: "Set Config",
          value: "setConfig"
        }, {
          name: "Quit",
          value: "quit"
        }
      ]
    }
  ];
  
  return inquirer.prompt(questions).then((command) => handleCommand(command.command));
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
    //client.bind(settings.port, settings.host);
    // TODO: figure out how to set config
    //config.set("server", settings);
  });
};

commands.getHint = function () {
  messaging.sendMessage("getHint", {
    id: gameDef.id
  });
}

commands.startGame = function () {
  messaging.sendMessage("startGame", {
    aNum: "A02195862",
    lastName: "Bonar",
    firstName: "Brett",
    alias: "BrettB"
  });
};

commands.startGuess = function () {
  return inquirer.prompt({
    name: "guess",
    message: "Guess:"
  }).then(function (guess) {
    messaging.sendMessage("guess", {
      id: gameDef.id,
      guess: guess.guess
    });
  });
}

commands.quit = function () {
  messaging.sendMessage("exit", {
    id: gameDef.id
  });
  process.exit();
}

messaging.addHandler("answer", function (message) {
  gameDef.hint = message.hint;
  // TODO: show score, result?
  promptGame();
});

messaging.addHandler("heartbeat", function (message) {
  messaging.sendMessage("ack", {
    id: message.id
  });
});

messaging.addHandler("hint", function (message) {
  gameDef.hint = message.hint;
  promptGame();
});

messaging.addHandler("gameDef", function (message) {
  gameDef = message;
  promptGame();
});

function handleCommand(command) {
  if (commands[command]) {
    commands[command]();
  }
}

function startGame() {
  // Starting Prompt:
  var questions = [
    {
      name: "command",
      type: "list",
      message: "Choose a command:",
      choices: [
        {
          name: "Start Game",
          value: "startGame"
        }, {
          name: "Set Config",
          value: "setConfig"
        }
      ]
    }
  ];

  inquirer.prompt(questions).then((command) => handleCommand(command.command));
}

module.exports = {
  startGame: startGame
};
