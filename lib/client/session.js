
var util = require('util')
var __assert = require('assert')
var EventEmitter = require('events').EventEmitter

var graph = require('./graph')
var __stop = graph.__stop
var rxFacets = graph.rxFacets, txFacets = graph.txFacets


var trace = 0


function Session(sid, txGraph, rxGraph){

  this._id = sid
  this._owner = null

  var rxFacet = rxFacets(rxGraph)
  var txFacet = txFacets(txGraph)

  trace && console.log('rxFacet', util.inspect(rxFacet, {depth:null}))
  trace && console.log('txFacet', util.inspect(txFacet, {depth:null}))

  this._rxMethod = rxFacet.method
  this._rxTransition = rxFacet.transition

  this._txMethod = txFacet.method
  this._txTransition = txFacet.transition

  this._handlers = []

  this.send = null

  this._makeSendMethods(txFacet)
  
}

Session.prototype = {
  __proto__: EventEmitter.prototype,

  _send: function(m){
    trace && console.log('send', util.inspect(m,{depth:null}))
    this._owner._send(m)
  },

  _sendTransition: function(methodName){
    var txFacet = this._txTransition[methodName]
    __assert(txFacet !== null)

    if(txFacet === __stop){
      trace && console.log('stop!', new Error().stack)
      this._txMethod = undefined
      this._txTransition = undefined
      this.send = undefined
    } else {
      var method = txFacet.method
      var transition = txFacet.transition

      this._txMethod = method
      this._txTransition = transition

      if(method){
        this._makeSendMethods(txFacet)
      }
    }
  },

  _makeSendMethods: function(txFacet){
    var self = this
    var method = txFacet.method
    
    self.send = {}

    Object.keys(method).some(function(methodName){
      var methodId = method[methodName]
      
      self.send[methodName] = function(){

        if(self._txTransition[methodName] !== null){
          self._sendTransition(methodName)
        }
        
        var args = Array.prototype.slice.apply(arguments)
        self._send([self._id, methodId, args])
      }
    })
  },

  _call: function(methodName, args){
    __assert(methodName in this._txMethod)

    var mid = this._txMethod[methodName]

    if(this._txTransition[methodName] !== null){
      this._sendTransition(methodName)
    }

    this._send([this._id, mid, args])
  },
  
  recv: function(handlers){

    var self = this

    var method = this._rxMethod
    this._handlers = []
    
    Object.keys(handlers).some(function(handlerName){
      var handler = handlers[handlerName]
      if(handlerName in method){
        self._handlers[method[handlerName]] = handler
      }
    })

  },

  push: function(m){
    //trace && console.log('push', m)
    var sid = m[0], mid = m[1], args = m[2]
    __assert(sid === this._id, util.format('sid === this._id, %s === %s', this._id, sid))

    var handler = this._handlers[mid]

    // switch to next rxFacet
    if(this._rxTransition[mid] !== null){
      // trace && console.log('mid, rxTransition', mid, util.inspect(this._rxTransition, {depth: null}))
      var facet = this._rxTransition[mid]
      this._rxTransition = facet.transition
      this._rxMethod = facet.method
      this._handlers = []
      if(facet === __stop){
        this._disown()
      }
    }
    
    if(typeof handler === 'function'){
      return handler.apply(this, args)
    }

  },

  _disown: function(){
    if(this._owner){
      this._owner.clearSession(this._id)
      this._owner = null
    }
  },

  error: function(err){
    this.emit('error', err)
    this._disown()
  }

}

module.exports.Session = Session


