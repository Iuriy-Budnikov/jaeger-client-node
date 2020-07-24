'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();
// Copyright (c) 2016 Uber Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except
// in compliance with the License. You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under the License
// is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
// or implied. See the License for the specific language governing permissions and limitations under
// the License.

var _dgram = require('dgram');

var _dgram2 = _interopRequireDefault(_dgram);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _thriftrw = require('thriftrw');

var _logger = require('../logger');

var _logger2 = _interopRequireDefault(_logger);

var _sender_utils = require('./sender_utils');

var _sender_utils2 = _interopRequireDefault(_sender_utils);

var _util = require('../util');

var _util2 = _interopRequireDefault(_util);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var HOST = 'localhost';
var PORT = 6832;
var SOCKET_TYPE = 'udp4';
var UDP_PACKET_MAX_LENGTH = 65000;

var UDPSender = function () {
  // size of currently batched spans as Thrift bytes

  function UDPSender() {
    var _this = this;

    var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

    _classCallCheck(this, UDPSender);

    this._host = options.host || HOST;
    this._port = options.port || PORT;
    this._socketType = options.socketType || SOCKET_TYPE;
    this._maxPacketSize = options.maxPacketSize || UDP_PACKET_MAX_LENGTH;
    this._logger = options.logger || new _logger2.default();
    this._client = _dgram2.default.createSocket(this._socketType);
    this._client.on('error', function (err) {
      _this._logger.error('error sending spans over UDP: ' + err);
    });
    this._agentThrift = new _thriftrw.Thrift({
      entryPoint: _path2.default.join(__dirname, '../thriftrw-idl/agent.thrift'),
      allowOptionalArguments: true,
      allowFilesystemAccess: true
    });
    this._jaegerThrift = new _thriftrw.Thrift({
      source: '# Copyright (c) 2016 Uber Technologies, Inc.\n' + '#\n' + '# Permission is hereby granted, free of charge, to any person obtaining a copy\n' + '# of this software and associated documentation files (the "Software"), to deal\n' + '# in the Software without restriction, including without limitation the rights\n' + '# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell\n' + '# copies of the Software, and to permit persons to whom the Software is\n' + '# furnished to do so, subject to the following conditions:\n' + '#\n' + '# The above copyright notice and this permission notice shall be included in\n' + '# all copies or substantial portions of the Software.\n' + '#\n' + '# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n' + '# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n' + '# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\n' + '# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n' + '# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\n' + '# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN\n' + '# THE SOFTWARE.\n' + '\n' + 'namespace java com.uber.jaeger.thriftjava\n' + '\n' + '# TagType denotes the type of a Tag\'s value.\n' + 'enum TagType { STRING, DOUBLE, BOOL, LONG, BINARY }\n' + '\n' + '# Tag is a basic strongly typed key/value pair. It has been flattened to reduce the use of pointers in golang\n' + 'struct Tag {\n' + '  1: required string  key\n' + '  2: required TagType vType\n' + '  3: optional string  vStr\n' + '  4: optional double  vDouble\n' + '  5: optional bool    vBool\n' + '  6: optional i64     vLong\n' + '  7: optional binary  vBinary\n' + '}\n' + '\n' + '# Log is a timed even with an arbitrary set of tags.\n' + 'struct Log {\n' + '  1: required i64       timestamp\n' + '  2: required list<Tag> fields\n' + '}\n' + '\n' + 'enum SpanRefType { CHILD_OF, FOLLOWS_FROM }\n' + '\n' + '# SpanRef describes causal relationship of the current span to another span (e.g. \'child-of\')\n' + 'struct SpanRef {\n' + '  1: required SpanRefType refType\n' + '  2: required i64         traceIdLow\n' + '  3: required i64         traceIdHigh\n' + '  4: required i64         spanId\n' + '}\n' + '\n' + '# Span represents a named unit of work performed by a service.\n' + 'struct Span {\n' + '  1:  required i64           traceIdLow   # the least significant 64 bits of a traceID\n' + '  2:  required i64           traceIdHigh  # the most significant 64 bits of a traceID; 0 when only 64bit IDs are used\n' + '  3:  required i64           spanId       # unique span id (only unique within a given trace)\n' + '  4:  required i64           parentSpanId # since nearly all spans will have parents spans, CHILD_OF refs do not have to be explicit\n' + '  5:  required string        operationName\n' + '  6:  optional list<SpanRef> references   # causal references to other spans\n' + '  7:  required i32           flags        # a bit field used to propagate sampling decisions. 1 signifies a SAMPLED span, 2 signifies a DEBUG span.\n' + '  8:  required i64           startTime\n' + '  9:  required i64           duration\n' + '  10: optional list<Tag>     tags\n' + '  11: optional list<Log>     logs\n' + '}\n' + '\n' + '# Process describes the traced process/service that emits spans.\n' + 'struct Process {\n' + '  1: required string    serviceName\n' + '  2: optional list<Tag> tags\n' + '}\n' + '\n' + '# Batch is a collection of spans reported out of process.\n' + 'struct Batch {\n' + '  1: required Process    process\n' + '  2: required list<Span> spans\n' + '}\n' + '\n' + '# BatchSubmitResponse is the response on submitting a batch. \n' + 'struct BatchSubmitResponse {\n' + '    1: required bool ok   # The Collector\'s client is expected to only log (or emit a counter) when not ok equals false\n' + '}\n' + '\n' + 'service Collector  {\n' + '    list<BatchSubmitResponse> submitBatches(1: list<Batch> batches)\n' + '}\n',
      allowOptionalArguments: true
    });
    this._totalSpanBytes = 0;
  } // maxPacketSize - (batch + tags overhead)


  _createClass(UDPSender, [{
    key: '_calcBatchSize',
    value: function _calcBatchSize(batch) {
      return this._agentThrift.Agent.emitBatch.argumentsMessageRW.byteLength(this._convertBatchToThriftMessage()).length;
    }
  }, {
    key: '_calcSpanSize',
    value: function _calcSpanSize(span) {
      return this._jaegerThrift.Span.rw.byteLength(new this._jaegerThrift.Span(span));
    }
  }, {
    key: 'setProcess',
    value: function setProcess(process) {
      // This function is only called once during reporter construction, and thus will
      // give us the length of the batch before any spans have been added to the span
      // list in batch.
      this._process = process;
      this._batch = {
        process: this._process,
        spans: []
      };

      this._thriftProcessMessage = _sender_utils2.default.convertProcessToThrift(this._jaegerThrift, process);
      this._emitSpanBatchOverhead = this._calcBatchSize(this._batch);
      this._maxSpanBytes = this._maxPacketSize - this._emitSpanBatchOverhead;
    }
  }, {
    key: 'append',
    value: function append(span, callback) {
      var _this2 = this;

      var _calcSpanSize2 = this._calcSpanSize(span),
          err = _calcSpanSize2.err,
          length = _calcSpanSize2.length;

      if (err) {
        _sender_utils2.default.invokeCallback(callback, 1, 'error converting span to Thrift: ' + err);
        return;
      }
      var spanSize = length;
      if (spanSize > this._maxSpanBytes) {
        _sender_utils2.default.invokeCallback(callback, 1, 'span size ' + spanSize + ' is larger than maxSpanSize ' + this._maxSpanBytes);
        return;
      }

      if (this._totalSpanBytes + spanSize <= this._maxSpanBytes) {
        this._batch.spans.push(span);
        this._totalSpanBytes += spanSize;
        if (this._totalSpanBytes < this._maxSpanBytes) {
          // still have space in the buffer, don't flush it yet
          _sender_utils2.default.invokeCallback(callback, 0);
          return;
        }
        // buffer size === this._maxSpanBytes
        this.flush(callback);
        return;
      }

      this.flush(function (numSpans, err) {
        // TODO theoretically we can have buffer overflow here too, if many spans were appended during flush()
        _this2._batch.spans.push(span);
        _this2._totalSpanBytes += spanSize;
        _sender_utils2.default.invokeCallback(callback, numSpans, err);
      });
    }
  }, {
    key: 'flush',
    value: function flush(callback) {
      var numSpans = this._batch.spans.length;
      if (!numSpans) {
        _sender_utils2.default.invokeCallback(callback, 0);
        return;
      }

      var bufferLen = this._totalSpanBytes + this._emitSpanBatchOverhead;
      var thriftBuffer = _util2.default.newBuffer(bufferLen);
      var writeResult = this._agentThrift.Agent.emitBatch.argumentsMessageRW.writeInto(this._convertBatchToThriftMessage(), thriftBuffer, 0);
      this._reset();

      if (writeResult.err) {
        _sender_utils2.default.invokeCallback(callback, numSpans, 'error writing Thrift object: ' + writeResult.err);
        return;
      }

      // Having the error callback here does not prevent uncaught exception from being thrown,
      // that's why in the constructor we also add a general on('error') handler.
      this._client.send(thriftBuffer, 0, thriftBuffer.length, this._port, this._host, function (err, sent) {
        if (err) {
          var error = err && 'error sending spans over UDP: ' + err + ', packet size: ' + writeResult.offset + ', bytes sent: ' + sent;
          _sender_utils2.default.invokeCallback(callback, numSpans, error);
        } else {
          _sender_utils2.default.invokeCallback(callback, numSpans);
        }
      });
    }
  }, {
    key: '_convertBatchToThriftMessage',
    value: function _convertBatchToThriftMessage() {
      var spanMessages = [];
      for (var i = 0; i < this._batch.spans.length; i++) {
        var span = this._batch.spans[i];
        spanMessages.push(new this._jaegerThrift.Span(span));
      }

      return new this._agentThrift.Agent.emitBatch.ArgumentsMessage({
        version: 1,
        id: 0,
        body: {
          batch: new this._jaegerThrift.Batch({
            process: this._thriftProcessMessage,
            spans: spanMessages
          })
        }
      });
    }
  }, {
    key: '_reset',
    value: function _reset() {
      this._batch.spans = [];
      this._totalSpanBytes = 0;
    }
  }, {
    key: 'close',
    value: function close() {
      this._client.close();
    }
  }]);

  return UDPSender;
}();

exports.default = UDPSender;
//# sourceMappingURL=udp_sender.js.map