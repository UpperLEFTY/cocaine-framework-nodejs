
var CALL_TIMEOUT = 30000

var __assert = require('assert')
var util = require('util')

var streamingMethod = require('./streaming_method')

var mp = require('msgpack')

var slice = Array.prototype.slice

var debug = require('../../util').debug('co:methods:callback')


function Session(id, cb){
  var _this = this
  this._cb = cb
  this._id = id
  this._owner = null
  this._methodId = undefined
  this._args = null
  this._done = false
  this._chunk = undefined
  this._result = undefined
  this._unpacker = null
  this._callTimer = 0
  this._timeoutHandler = function(){
    __assert(!_this._done)
    _this._done = true
    if(_this._owner){
      _this._owner.removeSession(_this)
      _this._owner = null
    }
    var err = new Error('call timeout')
    _this._cb(err)
  }
  this._resetTimeout()
}

Session.prototype = {
  _resetTimeout: function(){
    clearTimeout(this._callTimer)
    this._callTimer = setTimeout(this._timeoutHandler, CALL_TIMEOUT)
  },
  
  pushChunk: function(chunk){
    debug('chunk for', this._id, chunk)
    __assert(this._chunk === undefined)
    this._chunk = chunk
    var unpacker = this._unpacker || mp.unpack
    this._result = unpacker(chunk)
  },
  pushChoke: function(){
    debug('choke for', this._id)
    __assert(!this._done)
    this._done = true
    this._owner = null
    clearTimeout(this._callTimer)
    if(typeof this._cb !== 'function'){
      __assert(this._result === undefined,
               "typeof this._cb !== 'function' && this._result === undefined")
    } else {
      this._cb(null, this._result)
    }
  },
  pushError: function(code, message) {
    __assert(!this._done)
    this._done = true
    var owner = this._owner
    this._owner = null
    clearTimeout(this._callTimer)
    if(typeof this._cb === 'function'){
      var err = new Error(util.format('%s\n in service %s method %s\n args: %s\n', message, owner._name, this._methodId, util.inspect(this._args)))
      err.code = code
      this._cb(err)
    }
  }
}

module.exports.unpackWith = function(unpacker){
  return function(mid){
    return function(){
      debug('================ unpackWith, calling method %s', mid)
      __assert(this._state === 'connected')
      var args = slice.call(arguments)
      var sid = this.__sid++
      if(0 < args.length){
        var cb = args[args.length-1]
        if(typeof cb === 'function'){
          args.pop()
          var S = new Session(sid, cb)
          S._unpacker = unpacker
          S._owner = this
          S._args = args
          S._methodId = mid
          this._sessions[sid] = S
        }
      }
      this.send([mid, sid, args])
    }
  }
}

module.exports.unpacking = function(mid){
  return function(){
    debug('================ unpacking, calling method %s', mid)
    __assert(this._state === 'connected')
    var args = slice.call(arguments)
    var sid = this.__sid++
    if(0 < args.length){
      var cb = args[args.length-1]
      if(typeof cb === 'function'){
        args.pop()
        var S = new Session(sid, cb)
        S._owner = this
        S._args = args
        S._methodId = mid
        this._sessions[sid] = S
      }
    }
    this.send([mid, sid, args])
  }
}

module.exports.streaming = streamingMethod
