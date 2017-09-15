"use strict";

const dgram = require("dgram");
const logger = require("./logger").getLogger("messaging");
const config = require("./config");
const _ = require("lodash");

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

var handlers = {};
var messageDefs = {
  startGame: [{
    name: "aNum",
    type: STRING
  }, {
    name: "lastName",
    type: STRING
  }, {
    name: "firstName",
    type: STRING
  }, {
    name: "alias",
    type: STRING
  }],
  gameDef: [{
    name: "id",
    type: INT
  }, {
    name: "hint",
    type: STRING
  }, {
    name: "definition",
    type: STRING
  }],
  guess: [{
    name: "id",
    type: INT
  }, {
    name: "guess",
    type: STRING
  }],
  answer: [{
    name: "id",
    type: INT
  }, {
    name: "result",
    type: BYTE
  }, {
    name: "score",
    type: INT
  }, {
    name: "hint",
    type: STRING
  }],
  getHint: [{
    name: "id",
    type: INT
  }],
  hint: [{
    name: "id",
    type: INT
  }, {
    name: "hint",
    type: STRING
  }],
  exit: [{
    name: "id",
    type: INT
  }],
  ack: [{
    name: "id",
    type: INT
  }],
  error: [{
    name: "id",
    type: INT
  }, {
    name: "error",
    type: STRING
  }],
  heartbeat: [{
    name: "id",
    type: INT
  }]
};

var client = dgram.createSocket("udp4");
client.on("message", handleMessage);

function read2ByteUnicode(buffer, offset, end) {
  offset = offset || 0;
  end = end || buffer.length - offset;
  var buf = Buffer.alloc(end - offset);
  buffer.copy(buf, 0, offset, end);
  // TRICKY: swap bytes since buffer only handles little endian, but we expect big endian
  buf.swap16();
  return buf.toString("utf16le");
}

function get2ByteUnicodeEncoding(value) {
  var encoding = Buffer.alloc(2 + value.length * 2);
  encoding.writeInt16LE(value.length * 2);
  var offset = 2;
  encoding.write(value, offset, value.length * 2, "utf16le");
  // TRICKY: swap bytes since buffer only handles little endian, but we expect big endian
  encoding.swap16();
  return encoding;
}

function decode(message) {
  var type = message.readInt16BE(0);
  var messageType = _.findKey(MESSAGE_TYPES, function (val) {
    return val === type;
  });
  
  var result = {};
  if (messageType) {
    var messageDef = messageDefs[messageType];
    var offset = 2;
    _.forEach(messageDef, function (field) {
      var type = field.type;
      var key = field.name;
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
      } else {
        logger.error("Invalid field type: " + type);
      }
    });

    return {
      message: result,
      type: messageType
    };
  }

  return false;
}

function handleMessage(message, remote) {
  if (remote.port === config.get("server:port") && remote.address === config.get("server:host")) {
    var msg = decode(message);
    logger.debug("Decoding message of type \"" + msg.type + "\": " + message.toString("hex"));
    logger.debug("Decoded to: " + JSON.stringify(msg.message));
    if (msg) {
      if (handlers[msg.type]) {
        handlers[msg.type](msg.message);
      } else {
        logger.warn("No handler for message of type: \"" + msg.type + "\"");
      }
    } else {
      logger.warn("Invalid or unhandled message");
    }
  }
}

function encode(type, message) {
  var encodings = [];

  // Add message type first
  var typeEnc = Buffer.alloc(2);
  typeEnc.writeInt16BE(MESSAGE_TYPES[type]);
  encodings.push(typeEnc);

  var messageDef = messageDefs[type];
  _.forEach(messageDef, function (field) {
    var encoding;
    var type = field.type;
    var value = message[field.name];
    if (type === STRING) {
      encoding = get2ByteUnicodeEncoding(value);
    } else if (type === INT) {
      encoding = Buffer.alloc(2);
      encoding.writeInt16BE(value);
    } else if (type === BYTE) {
      encoding = Buffer.alloc(1);
      encoding.writeUInt8(value);
    } else {
      logger.error("Invalid field type: " + type);
    }
    encodings.push(encoding);
  });
  var length = _.sumBy(encodings, "length");

  return Buffer.concat(encodings, length);
}

function sendMessage(type, message) {
  var msg = encode(type, message);
  logger.debug("Encoding message of type \"" + type + "\": " + JSON.stringify(message));
  logger.debug("Encoded to: " + msg.toString("hex"));
  client.send(msg, 0, msg.length, config.get("server:port"), config.get("server:host"),
    function (err, bytes) {
      if (err) {
        logger.error("Failed to send message: " + err);
      }
  });
}

function addHandler(name, cb) {
  handlers[name] = cb;
}

module.exports = {
  addHandler: addHandler,
  handleMessage: handleMessage,
  sendMessage: sendMessage,
  encode: encode,
  decode: decode
};
