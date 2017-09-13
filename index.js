"use strict";

const config = require("config");
const dgram = require("dgram");
const inquirer = require("inquirer");
const _ = require("lodash");
const q = require("q");

const BYTE = "byte";
const INT = "int";
const STRING = "string";
const MESSAGE_TYPES = {
  startGame: 1,
  gameDef: 2,
  guess: 3,
  answer: 4,
  getHint: 5,
  hint: 6,
  exit: 7,
  ack: 8,
  error: 9,
  heartbeat: 10
};

var commands = {};
var handlers = {};
var gameDef = {};

var parsers = {
  startGame: {
    aNum: STRING,
    lastName: STRING,
    firstName: STRING,
    alias: STRING
  },
  gameDef: {
    id: INT,
    hint: STRING,
    definition: STRING
  },
  guess: {
    id: INT,
    guess: STRING
  },
  answer: {
    id: INT,
    result: BYTE,
    score: INT,
    hint: STRING
  },
  getHint: {
    id: INT
  },
  hint: {
    id: INT,
    hint: STRING
  },
  exit: {
    id: INT
  },
  ack: {
    id: INT
  },
  error: {
    id: INT,
    error: STRING
  },
  heartbeat: {
    id: INT
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
      result[key] = read2ByteUnicode(message, offset, offset + len);
      offset += len;
    } else if (type === BYTE) {
      result[key] = message.readUInt8(offset);
      offset += 1;
    }
  });

  return result;
}

function swapBytes(buffer, offset, end) {
  offset = offset || 0;
  end = end || buffer.length - offset;
  // var l = buffer.length - offset;
  // if (l & 0x01) {
  //   throw new Error('Buffer length must be even');
  // }
  for (var i = offset; i <= end; i += 2) {
    var a = buffer[i];
    buffer[i] = buffer[i+1];
    buffer[i+1] = a;
  }
  return buffer; 
}

function read2ByteUnicode(buffer, offset, end) {
  offset = offset || 0;
  end = end || buffer.length - offset;
  var buf = Buffer.alloc(end - offset);
  buffer.copy(buf, 0, offset, end);
  buf = swapBytes(buf);
  return buf.toString("utf16le");
}

function get2ByteUnicodeEncoding(value) {
  var encoding = Buffer.alloc(2 + value.length * 2);
  encoding.writeInt16BE(value.length * 2);
  var offset = 2;
  encoding.write(value, offset, value.length * 2, "utf16le");
  encoding = swapBytes(encoding, offset);
  return encoding;
  // _.forEach(string, function (char) {
  //   console.log(char);
  //   buffer.writeUInt8(0, offset);
  //   offset += 1;
  //   buffer.write(char, offset);
  //   offset += 1;
  // });
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
      encoding = get2ByteUnicodeEncoding(value);
    } else if (type === INT) {
      encoding = Buffer.alloc(2);
      encoding.writeInt16BE(value);
    } else if (type === BYTE) {
      encoding = Buffer.alloc(1);
      encoding.writeUInt8(value);
    }
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
          value: "startGame"
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
    client.bind(settings.port, settings.host);
    // TODO: figure out how to set config
    //config.set("server", settings);
  });
};

commands.getHint = function () {
  sendMessage("getHint", {
    id: gameDef.id
  });
}

commands.startGame = function () {
  sendMessage("startGame", {
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
    sendMessage("guess", {
      id: gameDef.id,
      guess: guess.guess
    });
  });
}

commands.quit = function () {
  sendMessage("exit", {
    id: gameDef.id
  });
  process.exit();
}

handlers.answer = function (message) {
  gameDef.hint = message.hint;
  // TODO: show score, result?
  promptGame();
}

handlers.heartbeat = function (message) {
  sendMessage("ack", {
    id: message.id
  });
}

handlers.hint = function (message) {
  gameDef.hint = message.hint;
  promptGame();
}

handlers.gameDef = function (message) {
  gameDef = message;
  promptGame();
};

function getCommand(callback) {
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

  return inquirer.prompt(questions);
}

function handleCommand(command) {
  if (commands[command]) {
    commands[command]();
  }
}

getCommand().then((command) => handleCommand(command.command));
