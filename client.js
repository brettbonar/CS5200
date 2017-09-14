"use strict";

const config = require("config");
const dgram = require("dgram");
const logger = require("./logger").getLogger("messaging");
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

var client = dgram.createSocket("udp4");
client.on("message", handleMessage);
var settings = config.get("server");

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
    _.forEach(messageDef, function (type, key) {
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
  if (remote.port === settings.port && remote.address === settings.host) {
    var msg = decode(message);
    logger.debug("Decoding message of type \"" + msg.type + "\": " + message);
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
  _.forEach(messageDef, function (type, key) {
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
  logger.debug("Encoding message of type \"" + type + "\": " + msg);
  client.send(msg, 0, msg.length, settings.port, settings.host, function (err, bytes) {
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
