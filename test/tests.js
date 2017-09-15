const chai = require("chai");
const mocha = require("mocha");
const sinon = require("sinon");
const expect = chai.expect;

const client = require("../client");

describe("Encoding", function () {
  var newGame = {
    aNum: "a12345678",
    lastName: "Bonar",
    firstName: "Brett",
    alias: "BrettB"
  };
  var gameDef = {
    id: 9,
    hint: "__________",
    definition: "double brooded"
  };
  var answer = {
    id: 10,
    result: 1,
    score: 93,
    hint: "gamin"
  };

  var encodedNewGame = Buffer.from("00010012004100300032003100390035003800360032000a0042006f006e00610072000a00420072006500740074000c004200720065007400740042", "hex");
  var encodedGameDef = Buffer.from("000200090014005f005f005f005f005f005f005f005f005f005f001c0064006f00750062006c0065002000620072006f006f006400650064", "hex");
  var encodedAnswer = Buffer.from("0004000a01005d000a00670061006d0069006e", "hex");

  it("encodes and decodes", function * () {
    var encoded1 = client.encode("startGame", newGame);
    var decoded1 = client.decode(encoded1);
    var encoded2 = client.encode("gameDef", gameDef);
    var decoded2 = client.decode(encoded2);
    var encoded3 = client.encode("answer", answer);
    var decoded3 = client.decode(encoded3);

    expect(encoded1).to.eql(encodedNewGame);
    expect(encoded2).to.eql(encodedGameDef);
    expect(encoded3).to.eql(encodedAnswer);
    expect(decoded1).to.eql(newGame);
    expect(decoded2).to.eql(gameDef);
    expect(decoded3).to.eql(answer);
  })
});
