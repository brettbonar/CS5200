"use strict";

const client = require("./client");
const config = require("./config");
const logger = require("./logger").getLogger("game");

const inquirer = require("inquirer");
const _ = require("lodash");

var commands = {};
var gameDef;
var responses = {};

function getPrompt(newGame) {
  if (newGame) {
    return "Choose a command:";
  }
  return "Choose a command: \nDefinition: " + gameDef.definition
    + "\n" + "Hint: " + gameDef.hint + " (" + gameDef.hint.length + " characters)";
}

function promptGame(newGame) {
  var choices = [{
      name: "New Game",
      value: "startGame", 
    }, {
      name: "Set Config",
      value: "setConfig"
    }, {
      name: "Quit",
      value: "quit"
    }
  ];

  if (!newGame) {
    choices = [{
      name: "Get Hint",
      value: "getHint"
    }, {
      name: "Guess",
      value: "startGuess"
    }].concat(choices);
  }
  
  var questions = [
    {
      name: "command",
      type: "list",
      message: getPrompt(newGame),
      choices: choices
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
    // Stop game if changing config
    if (gameDef) {
      client.sendMessage("exit", {
        id: gameDef.id
      });
      gameDef = null;
    }
    config.set("server:host", answers.host);
    config.set("server:port", parseInt(answers.port, 10));
    config.save();
    startGame();
  });
};

commands.getHint = function () {
  client.sendMessage("getHint", {
    id: gameDef.id
  });
}

commands.startGame = function () {
  client.sendMessage("startGame", {
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
    client.sendMessage("guess", {
      id: gameDef.id,
      guess: guess.guess
    });
  });
}

commands.quit = function () {
  client.sendMessage("exit", {
    id: gameDef.id
  });
}

commands.exit = function () {
  process.exit();
}

client.addHandler("answer", function (message) {
  if (message.result === 1) {
    console.log("Correct!");
    console.log("Score: " + message.score);
    promptGame(true);
  } else {
    gameDef.hint = message.hint;
    console.log("Incorrect!");
    promptGame();
  }
});

client.addHandler("heartbeat", function (message) {
  client.sendMessage("ack", {
    id: message.id
  });
});

client.addHandler("ack", function (message) {
  if (gameDef) {
    process.exit();
  }
});

client.addHandler("hint", function (message) {
  gameDef.hint = message.hint;
  promptGame();
});

client.addHandler("gameDef", function (message) {
  gameDef = message;
  promptGame();
});

function handleCommand(command) {
  if (commands[command]) {
    commands[command]();
  } else {
    logger.error("Invalid command");
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
          name: "New Game",
          value: "startGame"
        }, {
          name: "Set Config",
          value: "setConfig"
        }, {
          name: "Quit",
          value: "exit"
        }
      ]
    }
  ];

  inquirer.prompt(questions).then((command) => handleCommand(command.command));
}

module.exports = {
  startGame: startGame
};
